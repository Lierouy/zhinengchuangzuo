import { Check, CopyIcon, FileInput, Trash } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useApp } from '../../contexts/app-context'
import { ChatAssistantMessage, ChatUserMessage } from '../../types/chat'
import { MentionableBlock, MentionableImage } from '../../types/mentionable'
import { ContentPart } from '../../types/request'

import { editorStateToPlainText } from './../chat-input/editor-state-to-plain-text'
import AssistantMessageReasoning from './AssistantMessageReasoning'
import LLMResponseInfoPopover from './LLMResponseInfoPopover'
import { ObsidianMarkdown } from './ObsidianMarkdown'
import { SelectedBlockFold } from './SelectedBlockFold'

export type UserMessageItemProps = {
  message: ChatUserMessage | ChatAssistantMessage
  onDelete?: (id: string) => void
  isLoading?: boolean
}

export default function UserMessageItem({
  message,
  onDelete,
  isLoading,
}: UserMessageItemProps) {
  const app = useApp()
  const [copied, setCopied] = useState(false)
  const [written, setWritten] = useState(false)

  const contentParts = useMemo(() => {
    if (message.role === 'user') {
      // 用户消息：从 mentionables 中提取图片，文本部分使用原始 content
      const text =
        typeof message.content === 'string'
          ? message.content
          : message.content
            ? editorStateToPlainText(message.content)
            : ''
      // 把 @文件名 替换为 Obsidian 内部链接 [[文件名]]，只替换 @ 前面是空格/行首的情况
      const textWithInternalLinks = text.replace(/(^|\s)@([^\s]+)/g, '$1[[$2]]')

      // 从 mentionables 提取图片，始终可用，不会因为 promptContent 清空而丢失
      const images = message.mentionables
        .filter((m): m is MentionableImage => m.type === 'image')
        .map(
          (img): ContentPart => ({
            type: 'image_url',
            image_url: { url: img.data },
          }),
        )

      // 图片在前，文本在后
      return [
        ...images,
        { type: 'text', text: textWithInternalLinks } as ContentPart,
      ]
    }
    // 助手消息用 contentString
    const text =
      typeof message.content === 'string'
        ? message.content
        : message.content
          ? editorStateToPlainText(message.content)
          : ''
    return [{ type: 'text', text } as ContentPart]
  }, [message])

  const contentString = useMemo(() => {
    return contentParts
      .filter((part) => part.type === 'text')
      .map((part) => ('text' in part ? part.text : ''))
      .join('')
      .replace(/\n+$/, '') // 去除末尾空行
  }, [contentParts])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(contentString)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleWrite = async () => {
    const activeFile = app.workspace.getActiveFile()
    if (!activeFile) return
    await app.vault.append(activeFile, '\n' + contentString + '\n')
    setWritten(true)
    setTimeout(() => setWritten(false), 1500)
  }

  // For assistant messages, extract usage info for the popover
  const usage =
    message.role === 'assistant' && message.metadata?.usage
      ? message.metadata.usage
      : null
  const modelName =
    message.role === 'assistant' && message.metadata?.model
      ? message.metadata.model
      : null

  // 过滤出选中的文本块
  const selectedBlocks = useMemo(() => {
    if (message.role !== 'user') return []
    return message.mentionables.filter(
      (m): m is MentionableBlock => m.type === 'block',
    )
  }, [message])

  return (
    <div
      className={
        message.role === 'user'
          ? 'zncz-chat-messages-user'
          : 'zncz-chat-messages-assistant'
      }
    >
      {message.role === 'user' ? (
        <div className="zncz-user-message-content">
          {/* 渲染选中的文本折叠块 */}
          {selectedBlocks.map((block, index) => (
            <SelectedBlockFold key={`block-${index}`} block={block} />
          ))}

          {contentParts.map((part, index) => {
            if (part.type === 'text' && 'text' in part && part.text) {
              return (
                <ObsidianMarkdown key={index} content={part.text} scale="sm" />
              )
            } else if (part.type === 'image_url' && 'image_url' in part) {
              return (
                <img
                  key={index}
                  src={part.image_url.url}
                  alt="User uploaded image"
                  className="zncz-user-message-image"
                />
              )
            }
            return null
          })}
        </div>
      ) : (
        <div className="zncz-assistant-message-content">
          {message.reasoning && (
            <AssistantMessageReasoning
              reasoning={message.reasoning}
              _hasContentStarted={contentString.length > 0}
            />
          )}
          <ObsidianMarkdown content={contentString} scale="sm" />
        </div>
      )}
      <div className="zncz-assistant-message-actions">
        {message.role === 'assistant' && (
          <button
            onClick={written ? undefined : handleWrite}
            className="clickable-icon"
            disabled={isLoading}
            aria-label="添加"
          >
            {written ? <Check size={12} /> : <FileInput size={12} />}
          </button>
        )}
        {message.role === 'assistant' && (
          <div
            style={
              isLoading ? { pointerEvents: 'none', opacity: 0.7 } : undefined
            }
            aria-label="详情"
          >
            <LLMResponseInfoPopover usage={usage} model={modelName} />
          </div>
        )}
        {onDelete && (
          <button
            onClick={() => onDelete(message.id)}
            className="clickable-icon"
            disabled={isLoading}
            aria-label="删除"
          >
            <Trash size={12} />
          </button>
        )}
        <button
          onClick={copied ? undefined : handleCopy}
          className="clickable-icon"
          disabled={isLoading}
          aria-label="复制"
        >
          {copied ? <Check size={12} /> : <CopyIcon size={12} />}
        </button>
      </div>
    </div>
  )
}
