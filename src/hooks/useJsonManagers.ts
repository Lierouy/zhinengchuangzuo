import { useMemo } from 'react'

import { useApp } from '../contexts/app-context'
import { ChatManager } from '../database/chat/ChatManager'
import { ContextManager } from '../database/context/ContextManager'
import { TemplateManager } from '../database/template/TemplateManager'

/**
 * Single entry point for the JSON repositories. Components must use these
 * hooks instead of `new XxxManager(app)` so a future change (cache
 * invalidation, write notification, …) only has to happen in one place.
 */
export function useTemplateManager() {
  const app = useApp()
  return useMemo(() => new TemplateManager(app), [app])
}

export function useChatManager() {
  const app = useApp()
  return useMemo(() => new ChatManager(app), [app])
}

export function useContextManager() {
  const app = useApp()
  return useMemo(() => new ContextManager(app), [app])
}
