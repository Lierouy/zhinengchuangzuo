import {
  $getRoot,
  ElementNode,
  Klass,
  LexicalNode,
  SerializedEditorState,
  SerializedRootNode,
} from 'lexical'

/**
 * 精简序列化后的 Lexical 节点，只保留重建编辑器所需的结构属性
 * （type / children / text / indent）。detail、mode、style、format 等样式字段不保存。
 */
function cleanupLexicalNode(node: unknown): unknown {
  if (node === null || typeof node !== 'object') {
    return node
  }

  if (Array.isArray(node)) {
    return node.map(cleanupLexicalNode)
  }

  if ('type' in node && node.type === 'linebreak') {
    return { type: 'linebreak' }
  }

  const cleaned: Record<string, unknown> = {}
  if ('type' in node) {
    cleaned.type = node.type
  }
  if ('children' in node) {
    cleaned.children = cleanupLexicalNode(node.children)
  }
  if ('text' in node && typeof node.text === 'string') {
    cleaned.text = node.text
  }
  if ('indent' in node && node.indent !== 0) {
    cleaned.indent = node.indent
  }
  return cleaned
}

export function cleanupEditorState(
  state: SerializedEditorState,
): SerializedEditorState {
  return {
    ...state,
    root: cleanupLexicalNode(state.root) as SerializedRootNode,
  }
}

/**
 * 返回当前编辑器状态中所有指定类型的节点。
 *
 * 这是已弃用的 `$nodesOfType` 的替代实现：
 * - 只遍历附加在根节点上的树（天然排除 detached 节点），行为与 `$nodesOfType` 一致
 * - 遍历成本与文档大小成正比，适合节点数量少的场景（如 mention 节点）
 *
 * 必须在 `editor.update()` / `editor.read()` 回调中调用。
 */
export function $findNodesOfType<T extends LexicalNode>(klass: Klass<T>): T[] {
  const result: T[] = []
  const visit = (node: LexicalNode) => {
    if (node instanceof klass) {
      result.push(node as T)
    }
    if (node instanceof ElementNode) {
      node.getChildren().forEach(visit)
    }
  }
  visit($getRoot())
  return result
}
