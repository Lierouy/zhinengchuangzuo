import { App, Component, Keymap, MarkdownRenderer } from 'obsidian'
import { memo, useEffect, useRef } from 'react'

import { useApp } from '../../contexts/app-context'

/** Streaming updates arrive per token; the DOM is rebuilt at most this often. */
const RENDER_THROTTLE_MS = 350

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
  const containerRef = useRef<HTMLDivElement>(null)
  // The delegated click handler is attached once per container, so it must read
  // the current source path through a ref instead of capturing it.
  const sourcePathRef = useRef('')

  // Read by the render loop so a throttled render always uses the newest text.
  const latestContentRef = useRef(content)
  latestContentRef.current = content

  const scheduleRef = useRef<() => void>(() => {})

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false
    let rendering = false
    let dirty = false
    let timer: number | null = null
    let lastRenderAt = 0
    // `MarkdownRenderer` attaches the render children created by plugins to the
    // component it is given. Using a throwaway component per pass and unloading
    // it before the next one keeps those children from piling up while a
    // response streams (this component re-renders every ~350ms).
    let renderComponent: Component | null = null

    const renderOnce = async () => {
      if (rendering) {
        dirty = true
        return
      }
      rendering = true
      dirty = false
      try {
        // Re-reading on every render keeps internal links pointing at the
        // file that is active now, not the one active at mount time.
        const sourcePath = app.workspace.getActiveFile()?.path ?? ''
        sourcePathRef.current = sourcePath

        renderComponent?.unload()
        const component = new Component()
        component.load()
        renderComponent = component

        container.innerHTML = ''
        await MarkdownRenderer.render(
          app,
          latestContentRef.current,
          container,
          sourcePath,
          component,
        )
        if (cancelled) return
        setupMarkdownLinks(app, container, sourcePathRef)
      } catch (error) {
        console.error('Failed to render markdown', error)
      } finally {
        rendering = false
        // Content changed while rendering: schedule the next pass without
        // breaking the throttle window.
        if (!cancelled && dirty) scheduleRef.current()
      }
    }

    const schedule = () => {
      if (timer !== null) return
      const wait = Math.max(
        0,
        RENDER_THROTTLE_MS - (performance.now() - lastRenderAt),
      )
      timer = window.setTimeout(() => {
        timer = null
        lastRenderAt = performance.now()
        void renderOnce()
      }, wait)
    }

    scheduleRef.current = schedule
    schedule()

    return () => {
      cancelled = true
      if (timer !== null) {
        window.clearTimeout(timer)
        timer = null
      }
      renderComponent?.unload()
      renderComponent = null
      scheduleRef.current = () => {}
    }
  }, [app])

  useEffect(() => {
    scheduleRef.current()
  }, [content])

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
      void app.workspace.openLinkText(
        linktext,
        sourcePathRef.current,
        Keymap.isModEvent(evt),
      )
    }
  })
}
export { ObsidianMarkdown }
