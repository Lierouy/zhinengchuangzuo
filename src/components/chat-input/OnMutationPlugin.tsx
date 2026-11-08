import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getNodeByKey,
  Klass,
  LexicalNode,
  NodeKey,
  NodeMutation,
} from 'lexical'
import { useEffect, useLayoutEffect, useRef } from 'react'

export type NodeMutations<T> = Map<NodeKey, { mutation: NodeMutation; node: T }>

export default function OnMutationPlugin<T extends LexicalNode>({
  nodeClass,
  onMutation,
}: {
  nodeClass: Klass<T>
  onMutation: (mutations: NodeMutations<T>) => void
}) {
  const [editor] = useLexicalComposerContext()

  // 始终保存最新的回调，使监听器无需因回调引用变化而重新注册。
  // 每次渲染都重新注册会导致监听器在注销与注册之间的间隙丢失 mutation 事件。
  const onMutationRef = useRef(onMutation)
  useLayoutEffect(() => {
    onMutationRef.current = onMutation
  }, [onMutation])

  useEffect(() => {
    const removeListener = editor.registerMutationListener(
      nodeClass,
      (mutatedNodes, payload) => {
        const mutations = new Map<
          NodeKey,
          { mutation: NodeMutation; node: T }
        >()
        for (const [key, mutation] of mutatedNodes) {
          // Destroyed nodes only exist in the previous state. Both lookups go
          // through the public `EditorState.read` + `$getNodeByKey` pair rather
          // than the private `_nodeMap`, which Lexical does not guarantee.
          const state =
            mutation === 'destroyed'
              ? payload.prevEditorState
              : editor.getEditorState()
          const node = state.read(() => $getNodeByKey(key)) as T | null
          if (!node) continue
          mutations.set(key, { mutation, node })
        }

        onMutationRef.current(mutations)
      },
    )

    return () => {
      removeListener()
    }
  }, [editor, nodeClass])

  return null
}
