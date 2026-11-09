import * as Popover from '@radix-ui/react-popover'
import { Check, Edit, Trash, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { MAX_NAME_LENGTH } from '../../constants'
import { useApp } from '../../contexts/app-context'
import { useOwnerDocument } from '../../contexts/chat-container-context'
import { ChatConversationMetadata } from '../../database/chat/types'
import { ConfirmModal } from '../modals/ConfirmModal'

function ChatListItem({
  title,
  isFocused,
  isEditing,
  onMouseEnter,
  onMouseMove,
  onSelect,
  onDelete,
  onStartEdit,
  onFinishEdit,
  onCancelEdit,
}: {
  title: string
  isFocused: boolean
  isEditing: boolean
  onMouseEnter: () => void
  onMouseMove: () => void
  onSelect: () => Promise<void>
  onDelete: () => Promise<void>
  onStartEdit: () => void
  onFinishEdit: (title: string) => Promise<void>
  onCancelEdit: () => void
}) {
  const itemRef = useRef<HTMLLIElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [editValue, setEditValue] = useState(title)

  useEffect(() => {
    if (isFocused && itemRef.current) {
      itemRef.current.scrollIntoView({
        block: 'nearest',
      })
    }
  }, [isFocused])

  // Reset edit value and focus input when entering edit mode
  useEffect(() => {
    if (isEditing) {
      setEditValue(title)
      requestAnimationFrame(() => {
        const el = inputRef.current
        if (el) {
          el.select()
          el.scrollLeft = 0
        }
      })
    }
  }, [isEditing, title])

  const handleConfirm = async () => {
    const trimmed = editValue.trim()
    if (!trimmed) return
    try {
      await onFinishEdit(trimmed)
    } catch (error) {
      console.error('Failed to rename conversation', error)
    }
  }

  const handleCancel = () => {
    onCancelEdit()
  }

  return (
    <li
      ref={itemRef}
      onClick={isEditing ? undefined : () => void onSelect()}
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseMove}
      className={isFocused && !isEditing ? 'selected' : ''}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          className="zncz-chat-list-dropdown-item-title-input"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') {
              void handleConfirm()
            } else if (e.key === 'Escape') {
              handleCancel()
            }
          }}
          maxLength={MAX_NAME_LENGTH}
        />
      ) : (
        <div className="zncz-chat-list-dropdown-item-title">{title}</div>
      )}
      <div className="zncz-chat-list-dropdown-item-actions">
        {isEditing ? (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation()
                void handleConfirm()
              }}
              className="clickable-icon zncz-chat-list-dropdown-item-icon"
            >
              <Check size={16} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleCancel()
              }}
              className="clickable-icon zncz-chat-list-dropdown-item-icon"
            >
              <X size={16} />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onStartEdit()
              }}
              className="clickable-icon zncz-chat-list-dropdown-item-icon"
            >
              <Edit size={16} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                void onDelete().catch((error: unknown) => {
                  console.error('Failed to delete conversation', error)
                })
              }}
              className="clickable-icon zncz-chat-list-dropdown-item-icon"
            >
              <Trash size={16} />
            </button>
          </>
        )}
      </div>
    </li>
  )
}

export function ChatListDropdown({
  chatList,
  currentConversationId,
  onSelect,
  onDelete,
  onUpdateTitle,
  children,
}: {
  chatList: ChatConversationMetadata[]
  currentConversationId: string
  onSelect: (conversationId: string) => Promise<void>
  onDelete: (conversationId: string) => Promise<void>
  onUpdateTitle: (conversationId: string, newTitle: string) => Promise<void>
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState<number>(0)
  const [editingId, setEditingId] = useState<string | null>(null)

  const app = useApp()
  const ownerDocument = useOwnerDocument()

  // Hover must not steal the highlight while the user is navigating with the
  // keyboard; only the most recent input modality wins.
  const keyboardNavRef = useRef(false)

  // Read when the popover opens, without making the open effect depend on them:
  // a background save replaces `chatList` and must not cancel an in-progress
  // rename or reset the keyboard highlight.
  const chatListRef = useRef(chatList)
  chatListRef.current = chatList
  const currentConversationIdRef = useRef(currentConversationId)
  currentConversationIdRef.current = currentConversationId

  useEffect(() => {
    if (!open) return
    const currentIndex = chatListRef.current.findIndex(
      (chat) => chat.id === currentConversationIdRef.current,
    )
    setFocusedIndex(currentIndex === -1 ? 0 : currentIndex)
    setEditingId(null)
    keyboardNavRef.current = false
  }, [open])

  // A conversation can disappear while the list is open (deleted here or in
  // another window): keep the highlight in range and stop editing a ghost row.
  useEffect(() => {
    setFocusedIndex((prev) => Math.min(prev, Math.max(0, chatList.length - 1)))
    setEditingId((prev) =>
      prev && !chatList.some((chat) => chat.id === prev) ? null : prev,
    )
  }, [chatList])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (chatList.length === 0) return

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        keyboardNavRef.current = true
        setFocusedIndex((prev) =>
          e.key === 'ArrowUp'
            ? Math.max(0, prev - 1)
            : Math.min(chatList.length - 1, prev + 1),
        )
      } else if (e.key === 'Enter') {
        const target = chatList[focusedIndex]
        if (!target) return
        setOpen(false)
        void onSelect(target.id)
      }
    },
    [chatList, focusedIndex, onSelect],
  )

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button className="clickable-icon" aria-label="历史记录">
          {children}
        </button>
      </Popover.Trigger>

      <Popover.Portal container={ownerDocument.body}>
        <Popover.Content
          className="zncz-popover zncz-chat-list-dropdown-content"
          sideOffset={3}
          collisionPadding={4}
          avoidCollisions={true}
          onKeyDown={handleKeyDown}
        >
          <ul style={{ maxHeight: '425px' }}>
            {chatList.length === 0 ? (
              <li className="zncz-chat-list-dropdown-empty">(没有会话记录)</li>
            ) : (
              chatList.map((chat, index) => (
                <ChatListItem
                  key={chat.id}
                  title={chat.title}
                  isFocused={focusedIndex === index}
                  isEditing={editingId === chat.id}
                  onMouseEnter={() => {
                    if (keyboardNavRef.current) return
                    setFocusedIndex(index)
                  }}
                  onMouseMove={() => {
                    // Real pointer movement hands control back to the mouse.
                    keyboardNavRef.current = false
                  }}
                  onSelect={async () => {
                    await onSelect(chat.id)
                    setOpen(false)
                  }}
                  onDelete={async () => {
                    new ConfirmModal(app, {
                      title: '删除会话',
                      message: `确定要删除会话“ ${chat.title} ”吗？`,
                      ctaText: '确定',
                      onConfirm: async () => {
                        await onDelete(chat.id)
                        // The list may now be empty or shorter; close so the
                        // user is not left staring at a stale popover.
                        setOpen(false)
                      },
                    }).open()
                  }}
                  onStartEdit={() => {
                    setEditingId(chat.id)
                  }}
                  onFinishEdit={async (title) => {
                    await onUpdateTitle(chat.id, title)
                    setEditingId(null)
                  }}
                  onCancelEdit={() => {
                    setEditingId(null)
                  }}
                />
              ))
            )}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
