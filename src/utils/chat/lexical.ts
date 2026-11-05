import {
  $getRoot,
  ElementNode,
  Klass,
  LexicalNode,
  SerializedEditorState,
} from 'lexical'

const PRESERVED_KEYS = new Set(['type', 'children', 'text', 'indent'])

function cleanupLexicalNode(node: unknown): unknown {
  if (node === null || typeof node !== 'object') {
    return node
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      cleanupLexicalNode(child)
    }
    return node
  }

  const record = node as Record<string, unknown>

  if (record.type === 'linebreak') {
    for (const key of Object.keys(record)) {
      if (key !== 'type') Reflect.deleteProperty(record, key)
    }
    return record
  }

  for (const key of Object.keys(record)) {
    if (key === 'indent') {
      if (record.indent === 0) delete record.indent
      continue
    }
    if (!PRESERVED_KEYS.has(key)) Reflect.deleteProperty(record, key)
  }
  if ('children' in record) {
    cleanupLexicalNode(record.children)
  }
  return record
}

/**
 * 精简序列化后的 Lexical 节点，只保留重建编辑器所需的结构属性
 * （type / children / text / indent）。detail、mode、style、format 等样式字段不保存。
 *
 * 就地删除字段而不是克隆成新树：调用方传入的必须是本进程独占的对象
 * （`editorState.toJSON()` 的结果或刚从磁盘解析出来的消息），
 * 因此原地修改是安全的，同时省掉了一整棵树的分配。
 */
export function cleanupEditorState(
  state: SerializedEditorState,
): SerializedEditorState {
  cleanupLexicalNode(state.root)
  return state
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
