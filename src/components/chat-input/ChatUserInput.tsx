/* $nodesOfType 暂时没有替代函数 */
import { $nodesOfType, LexicalEditor, SerializedEditorState } from 'lexical'
import { Ban } from 'lucide-react'
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
import {
  deserializeMentionable,
  getMentionableKey,
  serializeMentionable,
} from '../../utils/chat/mentionable'
import { fileToMentionableImage } from '../../utils/llm/image'
import { openMarkdownFile } from '../../utils/obsidian'

import { ImageUploadButton } from './ImageUploadButton'
import LexicalContentEditable from './LexicalContentEditable'
import { MentionNode } from './mention/MentionNode'
import MentionableBadge from './MentionableBadge'
import { ModelSelect } from './ModelSelect'
import { NodeMutations } from './OnMutationPlugin'
import { SubmitButton } from './SubmitButton'

export type ChatUserInputRef = {
  focus: () => void
}

export type ChatUserInputProps = {
  initialSerializedEditorState: SerializedEditorState | null
  onChange: (content: SerializedEditorState) => void
  onSubmit: (content: SerializedEditorState) => void
  onFocus: () => void
  mentionables: Mentionable[]
  setMentionables: (mentionables: Mentionable[]) => void
  autoFocus?: boolean
  addedBlockKey?: string | null
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
      addedBlockKey,
      isLoading = false,
      onAbort,
    },
    ref,
  ) => {
    const app = useApp()

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
    >(addedBlockKey ?? null)

    useEffect(() => {
      if (addedBlockKey) {
        setDisplayedMentionableKey(addedBlockKey)
      }
    }, [addedBlockKey])

    useImperativeHandle(ref, () => ({
      focus: () => {
        contentEditableRef.current?.focus()
      },
    }))

    const handleMentionNodeMutation = useCallback(
      (mutations: NodeMutations<MentionNode>) => {
        const currentMentionables = mentionablesRef.current
        const destroyedMentionableKeys: string[] = []
        const addedMentionables: SerializedMentionable[] = []
        mutations.forEach((mutation) => {
          const mentionable = mutation.node.getMentionable()
          const mentionableKey = getMentionableKey(mentionable)

          if (mutation.mutation === 'destroyed') {
            const nodeWithSameMentionable = editorRef.current?.read(() =>
              $nodesOfType(MentionNode).find(
                (node) =>
                  getMentionableKey(node.getMentionable()) === mentionableKey,
              ),
            )

            if (!nodeWithSameMentionable) {
              // remove mentionable only if it's not present in the editor state
              destroyedMentionableKeys.push(mentionableKey)
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
                !destroyedMentionableKeys.includes(
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
        const newMentionableImages = mentionableImages.filter(
          (m) =>
            !mentionables.some(
              (mentionable) =>
                getMentionableKey(serializeMentionable(mentionable)) ===
                getMentionableKey(serializeMentionable(m)),
            ),
        )
        if (newMentionableImages.length === 0) return
        setMentionables([...mentionables, ...newMentionableImages])
        setDisplayedMentionableKey(
          getMentionableKey(
            serializeMentionable(
              newMentionableImages[newMentionableImages.length - 1],
            ),
          ),
        )
      },
      [mentionables, setMentionables],
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
        $nodesOfType(MentionNode).forEach((node) => {
          if (getMentionableKey(node.getMentionable()) === mentionableKey) {
            node.remove()
          }
        })
      })
    }

    const handleUploadImages = async (images: File[]) => {
      const mentionableImages = await Promise.all(
        images.map((image) => fileToMentionableImage(image)),
      )
      handleCreateImageMentionables(mentionableImages)
    }

    const handleSubmit = () => {
      const content = editorRef.current?.getEditorState()?.toJSON()
      content && onSubmit(content)
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
          autoFocus={autoFocus}
        />

        <div className="zncz-chat-user-input-controls">
          <div className="zncz-chat-user-input-controls__model-select-container">
            <ModelSelect />
          </div>
          <div className="zncz-chat-user-input-controls__buttons">
            <ImageUploadButton onUpload={handleUploadImages} />
            <SubmitButton onClick={() => handleSubmit()} />
          </div>
        </div>

        {/* 停止按钮放在输入框容器内，完全固定不动 */}
        {isLoading && onAbort && (
          <button onClick={onAbort} className="zncz-stop-gen-btn">
            <Ban size={16} />
            <div>停止</div>
          </button>
        )}
      </div>
    )
  },
)

ChatUserInput.displayName = 'ChatUserInput'
export default ChatUserInput
