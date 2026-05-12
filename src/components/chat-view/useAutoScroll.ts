import { useCallback, useEffect, useRef } from 'react'

const PROGRAMMATIC_SCROLL_DEBOUNCE_MS = 50
const SCROLL_AWAY_FROM_BOTTOM_THRESHOLD = 20

type UseAutoScrollProps = {
  scrollContainerRef: React.RefObject<HTMLElement>
}

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
    if (scrollContainerRef.current) {
      const scrollContainer = scrollContainerRef.current
      lastProgrammaticScrollRef.current = Date.now()
      // Find real Obsidian parent container with scrollbar
      let target: HTMLElement | null = scrollContainer
      while (target) {
        if (target.classList.contains('view-content')) {
          target.scrollTo({
            top: target.scrollHeight,
            behavior: 'smooth',
          })
          break
        }
        target = target.parentElement
      }
    }
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
    if (scrollContainerRef.current) {
      let target: HTMLElement | null = scrollContainerRef.current
      while (target) {
        if (target.classList.contains('view-content')) {
          target.scrollTo({
            top: 0,
            behavior: 'smooth',
          })
          break
        }
        target = target.parentElement
      }
    }
  }, [scrollContainerRef])

  return {
    autoScrollToBottom,
    forceScrollToBottom,
    forceScrollToTop,
  }
}
