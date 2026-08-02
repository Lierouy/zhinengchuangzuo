import { $getRoot, ElementNode, Klass, LexicalNode } from 'lexical'

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
