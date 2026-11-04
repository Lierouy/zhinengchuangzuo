import { App, Keymap, MarkdownRenderer } from 'obsidian'
import { memo, useEffect, useRef } from 'react'

import { useApp } from '../../contexts/app-context'
import { useChatView } from '../../contexts/chat-view-context'

type ObsidianMarkdownProps = {
  content: string
  scale?: 'xs' | 'sm' | 'base'
}

/**
 * Renders Obsidian Markdown content using the Obsidian MarkdownRenderer.
 * @param content - The Obsidian Markdown content to render.
 * @param scale - The scale of the markdown content.
 * @returns A React component that renders the Obsidian Markdown content.
 */
const ObsidianMarkdown = memo(function ObsidianMarkdown({
  content,
  scale = 'base',
}: ObsidianMarkdownProps) {
  const app = useApp()
  const chatView = useChatView()
  const containerRef = useRef<HTMLDivElement>(null)
  // The delegated click handler is attached once per container, so it must read
  // the current source path through a ref instead of capturing it.
  const sourcePathRef = useRef('')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Streaming updates re-render on every token; a slower earlier render must
    // never overwrite a newer one.
    let cancelled = false
    const sourcePath = app.workspace.getActiveFile()?.path ?? ''
    sourcePathRef.current = sourcePath

    const renderMarkdown = async () => {
      container.innerHTML = ''
      await MarkdownRenderer.render(
        app,
        content,
        container,
        sourcePath,
        chatView,
      )
      if (cancelled) return
      setupMarkdownLinks(app, container, sourcePathRef)
    }

    void renderMarkdown()

    return () => {
      cancelled = true
    }
  }, [app, content, chatView])

  return (
    <div
      ref={containerRef}
      className={`markdown-rendered zncz-markdown-rendered zncz-scale-${scale}`}
    />
  )
})

/**
 * Containers that already have delegated link handlers attached. Using event
 * delegation keeps a single listener per container, so re-rendering markdown
 * (e.g. on every streaming token) can never accumulate listeners.
 */
const delegatedContainers = new WeakSet<HTMLElement>()

/**
 * Makes internal links rendered by MarkdownRenderer.render() interactive.
 * Required because rendered links are not interactive by default.
 */
function setupMarkdownLinks(
  app: App,
  containerEl: HTMLElement,
  sourcePathRef: { current: string },
) {
  if (delegatedContainers.has(containerEl)) return
  delegatedContainers.add(containerEl)

  containerEl.addEventListener('click', (evt: MouseEvent) => {
    const linkEl = (evt.target as HTMLElement | null)?.closest(
      'a.internal-link',
    )
    if (!linkEl) return
    evt.preventDefault()
    const linktext = linkEl.getAttribute('href')
    if (linktext) {
      app.workspace.openLinkText(
        linktext,
        sourcePathRef.current,
        Keymap.isModEvent(evt),
      )
    }
  })
}
export { ObsidianMarkdown }
