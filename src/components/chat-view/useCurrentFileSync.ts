import { App } from 'obsidian'
import { useCallback, useEffect } from 'react'

import { ChatMessage, ChatUserMessage } from '../../types/chat'
import { MentionableCurrentFile } from '../../types/mentionable'
import { getOpenFiles } from '../../utils/obsidian'

type UseCurrentFileSyncParams = {
  app: App
  /** The message whose badge list is currently focused (input or history). */
  focusedMessageId: string | null
  inputMessageId: string
  setInputMessage: React.Dispatch<React.SetStateAction<ChatUserMessage>>
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
}

/**
 * Keeps the `current-file` mentionable in sync with the active editor.
 *
 * When no real file is open the mentionable is removed; otherwise it is
 * replaced (always at position 0) on the focused message — which is either the
 * input box or a message from the history.
 */
export function useCurrentFileSync({
  app,
  focusedMessageId,
  inputMessageId,
  setInputMessage,
  setChatMessages,
}: UseCurrentFileSyncParams): void {
  const handleActiveLeafChange = useCallback(() => {
    const activeFile = app.workspace.getActiveFile()

    // If there's no active file or no open markdown files, remove any
    // existing `current-file` mentionables from the input or focused message.
    const openFiles = getOpenFiles(app)
    const noRealFileOpen = !activeFile || openFiles.length === 0

    const withoutCurrentFile = (
      mentionables: ChatUserMessage['mentionables'],
    ) => mentionables.filter((m) => m.type !== 'current-file')

    if (noRealFileOpen) {
      setInputMessage((prev) => ({
        ...prev,
        mentionables: withoutCurrentFile(prev.mentionables),
      }))

      // Also remove from focused history message if it's a user message
      if (focusedMessageId && inputMessageId !== focusedMessageId) {
        setChatMessages((prev) =>
          prev.map((message) =>
            message.id === focusedMessageId && message.role === 'user'
              ? {
                  ...message,
                  mentionables: withoutCurrentFile(message.mentionables),
                }
              : message,
          ),
        )
      }
      return
    }

    if (!focusedMessageId) return

    const mentionable: Omit<MentionableCurrentFile, 'id'> = {
      type: 'current-file',
      file: activeFile,
    }
    const withCurrentFile = (mentionables: ChatUserMessage['mentionables']) => [
      mentionable,
      ...withoutCurrentFile(mentionables),
    ]

    if (inputMessageId === focusedMessageId) {
      setInputMessage((prev) => ({
        ...prev,
        mentionables: withCurrentFile(prev.mentionables),
      }))
      return
    }

    setChatMessages((prev) =>
      prev.map((message) =>
        message.id === focusedMessageId && message.role === 'user'
          ? { ...message, mentionables: withCurrentFile(message.mentionables) }
          : message,
      ),
    )
  }, [app, focusedMessageId, inputMessageId, setChatMessages, setInputMessage])

  useEffect(() => {
    const workspace = app.workspace
    workspace.on('active-leaf-change', handleActiveLeafChange)
    workspace.on('layout-change', handleActiveLeafChange)
    return () => {
      workspace.off('active-leaf-change', handleActiveLeafChange)
      workspace.off('layout-change', handleActiveLeafChange)
    }
  }, [app.workspace, handleActiveLeafChange])
}
