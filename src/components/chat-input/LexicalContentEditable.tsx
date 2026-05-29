import {
  InitialConfigType,
  InitialEditorStateType,
  LexicalComposer,
} from '@lexical/react/LexicalComposer'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { EditorRefPlugin } from '@lexical/react/LexicalEditorRefPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import {
  LexicalEditor,
  SerializedEditorState,
  SerializedRootNode,
} from 'lexical'
import { RefObject, useCallback, useEffect, useRef, useState } from 'react'

import { useApp } from '../../contexts/app-context'
import { MentionableImage } from '../../types/mentionable'
import { fuzzySearch } from '../../utils/fuzzy-search'

import DragDropPaste from './image/DragDropPastePlugin'
import ImagePastePlugin from './image/ImagePastePlugin'
import { MentionNode } from './mention/MentionNode'
import MentionPlugin from './mention/MentionPlugin'
import NoFormatPlugin from './NoFormatPlugin'
import OnEnterPlugin from './OnEnterPlugin'
import OnMutationPlugin, { NodeMutations } from './OnMutationPlugin'
import TemplatePlugin from './TemplatePlugin'

// 从源头清理所有不需要的字段
function cleanupLexicalNode(node: unknown): unknown {
  if (node === null || typeof node !== 'object') {
    return node
  }

  if (Array.isArray(node)) {
    return node.map(cleanupLexicalNode)
  }

  const newNode: Record<string, unknown> = {}

  // 总是保留 type
  if ('type' in node) {
    newNode.type = node.type
  }

  // 总是保留 children 并递归清理
  if ('children' in node) {
    newNode.children = cleanupLexicalNode(node.children)
  }

  // 文本节点只保留 text
  if ('text' in node && typeof node.text === 'string') {
    newNode.text = node.text
  }

  // 换行符无需其他属性
  if ('type' in node && node.type === 'linebreak') {
    return { type: 'linebreak' }
  }

  // 只保留最必要的结构属性，尽可能精简
  // 只保留非零的 indent
  if ('indent' in node && node.indent !== 0) {
    newNode.indent = node.indent
  }

  // 以下字段全部删除，不需要：
  // detail, mode, style, version, format, textFormat, textStyle, direction
  // 这些字段不保存，节省存储空间
  return newNode
}

function processEditorState(
  state: SerializedEditorState,
): SerializedEditorState {
  return {
    ...state,
    root: cleanupLexicalNode(state.root) as SerializedRootNode,
  }
}

export type LexicalContentEditableProps = {
  editorRef: RefObject<LexicalEditor>
  contentEditableRef: RefObject<HTMLDivElement>
  onChange?: (content: SerializedEditorState) => void
  onEnter?: (evt: KeyboardEvent) => void
  onFocus?: () => void
  onMentionNodeMutation?: (mutations: NodeMutations<MentionNode>) => void
  onCreateImageMentionables?: (mentionables: MentionableImage[]) => void
  initialEditorState?: InitialEditorStateType
  autoFocus?: boolean
}

export default function LexicalContentEditable({
  editorRef,
  contentEditableRef,
  onChange,
  onEnter,
  onFocus,
  onMentionNodeMutation,
  onCreateImageMentionables,
  initialEditorState,
  autoFocus = false,
}: LexicalContentEditableProps) {
  const app = useApp()

  // Force remount of LexicalComposer when the ownerDocument changes
  // (e.g. when the view is popped out to a new window or moved back).
  // Lexical registers native event listeners (keydown, beforeinput, input)
  // on rootElement.ownerDocument at mount time.  When the DOM is moved
  // to a different window, those listeners stay on the old document and
  // keyboard input silently breaks.
  const [editorKey, setEditorKey] = useState(0)
  const lastOwnerDocRef = useRef<Document | null>(null)
  const shouldRefocusRef = useRef(false)

  const handleContentEditableFocus = useCallback(() => {
    const el = contentEditableRef.current
    if (el) {
      const currentDoc = el.ownerDocument
      if (
        lastOwnerDocRef.current !== null &&
        currentDoc !== lastOwnerDocRef.current
      ) {
        // Owner document changed — force Lexical remount
        lastOwnerDocRef.current = currentDoc
        shouldRefocusRef.current = true
        setEditorKey((k) => k + 1)
        onFocus?.()
        return
      }
      lastOwnerDocRef.current = currentDoc
    }
    onFocus?.()
  }, [contentEditableRef, onFocus])

  // Re-focus after LexicalComposer remounts due to document change
  useEffect(() => {
    if (shouldRefocusRef.current && contentEditableRef.current) {
      shouldRefocusRef.current = false
      const win = contentEditableRef.current.ownerDocument.defaultView
      win?.requestAnimationFrame(() => {
        contentEditableRef.current?.focus()
      })
    }
  }, [editorKey, contentEditableRef])

  const initialConfig: InitialConfigType = {
    namespace: 'LexicalContentEditable',
    theme: {
      root: 'zncz-lexical-content-editable-root',
      paragraph: 'zncz-lexical-content-editable-paragraph',
    },
    nodes: [MentionNode],
    editorState: initialEditorState,
    onError: (error) => {
      console.error(error)
    },
  }

  const searchResultByQuery = useCallback(
    (query: string) => fuzzySearch(app, query),
    [app],
  )

  /*
   * Using requestAnimationFrame for autoFocus instead of using editor.focus()
   * due to known issues with editor.focus() when initialConfig.editorState is set
   */
  useEffect(() => {
    if (autoFocus && contentEditableRef.current) {
      const win = contentEditableRef.current.ownerDocument.defaultView
      win?.requestAnimationFrame(() => {
        contentEditableRef.current?.focus()
      })
    }
  }, [autoFocus, contentEditableRef])

  return (
    <LexicalComposer key={editorKey} initialConfig={initialConfig}>
      {/* 
        There was two approach to make mentionable node copy and pasteable.
        1. use RichTextPlugin and reset text format when paste
          - so I implemented NoFormatPlugin to reset text format when paste
        2. use PlainTextPlugin and override paste command
          - PlainTextPlugin only pastes text, so we need to implement custom paste handler.
      */}
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            className="obsidian-default-textarea"
            style={{
              background: 'transparent',
            }}
            onFocus={handleContentEditableFocus}
            ref={contentEditableRef}
          />
        }
        ErrorBoundary={LexicalErrorBoundary}
      />
      <HistoryPlugin />
      <MentionPlugin searchResultByQuery={searchResultByQuery} />
      <OnChangePlugin
        onChange={(editorState) => {
          const state = editorState.toJSON()
          onChange?.(processEditorState(state))
        }}
      />
      {onEnter && <OnEnterPlugin onEnter={onEnter} />}
      <OnMutationPlugin
        nodeClass={MentionNode}
        onMutation={(mutations) => {
          onMentionNodeMutation?.(mutations)
        }}
      />
      <EditorRefPlugin editorRef={editorRef} />
      <NoFormatPlugin />
      <ImagePastePlugin onCreateImageMentionables={onCreateImageMentionables} />
      <DragDropPaste onCreateImageMentionables={onCreateImageMentionables} />
      <TemplatePlugin />
    </LexicalComposer>
  )
}
