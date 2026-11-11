import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { COMMAND_PRIORITY_LOW, PASTE_COMMAND, PasteCommandType } from 'lexical'
import { useEffect } from 'react'

import { MentionableImage } from '../../../types/mentionable'
import { isImageFile } from '../../../utils/llm/image'

import { convertImagesSafely } from './reportImageError'

export default function ImagePastePlugin({
  onCreateImageMentionables,
}: {
  onCreateImageMentionables?: (mentionables: MentionableImage[]) => void
}) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const handlePaste = (event: PasteCommandType) => {
      const clipboardData =
        event instanceof ClipboardEvent ? event.clipboardData : null
      if (!clipboardData) return false

      const images = Array.from(clipboardData.files).filter(isImageFile)
      if (images.length === 0) return false

      void convertImagesSafely(images).then((mentionableImages) => {
        if (mentionableImages.length > 0) {
          onCreateImageMentionables?.(mentionableImages)
        }
      })
      return true
    }

    return editor.registerCommand(
      PASTE_COMMAND,
      handlePaste,
      COMMAND_PRIORITY_LOW,
    )
  }, [editor, onCreateImageMentionables])

  return null
}
