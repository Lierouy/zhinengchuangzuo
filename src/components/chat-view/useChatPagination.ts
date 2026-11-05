import { useEffect, useMemo, useRef, useState } from 'react'

import { ChatAssistantMessageGroup, ChatUserMessage } from '../../types/chat'

const PAGE_SIZE = 50

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

    // Wait two frames for React to render all messages in this page
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (currentPage === totalPages) {
          forceScrollToBottom()
        } else {
          forceScrollToTop()
        }
      })
    })
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
