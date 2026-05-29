import { createContext, useContext } from 'react'

/**
 * Context that holds a ref to the `.zncz-chat-container` element.
 * Used to derive the correct `ownerDocument` and `ownerWindow` for pop-out windows.
 */
export const ChatContainerContext =
  createContext<React.RefObject<HTMLDivElement | null> | null>(null)

/**
 * Get the ref to the `.zncz-chat-container` element.
 */
export function useChatContainerRef(): React.RefObject<HTMLDivElement | null> | null {
  return useContext(ChatContainerContext)
}

/**
 * Get the `ownerDocument` of the `.zncz-chat-container` element.
 * Falls back to global `document` when the container is not yet mounted
 * (e.g. SSR or first render).
 */
export function useOwnerDocument(): Document {
  const containerRef = useChatContainerRef()
  return containerRef?.current?.ownerDocument ?? document
}

/**
 * Get the `ownerWindow` (defaultView) of the `.zncz-chat-container` element.
 * Falls back to global `window` when the container is not yet mounted.
 */
export function useOwnerWindow(): Window {
  const doc = useOwnerDocument()
  return doc.defaultView ?? window
}
