import * as Popover from '@radix-ui/react-popover'
import { Check, Edit, Trash, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { ChatConversationMetadata } from '../../database/chat/types'

function ChatListItem({
  title,
  isFocused,
  isEditing,
  onMouseEnter,
  onSelect,
  onDelete,
  onStartEdit,
  onFinishEdit,
}: {
  title: string
  isFocused: boolean
  isEditing: boolean
  onMouseEnter: () => void
  onSelect: () => Promise<void>
  onDelete: () => Promise<void>
  onStartEdit: () => void
  onFinishEdit: (title: string) => Promise<void>
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
    await onFinishEdit(trimmed)
  }

  const handleCancel = () => {
    onFinishEdit(title)
  }

  return (
    <li
      ref={itemRef}
      onClick={isEditing ? undefined : onSelect}
      onMouseEnter={onMouseEnter}
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
              handleConfirm()
            } else if (e.key === 'Escape') {
              handleCancel()
            }
          }}
          maxLength={100}
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
                handleConfirm()
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
              onClick={async (e) => {
                e.stopPropagation()
                await onDelete()
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

  useEffect(() => {
    if (open) {
      const currentIndex = chatList.findIndex(
        (chat) => chat.id === currentConversationId,
      )
      setFocusedIndex(currentIndex === -1 ? 0 : currentIndex)
      setEditingId(null)
    }
  }, [open, chatList, currentConversationId])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        setFocusedIndex(Math.max(0, focusedIndex - 1))
      } else if (e.key === 'ArrowDown') {
        setFocusedIndex(Math.min(chatList.length - 1, focusedIndex + 1))
      } else if (e.key === 'Enter') {
        onSelect(chatList[focusedIndex].id)
        setOpen(false)
      }
    },
    [chatList, focusedIndex, setFocusedIndex, onSelect],
  )

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button className="clickable-icon" aria-label="历史记录">
          {children}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="zncz-popover zncz-chat-list-dropdown-content"
          onKeyDown={handleKeyDown}
        >
          <ul style={{ maxHeight: '425px' }}>
            {chatList.length === 0 ? (
              <li className="zncz-chat-list-dropdown-empty">没有会话记录</li>
            ) : (
              chatList.map((chat, index) => (
                <ChatListItem
                  key={chat.id}
                  title={chat.title}
                  isFocused={focusedIndex === index}
                  isEditing={editingId === chat.id}
                  onMouseEnter={() => {
                    setFocusedIndex(index)
                  }}
                  onSelect={async () => {
                    await onSelect(chat.id)
                    setOpen(false)
                  }}
                  onDelete={async () => {
                    await onDelete(chat.id)
                  }}
                  onStartEdit={() => {
                    setEditingId(chat.id)
                  }}
                  onFinishEdit={async (title) => {
                    await onUpdateTitle(chat.id, title)
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
