import { SerializedEditorState, SerializedLexicalNode } from 'lexical'

type MentionRenderer = (text: string) => string

export function editorStateToPlainText(
  editorState: SerializedEditorState,
): string {
  return lexicalNodeToText(editorState.root)
}

/**
 * 与 editorStateToPlainText 相同，但 mention 节点交给 renderMention 渲染。
 * 用于展示：mention 节点自带完整文件名（含空格），纯文本 + 正则无法确定边界。
 */
export function editorStateToDisplayText(
  editorState: SerializedEditorState,
): string {
  return lexicalNodeToText(editorState.root, (text) => {
    const name = text.startsWith('@') ? text.slice(1) : text
    // 别名写法保留 @ 作为显示文本，链接目标仍是真实文件名。
    return `[[${name}|${text}]]`
  })
}

function lexicalNodeToText(
  node: SerializedLexicalNode,
  renderMention?: MentionRenderer,
): string {
  if ('children' in node) {
    const children = node.children as SerializedLexicalNode[]
    const render = (child: SerializedLexicalNode) =>
      lexicalNodeToText(child, renderMention)

    // 段落节点：子内容拼接后加换行符
    if (node.type === 'paragraph') {
      return children.map(render).join('') + '\n'
    }

    // 其他节点：子内容直接拼接
    return children.map(render).join('')
  } else if (node.type === 'linebreak') {
    return '\n'
  } else if ('text' in node && typeof node.text === 'string') {
    if (renderMention && node.type === 'mention') {
      return renderMention(node.text)
    }
    return node.text
  }
  return ''
}
