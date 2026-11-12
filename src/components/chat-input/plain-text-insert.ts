import { $getSelection, $isRangeSelection } from 'lexical'

/**
 * Inserts `text` at the caret as literal characters, one paragraph per line.
 *
 * Nothing is parsed: markup such as `<div>` or `**bold**` stays text. Lines
 * become separate paragraphs (rather than `\n` inside one text node) so the
 * editor does not jump while scrolling, matching how templates are inserted.
 * Tabs stay inside the text node: a `TabNode` has no `text` field, which would
 * silently drop them from the prompt built by `editorStateToPlainText`.
 */
export function $insertPlainText(text: string): void {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) {
    // Non-range selections only expose this entry point.
    selection?.insertRawText(text)
    return
  }

  text.split(/\r\n|\r|\n/).forEach((line, index) => {
    // Every insertion can replace the selection object, so re-read it instead of
    // reusing the one captured above.
    if (index > 0) {
      const current = $getSelection()
      if (!$isRangeSelection(current)) return
      current.insertParagraph()
    }
    if (!line) return

    const current = $getSelection()
    if ($isRangeSelection(current)) current.insertText(line)
  })
}
