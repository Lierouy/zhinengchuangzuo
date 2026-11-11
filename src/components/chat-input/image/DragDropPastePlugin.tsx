import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { DRAG_DROP_PASTE } from '@lexical/rich-text'
import { COMMAND_PRIORITY_LOW } from 'lexical'
import { useEffect } from 'react'

import { MentionableImage } from '../../../types/mentionable'
import { isImageFile } from '../../../utils/llm/image'

import { convertImagesSafely } from './reportImageError'

export default function DragDropPaste({
  onCreateImageMentionables,
}: {
  onCreateImageMentionables?: (mentionables: MentionableImage[]) => void
}): null {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      DRAG_DROP_PASTE, // dispatched in RichTextPlugin
      (files) => {
        const images = files.filter(isImageFile)
        if (images.length > 0) {
          void convertImagesSafely(images).then((mentionableImages) => {
            if (mentionableImages.length > 0) {
              onCreateImageMentionables?.(mentionableImages)
            }
          })
        }
        return true
      },
      COMMAND_PRIORITY_LOW,
    )
  }, [editor, onCreateImageMentionables])

  return null
}
