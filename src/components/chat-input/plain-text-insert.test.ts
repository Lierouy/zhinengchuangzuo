import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
} from 'lexical'
import { describe, expect, it } from 'vitest'

import { editorStateToPlainText } from './editor-state-to-plain-text'
import { $insertPlainText } from './plain-text-insert'

/** Pastes `text` into the paragraph `ab` with the selection given by the offsets. */
function pasteIntoAb(
  text: string,
  anchorOffset = 2,
  focusOffset = anchorOffset,
): string {
  const editor = createEditor({
    namespace: 'plain-text-insert-test',
    onError: (error) => {
      throw error
    },
  })

  editor.update(
    () => {
      const paragraph = $createParagraphNode()
      const textNode = $createTextNode('ab')
      paragraph.append(textNode)
      $getRoot().append(paragraph)
      textNode.select(anchorOffset, focusOffset)
      $insertPlainText(text)
    },
    { discrete: true },
  )

  return editorStateToPlainText(editor.getEditorState().toJSON())
}

describe('$insertPlainText', () => {
  it('keeps HTML markup as literal text', () => {
    expect(pasteIntoAb('<div class="x">a</div>')).toBe(
      'ab<div class="x">a</div>\n',
    )
  })

  it('keeps Markdown markers as literal text', () => {
    expect(pasteIntoAb('**bold** *it* _it_ #### title')).toBe(
      'ab**bold** *it* _it_ #### title\n',
    )
  })

  it('splits lines into paragraphs at the caret', () => {
    // The text after the caret follows the whole pasted block, so it lands at
    // the end of the last inserted line.
    expect(pasteIntoAb('x\ny', 1)).toBe('ax\nyb\n')
  })

  it('treats CRLF and CR as line breaks', () => {
    expect(pasteIntoAb('x\r\ny\rz')).toBe('abx\ny\nz\n')
  })

  it('keeps tabs inside the text node', () => {
    expect(pasteIntoAb('a\tb')).toBe('aba\tb\n')
  })

  it('replaces the selected text', () => {
    expect(pasteIntoAb('z', 0, 2)).toBe('z\n')
  })
})
