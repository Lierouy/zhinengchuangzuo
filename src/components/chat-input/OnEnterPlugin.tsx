import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { COMMAND_PRIORITY_LOW, KEY_ENTER_COMMAND } from 'lexical'
import { useEffect } from 'react'

export default function OnEnterPlugin({
  onEnter,
}: {
  onEnter: (evt: KeyboardEvent) => void
}) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const removeListener = editor.registerCommand(
      KEY_ENTER_COMMAND,
      // The payload is `KeyboardEvent | null`: Lexical also dispatches this
      // command with a null payload when the intent is to insert a newline
      // (e.g. programmatically). There is no modifier state to inspect in that
      // case, so let the default behavior handle it.
      (evt: KeyboardEvent | null) => {
        if (evt === null || !evt.shiftKey) {
          return false
        }
        evt.preventDefault()
        evt.stopPropagation()
        onEnter(evt)
        return true
      },
      COMMAND_PRIORITY_LOW,
    )

    return () => {
      removeListener()
    }
  }, [editor, onEnter])

  return null
}
