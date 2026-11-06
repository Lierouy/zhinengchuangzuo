import { App, TFile } from 'obsidian'

import { editorStateToPlainText } from '../../components/chat-input/editor-state-to-plain-text'
import { ContextManager } from '../../database/context/ContextManager'
import { PromptItem } from '../../database/context/types'
import { ZhinengchuangzuoSettings } from '../../settings/schema/setting.types'
import {
  ChatAssistantMessage,
  ChatMessage,
  ChatUserMessage,
} from '../../types/chat'
import { MentionableBlock, MentionableImage } from '../../types/mentionable'
import { ContentPart, RequestMessage } from '../../types/request'
import { getNestedFiles, readMultipleTFiles } from '../obsidian'

export class PromptGenerator {
  private app: App
  private settings: ZhinengchuangzuoSettings
  private contextManager: ContextManager
  private MAX_CONTEXT_MESSAGES = 50

  constructor(
    app: App,
    settings: ZhinengchuangzuoSettings,
    contextManager?: ContextManager,
  ) {
    this.app = app
    this.settings = settings
    // Injectable so callers can share one manager instead of creating a new
    // one per request.
    this.contextManager = contextManager ?? new ContextManager(app)
  }

  public async generateRequestMessages({
    messages,
    contextCount,
  }: {
    messages: ChatMessage[]
    contextCount?: number
  }): Promise<RequestMessage[]> {
    // Determine how many past messages to include
    const take =
      typeof contextCount === 'number'
        ? contextCount
        : this.MAX_CONTEXT_MESSAGES

    // Only process the last `take` messages to avoid unnecessary I/O
    // (compiling files/images for messages that won't be sent is wasteful)
    const relevantMessages = messages.slice(-take)

    // Find last user message and extract currentFile
    let lastUserIndex = -1
    for (let i = relevantMessages.length - 1; i >= 0; i--) {
      if (relevantMessages[i].role === 'user') {
        lastUserIndex = i
        break
      }
    }
    let matchingText = ''

    const lastUserMsg =
      lastUserIndex >= 0
        ? (relevantMessages[lastUserIndex] as ChatUserMessage)
        : undefined
    const currentFileRaw = lastUserMsg?.mentionables.find(
      (m) => m.type === 'current-file',
    )?.file
    const currentFile =
      currentFileRaw && this.settings.chatOptions.includeCurrentFileContent
        ? currentFileRaw
        : undefined

    // Collect user message indices for sequential compilation (newest → oldest)
    const userIndices: number[] = []
    for (let i = 0; i < relevantMessages.length; i++) {
      if (relevantMessages[i].role === 'user') {
        userIndices.push(i)
      }
    }

    // Compile user messages sequentially: newest first so seenFiles tracks correctly
    const compiledMessages = [...relevantMessages]
    const seenFiles = new Set<string>()
    for (let idx = userIndices.length - 1; idx >= 0; idx--) {
      const i = userIndices[idx]
      const msg = compiledMessages[i] as ChatUserMessage
      if (!msg.promptContent) {
        const isLatest = idx === userIndices.length - 1
        const { promptContent, matchingText: mt } =
          await this.compileUserMessagePrompt({
            message: msg,
            currentFile: isLatest ? currentFile : undefined,
            seenFiles,
            isLatest,
          })
        if (isLatest) {
          matchingText = mt
        }
        compiledMessages[i] = { ...msg, promptContent }
      }
    }

    const systemMessage = await this.getSystemMessage({ matchingText })

    const requestMessages: RequestMessage[] = [
      ...(systemMessage ? [systemMessage] : []),
      ...this.getChatHistoryMessages({
        messages: compiledMessages,
      }),
    ]

    return requestMessages
  }

  private getChatHistoryMessages({
    messages,
  }: {
    messages: ChatMessage[]
  }): RequestMessage[] {
    // Messages are already pre-sliced to the correct context window;
    // just convert each message to its request format
    const requestMessages: RequestMessage[] = messages.flatMap(
      (message): RequestMessage[] => {
        if (message.role === 'user') {
          const content = message.promptContent
          // Never send an empty user turn: it adds no information and some
          // providers reject it.
          if (!content || (typeof content === 'string' && !content.trim())) {
            return []
          }
          return [{ role: 'user', content }]
        } else if (message.role === 'assistant') {
          return this.parseAssistantMessage({ message })
        }
        return []
      },
    )

    return requestMessages
  }

  private parseAssistantMessage({
    message,
  }: {
    message: ChatAssistantMessage
  }): RequestMessage[] {
    return [
      {
        role: 'assistant',
        content: message.content,
      },
    ]
  }

