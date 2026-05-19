import {
  Editor,
  MarkdownFileInfo,
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  normalizePath,
} from 'obsidian'

import { ChatView } from './ChatView'
import { ChatProps } from './components/chat-view/Chat'
import { CHAT_VIEW_TYPE } from './constants'
import { ROOT_DIR } from './database/constants'
import {
  ZhinengchuangzuoSettings,
  zhinengchuangzuoSettingsSchema,
} from './settings/schema/setting.types'
import { parseZhinengchuangzuoSettings } from './settings/schema/settings'
import { ZhinengchuangzuoSettingTab } from './settings/SettingTab'
import { getMentionableBlockData, readTFileContent } from './utils/obsidian'

export default class ZhinengchuangzuoPlugin extends Plugin {
  settings!: ZhinengchuangzuoSettings
  initialChatProps?: ChatProps // TODO: change this to use view state like ApplyView
  settingsChangeListeners: ((newSettings: ZhinengchuangzuoSettings) => void)[] =
    []
  private handleInProgress = false

  private get settingsFilePath(): string {
    return normalizePath(`${ROOT_DIR}/config.json`)
  }

  async onload() {
    await this.loadSettings()

    this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this))

    // This creates an icon in the left ribbon.
    this.addRibbonIcon('brain', '智能创作', () => this.openChatView())

    // This adds a simple command that can be triggered anywhere
    this.addCommand({
      id: 'open-new-chat',
      name: '开启助手会话',
      callback: () => this.openChatView(false),
    })

    this.addCommand({
      id: 'add-selection-to-chat',
      name: '添加选中文本到会话',
      editorCallback: (
        editor: Editor,
        ctx: MarkdownView | MarkdownFileInfo,
      ) => {
        this.addSelectionToChat(editor, ctx as MarkdownView)
      },
    })

    // Command: Handle current file
    this.addCommand({
      id: 'handle-current-file',
      name: '单独处理当前文件',
      callback: async () => {
        if (this.handleInProgress) return
        this.handleInProgress = true

        try {
          // Use the workspace's active file only. If there is no active file,
          // the user has closed or not selected a file — do not attempt to handle.
          const file = this.app.workspace.getActiveFile()
          if (!file) {
            new Notice('No open files are available for handle')
            return
          }
          const fileContent = await readTFileContent(file, this.app.vault)

          // Collect linked files referenced from this file (one-level only)
          const MAX_LINKS = this.settings.handleMaxLinks ?? 20
          const MAX_CHARS = this.settings.handleMaxChars ?? 300000

          // Only parse Obsidian internal wiki links ([[...]]), preserve order
          const wikiRe = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g

          type Candidate = { raw: string; index: number }
          const candidates: Candidate[] = []

          let m: RegExpExecArray | null
          while ((m = wikiRe.exec(fileContent))) {
            candidates.push({ raw: m[1].trim(), index: m.index })
          }

          // Raw-level dedup by link text (exclude ./ prefix difference)
          // before sorting, to avoid redundant parsing of duplicate links
          const seenRaw = new Set<string>()
          const uniqueCandidates: { raw: string; index: number }[] = []
          for (const c of candidates) {
            const key = c.raw.replace(/^\.\//, '')
            if (!seenRaw.has(key)) {
              seenRaw.add(key)
              uniqueCandidates.push(c)
            }
          }

          // Preserve appearance order
          uniqueCandidates.sort((a, b) => a.index - b.index)

          const resolvedFiles: TFile[] = []

          for (const c of uniqueCandidates) {
            if (resolvedFiles.length >= MAX_LINKS) break
            const linkRaw = c.raw
            const linkPath = linkRaw.replace(/^\.\//, '')

            // Try Obsidian resolution relative to current file
            const dest = this.app.metadataCache.getFirstLinkpathDest(
              linkPath,
              file.path,
            )

            let target: TFile | null = null
            if (dest instanceof TFile) {
              target = dest
            }

            if (!target) {
              const maybe = this.app.vault.getAbstractFileByPath(linkPath)
              if (maybe instanceof TFile) target = maybe
              else {
                const maybeMd = this.app.vault.getAbstractFileByPath(
                  linkPath.endsWith('.md') ? linkPath : `${linkPath}.md`,
                )
                if (maybeMd instanceof TFile) target = maybeMd
              }
            }

            if (
              target &&
              target.path !== file.path &&
              target.extension === 'md'
            ) {
              resolvedFiles.push(target)
            }
          }

          // Step 1: if the main file alone exceeds the character limit, abort.
          if (fileContent.length > MAX_CHARS) {
            new Notice(
              'The current file content exceeds the character limit and cannot be sent',
            )
            return
          }

          // Step 2: read linked files one by one in order, stopping once the
          // accumulated total would exceed MAX_CHARS.
          const linkedContents: string[] = []
          const includedFiles: TFile[] = []
          const droppedFiles: TFile[] = []
          let runningTotal = fileContent.length

          for (const f of resolvedFiles) {
            const content = await readTFileContent(f, this.app.vault)
            if (runningTotal + content.length > MAX_CHARS) {
              droppedFiles.push(f)
            } else {
              linkedContents.push(content)
              includedFiles.push(f)
              runningTotal += content.length
            }
          }

          if (droppedFiles.length > 0) {
            new Notice(
              `Some associated files have been excluded because they exceed the character limit ${MAX_CHARS}`,
            )
          }

          // Build combined content preserving main file first and linked files in order
          let combined = `<file>\n<title>当前文件: ${file.path}</title>\n<body>\n${fileContent}\n</body>\n</file>\n`
          for (let i = 0; i < includedFiles.length; i++) {
            combined += `\n<file>\n<title>${includedFiles[i].path}</title>\n<body>\n${linkedContents[i]}\n</body>\n</file>\n`
          }

          const chatModel = this.settings.chatModels.find(
            (m) => m.model === this.settings.chatModelId,
          )
          if (!chatModel) {
            new Notice(
              'Please configure the session model, select a session model in the settings',
            )
            return
          }

          const provider = this.settings.providers.find(
            (p) => p.id === chatModel.providerId,
          )
          if (!provider) {
            new Notice('The provider for this model is not configured')
            return
          }

          // Ensure chat view exists and bring it to foreground (open new chat if necessary)
          let leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)
          const existingLeaf =
            leaves.length > 0 && leaves[0].view instanceof ChatView
              ? leaves[0]
              : null

          if (!existingLeaf) {
            await this.openChatView(true)
            leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)
          } else {
            await this.app.workspace.revealLeaf(existingLeaf)
          }

          if (leaves.length > 0 && leaves[0].view instanceof ChatView) {
            await leaves[0].view.startHandleStream(combined)
          }
        } catch (e) {
          console.error('Failed to handle file', e)
          new Notice('Handle failed, please check console logs')
        } finally {
          this.handleInProgress = false
        }
      },
    })

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new ZhinengchuangzuoSettingTab(this.app, this))
  }

  onunload() {}

  // Save settings in user_data folder instead of plugin root
  async loadData(): Promise<Record<string, unknown>> {
    const filePath = this.settingsFilePath
    try {
      if (!(await this.app.vault.adapter.exists(filePath))) {
        return {}
      }
      const content = await this.app.vault.adapter.read(filePath)
      return JSON.parse(content) as Record<string, unknown>
    } catch (e) {
      console.error('Failed to load settings', e)
      return {}
    }
  }

  async saveData(data: Record<string, unknown>): Promise<void> {
    const filePath = this.settingsFilePath

    // Ensure directory exists
    const parts = filePath.split('/').filter(Boolean)
    let currentPath = ''
    for (const part of parts.slice(0, -1)) {
      currentPath = currentPath ? `${currentPath}/${part}` : part
      if (!(await this.app.vault.adapter.exists(currentPath))) {
        await this.app.vault.adapter.mkdir(currentPath)
      }
    }

    const content = JSON.stringify(data, null, 2)
    await this.app.vault.adapter.write(filePath, content)
  }

  async loadSettings() {
    this.settings = parseZhinengchuangzuoSettings(await this.loadData())
    await this.saveData(this.settings) // Save updated settings
  }

  async setSettings(newSettings: ZhinengchuangzuoSettings) {
    const validationResult =
      zhinengchuangzuoSettingsSchema.safeParse(newSettings)

    if (!validationResult.success) {
      new Notice(`Invalid settings:
${validationResult.error.issues.map((v) => v.message).join('\n')}`)
      return
    }

    this.settings = newSettings
    await this.saveData(newSettings)
    this.settingsChangeListeners.forEach((listener) => listener(newSettings))
  }

  addSettingsChangeListener(
    listener: (newSettings: ZhinengchuangzuoSettings) => void,
  ) {
    this.settingsChangeListeners.push(listener)
    return () => {
      this.settingsChangeListeners = this.settingsChangeListeners.filter(
        (l) => l !== listener,
      )
    }
  }

  async openChatView(openNewChat = false) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView)
    const editor = view?.editor
    if (!view || !editor) {
      this.activateChatView(undefined, openNewChat)
      return
    }
    const selectedBlockData = await getMentionableBlockData(editor, view)
    this.activateChatView(
      {
        selectedBlock: selectedBlockData ?? undefined,
      },
      openNewChat,
    )
  }

  async activateChatView(chatProps?: ChatProps, openNewChat = false) {
    // chatProps is consumed in ChatView.tsx
    this.initialChatProps = chatProps

    let leaf = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0]

    await (leaf ?? this.app.workspace.getRightLeaf(false))?.setViewState({
      type: CHAT_VIEW_TYPE,
      active: true,
    })

    // Re-acquire after setViewState (React may have remounted the component)
    leaf = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0]

    if (openNewChat && leaf && leaf.view instanceof ChatView) {
      leaf.view.openNewChat(chatProps?.selectedBlock)
    }

    this.app.workspace.revealLeaf(
      this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0],
    )
  }

  async addSelectionToChat(editor: Editor, view: MarkdownView) {
    const data = await getMentionableBlockData(editor, view)
    if (!data) return

    const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)
    if (leaves.length === 0 || !(leaves[0].view instanceof ChatView)) {
      await this.activateChatView({
        selectedBlock: data,
      })
      return
    }

    // bring leaf to foreground (uncollapse sidebar if it's collapsed)
    await this.app.workspace.revealLeaf(leaves[0])

    const chatView = leaves[0].view
    chatView.addSelectionToChat(data)
    chatView.focusMessage()
  }
}
