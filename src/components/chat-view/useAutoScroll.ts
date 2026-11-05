import { useCallback, useEffect, useRef } from 'react'

/** How long a programmatic scroll may keep producing events we own. */
const PROGRAMMATIC_SCROLL_SETTLE_MS = 500
const SCROLL_AWAY_FROM_BOTTOM_THRESHOLD = 50
/** Upward movement smaller than this is treated as layout jitter, not a scroll. */
const USER_SCROLL_UP_DELTA = 20

type UseAutoScrollProps = {
  scrollContainerRef: React.RefObject<HTMLElement | null>
}

// The scrollbar belongs to Obsidian's `.view-content` ancestor, not to the chat container.
const findViewContent = (element: HTMLElement) =>
  element.closest<HTMLElement>('.view-content')

export function useAutoScroll({ scrollContainerRef }: UseAutoScrollProps) {
  const preventAutoScrollRef = useRef(false)
  const previousScrollTopRef = useRef(0)
  // Set while we deliberately move the view upwards, so the resulting scroll
  // events are not mistaken for the user scrolling up.
  const programmaticScrollUntilRef = useRef(0)

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    // The chat container itself is `overflow-y: visible`; the element that
    // actually scrolls is Obsidian's `.view-content` ancestor. Scroll events do
    // not bubble, so listening on the container would never fire and the
    // "user scrolled up" flag could never be set.
    const scroller = findViewContent(container) ?? container
    previousScrollTopRef.current = scroller.scrollTop

    const handleScroll = () => {
      const current = scroller.scrollTop
      const previous = previousScrollTopRef.current
      previousScrollTopRef.current = current

      const distanceFromBottom =
        scroller.scrollHeight - current - scroller.clientHeight
      if (distanceFromBottom <= SCROLL_AWAY_FROM_BOTTOM_THRESHOLD) {
        // Back at the bottom: follow new output again.
        preventAutoScrollRef.current = false
        return
      }

      // Smooth scrolling towards the bottom only ever moves down, so an upward
      // move means the user is reading history and wants the view to stay put.
      if (
        current < previous - USER_SCROLL_UP_DELTA &&
        Date.now() > programmaticScrollUntilRef.current
      ) {
        preventAutoScrollRef.current = true
      }
    }

    scroller.addEventListener('scroll', handleScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', handleScroll)
  }, [scrollContainerRef])

  const scrollToBottom = useCallback(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return
    const viewContent = findViewContent(scrollContainer)
    viewContent?.scrollTo({ top: viewContent.scrollHeight, behavior: 'smooth' })
  }, [scrollContainerRef])

  // Auto-scrolls to bottom only if the scroll position is near the bottom
  const autoScrollToBottom = useCallback(() => {
    if (!preventAutoScrollRef.current) {
      scrollToBottom()
    }
  }, [scrollToBottom])

  // Forces scroll to bottom regardless of current position
  const forceScrollToBottom = useCallback(() => {
    preventAutoScrollRef.current = false
    // A page change can move scrollTop downwards in one jump; ignore that
    // artificial "scroll up" while it settles.
    programmaticScrollUntilRef.current =
      Date.now() + PROGRAMMATIC_SCROLL_SETTLE_MS
    scrollToBottom()
  }, [scrollToBottom])

  const forceScrollToTop = useCallback(() => {
    preventAutoScrollRef.current = false
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return
    const viewContent = findViewContent(scrollContainer)
    if (!viewContent) return
    programmaticScrollUntilRef.current =
      Date.now() + PROGRAMMATIC_SCROLL_SETTLE_MS
    viewContent.scrollTo({ top: 0, behavior: 'smooth' })
  }, [scrollContainerRef])

  return {
    autoScrollToBottom,
    forceScrollToBottom,
    forceScrollToTop,
  }
}
