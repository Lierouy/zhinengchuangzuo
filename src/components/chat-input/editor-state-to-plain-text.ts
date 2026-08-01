import { SerializedEditorState, SerializedLexicalNode } from 'lexical'

export function editorStateToPlainText(
  editorState: SerializedEditorState,
): string {
  return lexicalNodeToPlainText(editorState.root)
}

function lexicalNodeToPlainText(node: SerializedLexicalNode): string {
  if ('children' in node) {
    const children = node.children as SerializedLexicalNode[]

    // 段落节点：子内容拼接后加换行符
    if (node.type === 'paragraph') {
      const text = children.map(lexicalNodeToPlainText).join('')
      return text + '\n'
    }

    // 其他节点：子内容直接拼接
    return children.map(lexicalNodeToPlainText).join('')
  } else if (node.type === 'linebreak') {
    return '\n'
  } else if ('text' in node && typeof node.text === 'string') {
    return node.text
  }
  return ''
}
