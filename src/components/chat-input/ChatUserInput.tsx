import { LexicalEditor, SerializedEditorState, TextNode } from 'lexical'
import { Notice } from 'obsidian'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

import { useApp } from '../../contexts/app-context'
import {
  Mentionable,
  MentionableImage,
  SerializedMentionable,
} from '../../types/mentionable'
import { $findNodesOfType } from '../../utils/chat/lexical'
import {
  deserializeMentionable,
  getMentionableKey,
  serializeMentionable,
} from '../../utils/chat/mentionable'
import { openMarkdownFile } from '../../utils/obsidian'

import { convertImagesSafely } from './image/reportImageError'
import { ImageUploadButton } from './ImageUploadButton'
import LexicalContentEditable from './LexicalContentEditable'
import { MentionNode } from './mention/MentionNode'
import MentionableBadge from './MentionableBadge'
import { ModelSelect } from './ModelSelect'
import { NodeMutations } from './OnMutationPlugin'
import { SubmitButton } from './SubmitButton'

// 输入框 mentionable 数量上限
const MAX_MENTION_COUNT = 10 // @ 提及文件/文件夹 合计上限
export const MAX_BLOCK_COUNT = 5 // 选中文本块上限
const MAX_IMAGE_COUNT = 5 // 图片上限

export type ChatUserInputRef = {
  focus: () => void
}

export type ChatUserInputProps = {
  initialSerializedEditorState: SerializedEditorState | null
  onChange: (content: SerializedEditorState) => void
  onSubmit: (content: SerializedEditorState) => void | Promise<void>
  onFocus: () => void
  mentionables: Mentionable[]
  setMentionables: (mentionables: Mentionable[]) => void
  autoFocus?: boolean
  /**
   * Asks the input to highlight a mentionable badge. Carries a sequence number
   * so requesting the same key again still re-triggers the highlight.
   */
  highlightRequest?: { key: string; seq: number } | null
  isLoading?: boolean
  onAbort?: () => void
}

