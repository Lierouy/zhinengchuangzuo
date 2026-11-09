import { App, TFile } from 'obsidian'
import { useCallback, useEffect } from 'react'

import { ChatMessage, ChatUserMessage } from '../../types/chat'
import { getOpenFiles } from '../../utils/obsidian'

type UseCurrentFileSyncParams = {
  app: App
  /** The message whose badge list is currently focused (input or history). */
  focusedMessageId: string | null
  inputMessageId: string
  setInputMessage: React.Dispatch<React.SetStateAction<ChatUserMessage>>
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
}

type Mentionables = ChatUserMessage['mentionables']

const withoutCurrentFile = (mentionables: Mentionables): Mentionables =>
  mentionables.some((m) => m.type === 'current-file')
    ? mentionables.filter((m) => m.type !== 'current-file')
    : mentionables

/**
 * Puts `file` first and drops any other current-file entry. Returns the same
 * array when nothing would change: a new array identity would mark the whole
 * conversation dirty and trigger a disk read + deep compare for nothing.
 */
function withCurrentFile(
  mentionables: Mentionables,
  file: TFile,
): Mentionables {
  const head = mentionables[0]
  const tail =
    head?.type === 'current-file'
      ? mentionables.slice(1)
      : mentionables.filter((m) => m.type !== 'current-file')
  const tailHasCurrentFile = tail.some((m) => m.type === 'current-file')

  if (
    head?.type === 'current-file' &&
    head.file?.path === file.path &&
    !tailHasCurrentFile
  ) {
    return mentionables
  }

  return [
    { type: 'current-file', file },
    ...tail.filter((m) => m.type !== 'current-file'),
  ]
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

    // Applies `transform` to the focused history message only, and keeps the
    // previous array when nothing changed so an unrelated layout change cannot
    // mark the conversation dirty and trigger a save.
    const updateFocusedHistoryMessage = (
      transform: (mentionables: Mentionables) => Mentionables,
    ) => {
      if (!focusedMessageId || inputMessageId === focusedMessageId) return
      setChatMessages((prev) => {
        let changed = false
        const next = prev.map((message) => {
          if (message.id !== focusedMessageId || message.role !== 'user') {
            return message
          }
          const mentionables = transform(message.mentionables)
          if (mentionables === message.mentionables) return message
          changed = true
          return { ...message, mentionables }
        })
        return changed ? next : prev
      })
    }

    if (noRealFileOpen) {
      setInputMessage((prev) => {
        const mentionables = withoutCurrentFile(prev.mentionables)
        return mentionables === prev.mentionables
          ? prev
          : { ...prev, mentionables }
      })
      updateFocusedHistoryMessage(withoutCurrentFile)
      return
    }

    if (!focusedMessageId) return

    if (inputMessageId === focusedMessageId) {
      setInputMessage((prev) => {
        const mentionables = withCurrentFile(prev.mentionables, activeFile)
        return mentionables === prev.mentionables
          ? prev
          : { ...prev, mentionables }
      })
      return
    }

    updateFocusedHistoryMessage((mentionables) =>
      withCurrentFile(mentionables, activeFile),
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
