import { useEffect, useMemo, useRef, useState } from 'react'

import { ChatAssistantMessageGroup, ChatUserMessage } from '../../types/chat'

const PAGE_SIZE = 50

/**
 * A page change swaps the whole message list, and the markdown of the new page
 * is rendered asynchronously, so the page is still growing when the DOM update
 * is done. The first delay scrolls as soon as the new page is on screen, the
 * second one catches the content that rendered in the meantime.
 */
const FIRST_SCROLL_DELAY_MS = 50
const SECOND_SCROLL_DELAY_MS = 350

export type GroupedChatMessage = ChatUserMessage | ChatAssistantMessageGroup

/** Number of pages needed to show `groupedCount` message groups. */
export function getPageCount(groupedCount: number): number {
  return Math.max(1, Math.ceil(groupedCount / PAGE_SIZE))
}

type UseChatPaginationParams = {
  groupedMessages: GroupedChatMessage[]
  forceScrollToBottom: () => void
  forceScrollToTop: () => void
}

/**
 * Owns page state and the two scrolling rules that depend on it:
 * - new messages jump to the last page;
 * - a page change scrolls to the bottom (last page) or the top (history).
 * Deleting messages never scrolls; the clamp effect only fixes the counter.
 */
export function useChatPagination({
  groupedMessages,
  forceScrollToBottom,
  forceScrollToTop,
}: UseChatPaginationParams) {
  const [currentPage, setCurrentPage] = useState(1)

  const totalPages = useMemo(
    () => getPageCount(groupedMessages.length),
    [groupedMessages.length],
  )

  const currentPageMessages = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE
    return groupedMessages.slice(startIndex, startIndex + PAGE_SIZE)
  }, [groupedMessages, currentPage])

  const prevMessageCount = useRef(0)
  useEffect(() => {
    const currLength = groupedMessages.length
    const prevLength = prevMessageCount.current
    prevMessageCount.current = currLength
    if (currLength < prevLength) return

    if (currLength > prevLength && currentPage < totalPages) {
      setCurrentPage(totalPages)
      return
    }

    const scrollToPageEdge = () => {
      if (currentPage === totalPages) {
        forceScrollToBottom()
      } else {
        forceScrollToTop()
      }
    }

    // The top is a fixed target and only needs one attempt; the bottom is a
    // measured height that keeps growing while the new page renders.
    const timers = [window.setTimeout(scrollToPageEdge, FIRST_SCROLL_DELAY_MS)]
    if (currentPage === totalPages) {
      timers.push(
        window.setTimeout(forceScrollToBottom, SECOND_SCROLL_DELAY_MS),
      )
    }

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [
    currentPage,
    totalPages,
    groupedMessages.length,
    forceScrollToBottom,
    forceScrollToTop,
  ])

  // 页码超出总页数时（例如删除消息后）自动收敛，避免空白页
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  return { currentPage, setCurrentPage, totalPages, currentPageMessages }
}