const ChatUserInput = forwardRef<ChatUserInputRef, ChatUserInputProps>(
  (
    {
      initialSerializedEditorState,
      onChange,
      onSubmit,
      onFocus,
      mentionables,
      setMentionables,
      autoFocus = false,
      highlightRequest,
      isLoading = false,
      onAbort,
    },
    ref,
  ) => {
    const app = useApp()

    const showImageLimitNotice = useCallback(() => {
      new Notice(`Up to ${MAX_IMAGE_COUNT} images can be added`)
    }, [])

    const editorRef = useRef<LexicalEditor | null>(null)
    const contentEditableRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    // Keep a stable ref to mentionables so handleMentionNodeMutation doesn't
    // need to change on every render, preventing OnMutationPlugin from
    // re-registering its mutation listener (which would drop node events).
    const mentionablesRef = useRef(mentionables)
    mentionablesRef.current = mentionables

    const [displayedMentionableKey, setDisplayedMentionableKey] = useState<
      string | null
    >(highlightRequest?.key ?? null)

    useEffect(() => {
      if (highlightRequest) {
        setDisplayedMentionableKey(highlightRequest.key)
      }
    }, [highlightRequest])

    useImperativeHandle(ref, () => ({
      focus: () => {
        contentEditableRef.current?.focus()
      },
    }))

    const handleMentionNodeMutation = useCallback(
      (mutations: NodeMutations<MentionNode>) => {
        const currentMentionables = mentionablesRef.current
        const destroyedMentionableKeys = new Set<string>()
        const addedMentionables: SerializedMentionable[] = []
        mutations.forEach((mutation) => {
          const mentionable = mutation.node.getMentionable()
          const mentionableKey = getMentionableKey(mentionable)

          if (mutation.mutation === 'destroyed') {
            const nodeWithSameMentionable = editorRef.current?.read(() =>
              $findNodesOfType(MentionNode).find(
                (node) =>
                  getMentionableKey(node.getMentionable()) === mentionableKey,
              ),
            )

            if (!nodeWithSameMentionable) {
              // remove mentionable only if it's not present in the editor state
              destroyedMentionableKeys.add(mentionableKey)
            }
          } else if (mutation.mutation === 'created') {
            if (
              currentMentionables.some(
                (m) =>
                  getMentionableKey(serializeMentionable(m)) === mentionableKey,
              ) ||
              addedMentionables.some(
                (m) => getMentionableKey(m) === mentionableKey,
              )
            ) {
              // do nothing if mentionable is already added
              return
            }

            addedMentionables.push(mentionable)
          }
        })

        setMentionables(
          currentMentionables
            .filter(
              (m) =>
                !destroyedMentionableKeys.has(
                  getMentionableKey(serializeMentionable(m)),
                ),
            )
            .concat(
              addedMentionables
                .map((m) => deserializeMentionable(m, app))
                .filter((v) => !!v),
            ),
        )
        if (addedMentionables.length > 0) {
          setDisplayedMentionableKey(
            getMentionableKey(addedMentionables[addedMentionables.length - 1]),
          )
        }
      },
      [app, setMentionables],
    )

    const handleCreateImageMentionables = useCallback(
      (mentionableImages: MentionableImage[]) => {
        // Read the ref, not the render-time closure: two decode batches can
        // finish back to back, and a stale list would drop the earlier images
        // (or let both slip past the limit check).
        const current = mentionablesRef.current
        const newMentionableImages = mentionableImages.filter(
          (m) =>
            !current.some(
              (mentionable) =>
                getMentionableKey(serializeMentionable(mentionable)) ===
                getMentionableKey(serializeMentionable(m)),
            ),
        )
        if (newMentionableImages.length === 0) return

        // 图片数量限制（覆盖上传按钮、拖拽、粘贴所有入口）
        const imageCount = current.filter((m) => m.type === 'image').length
        if (imageCount + newMentionableImages.length > MAX_IMAGE_COUNT) {
          showImageLimitNotice()
          return
        }

        const next = [...current, ...newMentionableImages]
        // Keep the ref in sync immediately so the next batch sees this one even
        // before React re-renders.
        mentionablesRef.current = next
        setMentionables(next)
        setDisplayedMentionableKey(
          getMentionableKey(
            serializeMentionable(
              newMentionableImages[newMentionableImages.length - 1],
            ),
          ),
        )
      },
      [setMentionables, showImageLimitNotice],
    )

    const handleMentionableDelete = (mentionable: Mentionable) => {
      const mentionableKey = getMentionableKey(
        serializeMentionable(mentionable),
      )
      setMentionables(
        mentionables.filter(
          (m) => getMentionableKey(serializeMentionable(m)) !== mentionableKey,
        ),
      )

      editorRef.current?.update(() => {
        $findNodesOfType(MentionNode).forEach((node) => {
          if (getMentionableKey(node.getMentionable()) !== mentionableKey) {
            return
          }
          // 必须先获取兄弟引用再 remove：remove 会把节点从父节点分离，
          // 之后 getNextSibling() 将永远返回 null。
          const nextSibling = node.getNextSibling()
          node.remove()
          // 同时移除插入 mention 时自动追加的尾随空格，
          // 避免删除 badge 后残留孤立空格。
          if (
            nextSibling instanceof TextNode &&
            nextSibling.getTextContent().startsWith(' ')
          ) {
            if (nextSibling.getTextContent().length === 1) {
              nextSibling.remove()
            } else {
              nextSibling.spliceText(0, 1, '', true)
            }
          }
        })
      })
    }

    const handleUploadImages = async (images: File[]) => {
      const mentionableImages = await convertImagesSafely(images)
      if (mentionableImages.length > 0) {
        handleCreateImageMentionables(mentionableImages)
      }
    }

    const isImageAtLimit =
      mentionables.filter((m) => m.type === 'image').length >= MAX_IMAGE_COUNT

    // @ 提及文件/文件夹合计达到上限后，不再弹出 @ 菜单
    const isMentionAtLimit =
      mentionables.filter((m) => m.type === 'file' || m.type === 'folder')
        .length >= MAX_MENTION_COUNT

    const handleSubmit = () => {
      // While a response is streaming the send button is a stop button, so
      // Enter must not submit either.
      if (isLoading) return
      const state = editorRef.current?.getEditorState()?.toJSON()
      if (!state) return
      // No cleanup here: the editor already reports a trimmed state through
      // `onChange`, and the save path trims again before persisting.
      // Errors are surfaced by the caller; avoid an unhandled rejection here.
      void Promise.resolve(onSubmit(state)).catch((error: unknown) => {
        console.error('Failed to submit message', error)
      })
    }

    return (
      <div className="zncz-chat-user-input-container" ref={containerRef}>
        <div className="zncz-chat-user-input-files">
          {mentionables.map((m) => (
            <MentionableBadge
              key={getMentionableKey(serializeMentionable(m))}
              mentionable={m}
              onDelete={() => handleMentionableDelete(m)}
              onClick={() => {
                const mentionableKey = getMentionableKey(
                  serializeMentionable(m),
                )
                if (
                  (m.type === 'current-file' ||
                    m.type === 'file' ||
                    m.type === 'block') &&
                  m.file &&
                  mentionableKey === displayedMentionableKey
                ) {
                  // open file on click again
                  openMarkdownFile(
                    app,
                    m.file.path,
                    m.type === 'block' ? m.startLine : undefined,
                  )
                } else {
                  setDisplayedMentionableKey(mentionableKey)
                }
              }}
              isFocused={
                getMentionableKey(serializeMentionable(m)) ===
                displayedMentionableKey
              }
            />
          ))}
        </div>

        <LexicalContentEditable
          initialEditorState={(editor) => {
            if (initialSerializedEditorState) {
              editor.setEditorState(
                editor.parseEditorState(initialSerializedEditorState),
              )
            }
          }}
          editorRef={editorRef}
          contentEditableRef={contentEditableRef}
          onChange={onChange}
          onEnter={() => handleSubmit()}
          onFocus={onFocus}
          onMentionNodeMutation={handleMentionNodeMutation}
          onCreateImageMentionables={handleCreateImageMentionables}
          mentionLimitReached={isMentionAtLimit}
          autoFocus={autoFocus}
        />

        <div className="zncz-chat-user-input-controls">
          <div className="zncz-chat-user-input-controls__model-select-container">
            <ModelSelect />
          </div>
          <div className="zncz-chat-user-input-controls__buttons">
            <ImageUploadButton
              onUpload={handleUploadImages}
              isAtLimit={isImageAtLimit}
              onAtLimit={showImageLimitNotice}
            />
            <SubmitButton
              onClick={() => handleSubmit()}
              isLoading={isLoading}
              onAbort={onAbort}
            />
          </div>
        </div>
      </div>
    )
  },
)

ChatUserInput.displayName = 'ChatUserInput'
export default ChatUserInput
