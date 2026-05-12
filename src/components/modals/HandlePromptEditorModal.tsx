import { $generateNodesFromSerializedNodes } from '@lexical/clipboard'
import {
  $getRoot,
  $insertNodes,
  LexicalEditor,
  SerializedEditorState,
  SerializedLexicalNode,
  SerializedRootNode,
} from 'lexical'
import { App } from 'obsidian'
import { useRef } from 'react'

import { AppProvider } from '../../contexts/app-context'
import LexicalContentEditable from '../chat-input/LexicalContentEditable'
import { ObsidianButton } from '../common/ObsidianButton'
import { ObsidianSetting } from '../common/ObsidianSetting'
import { ReactModal } from '../common/ReactModal'

function isSerializedLexicalNode(node: unknown): node is SerializedLexicalNode {
  if (!node || typeof node !== 'object') return false
  const obj = node as Record<string, unknown>
  return 'type' in obj && typeof obj.type === 'string'
}

// 精简 Lexical node，移除不必要字段
function cleanupLexicalNode(node: unknown): unknown {
  if (node === null || typeof node !== 'object') {
    return node
  }
  if (Array.isArray(node)) {
    return node.map(cleanupLexicalNode)
  }
  const cleaned: Record<string, unknown> = {}

  // 总是保留 type
  if ('type' in node) {
    cleaned.type = node.type
  }

  // 总是保留 children 并递归清理
  if ('children' in node) {
    cleaned.children = cleanupLexicalNode(node.children)
    // 过滤掉段落末尾由 RichTextPlugin 自动生成的 \n 文本节点
    if (Array.isArray(cleaned.children)) {
      cleaned.children = cleaned.children.filter((child: unknown) => {
        if (
          child &&
          typeof child === 'object' &&
          'type' in child &&
          (child as { type: string }).type === 'text' &&
          'text' in child &&
          (child as { text: string }).text === '\n'
        ) {
          return false
        }
        return true
      })
    }
  }

  // 文本节点只保留 text
  if ('text' in node && typeof node.text === 'string') {
    cleaned.text = node.text
  }

  // 换行符无需其他属性
  if ('type' in node && node.type === 'linebreak') {
    return { type: 'linebreak' }
  }

  // 只保留非零的 indent
  if ('indent' in node && node.indent !== 0) {
    cleaned.indent = node.indent
  }

  // 以下字段删除：
  // detail, mode, style, version, format, textFormat, textStyle, direction
  return cleaned
}

type HandlePromptEditorContentProps = {
  app: App
  initialPrompt: SerializedEditorState | string
  onSave: (prompt: SerializedEditorState) => void
  onClose: () => void
}

function HandlePromptEditorContent({
  app: _app,
  initialPrompt,
  onSave,
  onClose,
}: HandlePromptEditorContentProps) {
  const editorRef = useRef<LexicalEditor | null>(null)
  const contentEditableRef = useRef<HTMLDivElement>(null)

  const handleSave = () => {
    if (!editorRef.current) return
    const json = editorRef.current.getEditorState().toJSON()
    // 清理无用字段后再保存
    json.root = cleanupLexicalNode(json.root) as SerializedRootNode
    onSave(json)
    onClose()
  }

  return (
    <div>
      <div className="zncz-handle-prompt-editor-container">
        <LexicalContentEditable
          initialEditorState={(editor) => {
            if (initialPrompt && typeof initialPrompt === 'object') {
              try {
                const nodes = initialPrompt.root?.children?.filter(
                  isSerializedLexicalNode,
                )
                if (nodes && nodes.length > 0) {
                  editor.update(() => {
                    const root = $getRoot()
                    root.clear()
                    const parsedNodes = $generateNodesFromSerializedNodes(nodes)
                    $insertNodes(parsedNodes)
                  })
                  return
                }
              } catch {
                // Ignore, editor starts empty
              }
            }
          }}
          editorRef={editorRef}
          contentEditableRef={contentEditableRef}
          onEnter={(evt: KeyboardEvent) => {
            if (evt.ctrlKey || evt.metaKey) {
              evt.preventDefault()
              handleSave()
            }
          }}
        />
      </div>

      <ObsidianSetting>
        <ObsidianButton text="保存" onClick={handleSave} cta />
        <ObsidianButton text="取消" onClick={onClose} />
      </ObsidianSetting>
    </div>
  )
}

type HandlePromptEditorModalProps = {
  app: App
  initialPrompt: SerializedEditorState | string
  onSave: (prompt: SerializedEditorState) => void
  onClose: () => void
}

export class HandlePromptEditorModal extends ReactModal<HandlePromptEditorModalProps> {
  constructor(
    app: App,
    initialPrompt: SerializedEditorState | string,
    onSave: (prompt: SerializedEditorState) => void,
  ) {
    super({
      app,
      Component: HandlePromptEditorContentWrapper,
      props: {
        app,
        initialPrompt,
        onSave,
      },
      options: {
        title: '编辑处理提示',
      },
    })
  }
}

function HandlePromptEditorContentWrapper({
  app,
  initialPrompt,
  onSave,
  onClose,
}: HandlePromptEditorModalProps) {
  return (
    <AppProvider app={app}>
      <HandlePromptEditorContent
        app={app}
        initialPrompt={initialPrompt}
        onSave={onSave}
        onClose={onClose}
      />
    </AppProvider>
  )
}