  public async compileUserMessagePrompt({
    message,
    currentFile,
    seenFiles,
    isLatest,
  }: {
    message: ChatUserMessage
    currentFile?: TFile | null
    seenFiles?: Set<string>
    isLatest: boolean
  }): Promise<{
    promptContent: ChatUserMessage['promptContent']
    matchingText: string
  }> {
    try {
      if (!message.content) {
        return {
          promptContent: null,
          matchingText: '',
        }
      }
      const query = editorStateToPlainText(message.content)
      const MAX_FILE_CHARS =
        this.settings.chatOptions.chatMaxFileChars ?? 100000

      // Step 1.5: Read current-file content (only for latest message)
      let currentFileContent = ''
      if (currentFile) {
        currentFileContent = await this.app.vault.cachedRead(currentFile)
        seenFiles?.add(currentFile.path)
      }

      // Mentions whose target was renamed, moved or deleted keep their path so
      // the model can be told the content is unavailable, instead of silently
      // receiving less than the user originally attached.
      const missingFilePaths: string[] = []
      const missingFolderPaths: string[] = []
      const allFiles: TFile[] = []
      for (const mentionable of message.mentionables) {
        if (mentionable.type === 'file') {
          if (mentionable.file) {
            allFiles.push(mentionable.file)
          } else {
            missingFilePaths.push(mentionable.path)
          }
        } else if (mentionable.type === 'folder') {
          if (mentionable.folder) {
            allFiles.push(...getNestedFiles(mentionable.folder))
          } else {
            missingFolderPaths.push(mentionable.path)
          }
        }
      }

      // Step 1.2: Intra-message dedup by path (first occurrence wins)
      const dedupedFiles: TFile[] = []
      const localSeen = new Set<string>()
      for (const f of allFiles) {
        if (!localSeen.has(f.path)) {
          localSeen.add(f.path)
          dedupedFiles.push(f)
        }
      }

      // Step 1.3 + 1.4: Cross-message dedup + current-file silent drop
      const uniqueFiles: TFile[] = []
      const crossDedupPaths: string[] = []
      const currentFilePath = currentFile?.path

      for (const f of dedupedFiles) {
        // Step 1.3: Already processed by a newer message → annotate
        if (seenFiles?.has(f.path)) {
          crossDedupPaths.push(f.path)
          continue
        }

        // Step 1.4: Same as current-file → silently skip (currentFile already mounted)
        if (currentFilePath && f.path === currentFilePath) {
          continue
        }

        uniqueFiles.push(f)
        seenFiles?.add(f.path)
      }

      // Step 1.5: Missing targets. File resolution is path-based, so every
      // mention of the same path resolves identically within a request: a
      // missing mention can never collide with one that was read successfully.
      // Report it as missing, which is the only useful hint for the model.
      const missingParts: string[] = []

      const reportedFiles = new Set<string>()
      for (const path of missingFilePaths) {
        if (localSeen.has(path) || reportedFiles.has(path)) continue
        reportedFiles.add(path)
        missingParts.push(
          `<file>\n<path>${path}</path>\n<note>(文件缺失)</note>\n</file>\n`,
        )
      }

      // A folder is reported once as a whole; its nested files are unknown
      // because the folder could not be resolved.
      const reportedFolders = new Set<string>()
      for (const path of missingFolderPaths) {
        if (reportedFolders.has(path)) continue
        reportedFolders.add(path)
        missingParts.push(
          `<folder>\n<path>${path}</path>\n<note>(文件夹缺失)</note>\n</folder>\n`,
        )
      }

      const fileContents =
        uniqueFiles.length > 0
          ? await readMultipleTFiles(uniqueFiles, this.app.vault)
          : []

      // Unified char check across currentFile + uniqueFiles
      const totalFileChars =
        currentFileContent.length +
        fileContents.reduce((s, c) => s + c.length, 0)
      if (isLatest && totalFileChars > MAX_FILE_CHARS) {
        throw new Error(
          `The total number of characters in mounted files ${totalFileChars} exceeds the limit ${MAX_FILE_CHARS}`,
        )
      }

      const fileParts: string[] = []

      uniqueFiles.forEach((file, index) => {
        fileParts.push(
          `<file>\n<path>${file.path}</path>\n<body>\n${fileContents[index]}\n</body>\n</file>\n`,
        )
      })
      crossDedupPaths.forEach((path) => {
        fileParts.push(
          `<file>\n<path>${path}</path>\n<note>(重复提及)</note>\n</file>\n`,
        )
      })
      fileParts.push(...missingParts)

      const blocks = message.mentionables.filter(
        (m): m is MentionableBlock => m.type === 'block',
      )
      const blockParts = blocks.map(({ file, content, path }) => {
        // The excerpt text is a snapshot taken when the block was added, so it
        // stays usable even if the file is gone; only the path is stale.
        if (!file) {
          return `<excerpt>\n<note>(原文件缺失)</note>\n<text>\n${content}\n</text>\n</excerpt>\n`
        }
        return `<excerpt>\n<path>${path}</path>\n<text>\n${content}\n</text>\n</excerpt>\n`
      })

      const imageDataUrls = message.mentionables
        .filter((m): m is MentionableImage => m.type === 'image')
        .map(({ data }) => data)

      // 匹配文本 = 用户输入 + 选中块（不包含 filePrompt 和 currentFile 内容）
      const matchingText = `${blocks.map((b) => b.content).join('\n')}\n${query}`

      const textParts = [
        currentFile && currentFileContent
          ? `<file type="用户正在浏览">\n<path>${currentFile.path}</path>\n<body>\n${currentFileContent}\n</body>\n</file>\n`
          : '',
        ...fileParts,
        ...blockParts,
        query,
      ].filter((p) => p.length > 0)

      return {
        promptContent: [
          ...imageDataUrls.map((data): ContentPart => ({
            type: 'image_url',
            image_url: {
              url: data,
            },
          })),
          {
            type: 'text',
            text: textParts.join('\n'),
          },
        ],
        matchingText,
      }
    } catch (error) {
      console.error('Failed to compile user message', error)
      throw error
    }
  }

