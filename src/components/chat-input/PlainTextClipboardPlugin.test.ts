import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  PASTE_COMMAND,
  PasteCommandType,
  createEditor,
} from 'lexical'
import { describe, expect, it, vi } from 'vitest'

import { editorStateToPlainText } from './editor-state-to-plain-text'
import {
  createPlainTextInsertionHandler,
  createPlainTextPasteHandler,
} from './PlainTextClipboardPlugin'

type FakeDataTransfer = {
  files?: unknown[]
  types?: string[]
  data?: Record<string, string>
}

function createDataTransfer({
  files = [],
  types = [],
  data = {},
}: FakeDataTransfer = {}) {
  return {
    files,
    types,
    getData: (type: string) => data[type] ?? '',
  }
}

function createPasteEvent(clipboard: FakeDataTransfer) {
  const preventDefault = vi.fn()
  const event = {
    clipboardData: createDataTransfer(clipboard),
    preventDefault,
  } as unknown as PasteCommandType
  return { event, preventDefault }
}

function createInsertionEvent(clipboard: FakeDataTransfer) {
  return {
    dataTransfer: createDataTransfer(clipboard),
  } as unknown as InputEvent
}

/** Editor holding the paragraph `ab` with the caret at its end. */
function createTestEditor() {
  const editor = createEditor({
    namespace: 'plain-text-clipboard-test',
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
      textNode.select(2, 2)
    },
    { discrete: true },
  )

  return editor
}

const flushUpdate = () => new Promise((resolve) => setTimeout(resolve, 0))

const toPlainText = (editor: ReturnType<typeof createTestEditor>) =>
  editorStateToPlainText(editor.getEditorState().toJSON())

describe('createPlainTextPasteHandler', () => {
  it('inserts clipboard text verbatim and preempts the HTML handler', async () => {
    const editor = createTestEditor()
    const { event, preventDefault } = createPasteEvent({
      data: {
        'text/plain': '#### 示范\n*斜体* <div>tag</div>',
        'text/html': '<h4>示范</h4><p><em>斜体</em> tag</p>',
      },
    })
    const htmlHandler = vi.fn(() => true)

    editor.registerCommand(
      PASTE_COMMAND,
      createPlainTextPasteHandler(editor),
      COMMAND_PRIORITY_HIGH,
    )
    editor.registerCommand(PASTE_COMMAND, htmlHandler, COMMAND_PRIORITY_EDITOR)

    expect(editor.dispatchCommand(PASTE_COMMAND, event)).toBe(true)
    expect(preventDefault).toHaveBeenCalled()
    expect(htmlHandler).not.toHaveBeenCalled()
    // Like Lexical's own paste handler, the update commits asynchronously.
    await flushUpdate()
    expect(toPlainText(editor)).toBe('ab#### 示范\n*斜体* <div>tag</div>\n')
  })

  it('prefers the text over attached files', () => {
    const editor = createTestEditor()
    const { event } = createPasteEvent({
      files: [{}],
      data: { 'text/plain': 'text wins' },
    })

    expect(createPlainTextPasteHandler(editor)(event)).toBe(true)
  })

  it('declines file-only pastes so images keep their own handler', () => {
    const editor = createTestEditor()
    const { event } = createPasteEvent({ files: [{}] })

    expect(createPlainTextPasteHandler(editor)(event)).toBe(false)
  })

  it('declines pastes without plain text', () => {
    const editor = createTestEditor()
    const { event } = createPasteEvent({
      data: { 'text/html': '<p>only html</p>' },
    })

    expect(createPlainTextPasteHandler(editor)(event)).toBe(false)
  })
})

describe('createPlainTextInsertionHandler', () => {
  it('declines string payloads so typing stays untouched', () => {
    const editor = createTestEditor()

    expect(createPlainTextInsertionHandler(editor)('typed')).toBe(false)
  })

  it('inserts dropped text verbatim', async () => {
    const editor = createTestEditor()
    const payload = createInsertionEvent({
      data: {
        'text/plain': '#### 示范\n<b>tag</b>',
        'text/html': '<h4>示范</h4><p><b>tag</b></p>',
      },
    })

    expect(createPlainTextInsertionHandler(editor)(payload)).toBe(true)
    await flushUpdate()
    expect(toPlainText(editor)).toBe('ab#### 示范\n<b>tag</b>\n')
  })

  it('declines drags that started inside the editor', () => {
    const editor = createTestEditor()
    const payload = createInsertionEvent({
      types: ['application/x-lexical-drag', 'text/plain'],
      data: { 'text/plain': 'dragged' },
    })

    expect(createPlainTextInsertionHandler(editor)(payload)).toBe(false)
  })

  it('declines payloads without a data transfer', () => {
    const editor = createTestEditor()

    expect(
      createPlainTextInsertionHandler(editor)({
        dataTransfer: null,
      } as unknown as InputEvent),
    ).toBe(false)
  })
})
