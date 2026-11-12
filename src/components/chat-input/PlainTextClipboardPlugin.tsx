import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  COMMAND_PRIORITY_HIGH,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  LexicalEditor,
  PASTE_COMMAND,
  PASTE_TAG,
  PasteCommandType,
  mergeRegister,
} from 'lexical'
import { useEffect } from 'react'

import { $insertPlainText } from './plain-text-insert'

/** Set by Lexical on drags that start inside an editor; those move nodes. */
const LEXICAL_DRAG_MIME = 'application/x-lexical-drag'

function insertPlainText(editor: LexicalEditor, text: string): void {
  editor.update(() => $insertPlainText(text), { tag: PASTE_TAG })
}

/**
 * Inserts pasted text as literal characters.
 *
 * The rich-text handler reads `text/html` first and converts markup into
 * formatting, which `NoFormatPlugin` then erases, so Markdown and HTML tags
 * never reached the prompt. Reading `text/plain` instead keeps them verbatim.
 */
export function createPlainTextPasteHandler(
  editor: LexicalEditor,
): (event: PasteCommandType) => boolean {
  return (event) => {
    // `instanceof ClipboardEvent` is avoided so the handler stays testable
    // without a DOM; only clipboard events carry this property.
    const clipboardData = 'clipboardData' in event ? event.clipboardData : null
    if (!clipboardData) return false

    // Without text this is a file-only paste (an image), which keeps its own
    // handler. With text, the text wins over files, matching Lexical's default.
    const text = clipboardData.getData('text/plain')
    if (!text) return false

    event.preventDefault()
    insertPlainText(editor, text)
    return true
  }
}

/**
 * Inserts clipboard-driven input that is not a paste, i.e. drag-and-drop
 * (`insertFromDrop`) and spellcheck replacement. Lexical has already applied
 * the DOM target range, so the selection is at the drop caret.
 */
export function createPlainTextInsertionHandler(
  editor: LexicalEditor,
): (payload: InputEvent | string) => boolean {
  return (payload) => {
    if (typeof payload === 'string') return false

    const dataTransfer = payload.dataTransfer
    if (!dataTransfer) return false

    // A drag started inside the editor must keep its move semantics: inserting
    // the payload as text would duplicate it instead.
    if (dataTransfer.types.includes(LEXICAL_DRAG_MIME)) return false

    const text = dataTransfer.getData('text/plain')
    if (!text) return false

    insertPlainText(editor, text)
    return true
  }
}

export default function PlainTextClipboardPlugin(): null {
  const [editor] = useLexicalComposerContext()

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          PASTE_COMMAND,
          createPlainTextPasteHandler(editor),
          // Above @lexical/rich-text's handlers (COMMAND_PRIORITY_EDITOR).
          COMMAND_PRIORITY_HIGH,
        ),
        editor.registerCommand(
          CONTROLLED_TEXT_INSERTION_COMMAND,
          createPlainTextInsertionHandler(editor),
          COMMAND_PRIORITY_HIGH,
        ),
      ),
    [editor],
  )

  return null
}
