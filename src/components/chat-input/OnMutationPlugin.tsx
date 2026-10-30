import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { Klass, LexicalNode, NodeKey, NodeMutation } from 'lexical'
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
        const editorState = editor.getEditorState()

        const mutations = new Map<
          NodeKey,
          { mutation: NodeMutation; node: T }
        >()
        for (const [key, mutation] of mutatedNodes) {
          mutations.set(key, {
            mutation,
            node:
              mutation === 'destroyed'
                ? (payload.prevEditorState._nodeMap.get(key) as T)
                : (editorState._nodeMap.get(key) as T),
          })
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
