import { useCallback, useEffect, useRef } from 'react'

const PROGRAMMATIC_SCROLL_DEBOUNCE_MS = 50
const SCROLL_AWAY_FROM_BOTTOM_THRESHOLD = 20

type UseAutoScrollProps = {
  scrollContainerRef: React.RefObject<HTMLElement | null>
}

// The scrollbar belongs to Obsidian's `.view-content` ancestor, not to the chat container.
const findViewContent = (element: HTMLElement) =>
  element.closest<HTMLElement>('.view-content')

export function useAutoScroll({ scrollContainerRef }: UseAutoScrollProps) {
  const preventAutoScrollRef = useRef(false)
  const lastProgrammaticScrollRef = useRef<number>(0)

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return

    const handleScroll = () => {
      // If the scroll event happened very close to our programmatic scroll, ignore it
      if (
        Date.now() - lastProgrammaticScrollRef.current <
        PROGRAMMATIC_SCROLL_DEBOUNCE_MS
      ) {
        return
      }

      preventAutoScrollRef.current =
        scrollContainer.scrollHeight -
          scrollContainer.scrollTop -
          scrollContainer.clientHeight >
        SCROLL_AWAY_FROM_BOTTOM_THRESHOLD
    }

    scrollContainer.addEventListener('scroll', handleScroll)
    return () => scrollContainer.removeEventListener('scroll', handleScroll)
  }, [scrollContainerRef])

  const scrollToBottom = useCallback(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return
    lastProgrammaticScrollRef.current = Date.now()
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
    scrollToBottom()
  }, [scrollToBottom])

  const forceScrollToTop = useCallback(() => {
    preventAutoScrollRef.current = false
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return
    findViewContent(scrollContainer)?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [scrollContainerRef])

  return {
    autoScrollToBottom,
    forceScrollToBottom,
    forceScrollToTop,
  }
}