  private async getSystemMessage({
    matchingText,
  }: {
    matchingText: string
  }): Promise<RequestMessage | null> {
    const { selectedPromptGroupId } = this.settings
    if (!selectedPromptGroupId) return null

    try {
      const group = await this.contextManager.findById(selectedPromptGroupId)
      if (!group) return null

      const prompts = group.prompts
      if (!prompts || prompts.length === 0) return null

      // 第一步：收集符合条件的激活提示（含连带激活）
      const activatedIds = new Set<string>()

      const visitChain = (targetId: string, chain: Set<string>) => {
        if (chain.has(targetId)) return // 防循环
        if (activatedIds.has(targetId)) return // 已激活
        chain.add(targetId)
        const target = prompts.find((p) => p.id === targetId)
        // 目标必须启用 且 开启了条件激活（始终激活的提示由主循环处理，无需连带）
        if (!target?.enabled || !target?.conditionalActivation) return
        activatedIds.add(target.id)
        // 连带激活继续传递
        if (target.chainActivation) {
          visitChain(target.chainActivation, chain)
        }
      }

      for (const item of prompts) {
        if (!item.enabled) continue
        if (activatedIds.has(item.id)) continue

        if (this.isPromptActivated(item, matchingText)) {
          activatedIds.add(item.id)
          // 连带激活
          if (item.chainActivation) {
            const chain = new Set<string>([item.id])
            visitChain(item.chainActivation, chain)
          }
        }
      }

      // 第二步：按 prompts 原始顺序拼接，受激活提示上限约束
      const limit = this.settings.promptActivationLimit ?? 50
      let activatedContents = prompts
        .filter((p) => activatedIds.has(p.id))
        .map((p) => p.content.trim())
        .filter((c) => c.length > 0)

      // 超出上限时，排除靠后的提示（即截断末尾）
      if (limit > 0 && activatedContents.length > limit) {
        activatedContents = activatedContents.slice(0, limit)
      }

      if (activatedContents.length === 0) return null

      return {
        role: 'system',
        content: activatedContents.join('\n'),
      }
    } catch (error) {
      console.error('Failed to load context prompts', error)
      return null
    }
  }

  /**
   * 判断一条提示是否应被激活（不包含连带激活逻辑）
   */
  private isPromptActivated(item: PromptItem, text: string): boolean {
    // 1. 无条件激活（conditionalActivation 未开启）
    if (!item.conditionalActivation) return true

    // 2. 无关键词 → 只能被连带激活，无法通过关键词匹配激活
    const kw = item.keywords
    if (!kw || kw.length === 0) return false

    const lowerText = text.toLowerCase()

    // 3. 关键词匹配（英文不区分大小写，不要求完整单词）
    const keywordMatched = kw.some((k) => lowerText.includes(k.toLowerCase()))
    if (!keywordMatched) return false

    // 4. 无过滤词 → 直接激活
    const fw = item.filterWords
    if (!fw || fw.length === 0) return true

    // 5. 过滤词逻辑判定
    const filterResults = fw.map((f) => lowerText.includes(f.toLowerCase()))

    switch (item.filterLogic ?? 'AND_ANY') {
      case 'AND_ANY':
        return filterResults.some(Boolean)
      case 'AND_ALL':
        return filterResults.every(Boolean)
      case 'NOT_ALL':
        return !filterResults.every(Boolean)
      case 'NOT_ANY':
        return !filterResults.some(Boolean)
      default:
        return filterResults.some(Boolean)
    }
  }
}
