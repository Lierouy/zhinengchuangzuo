import type { SerializedEditorState } from 'lexical'
import { describe, expect, it } from 'vitest'

import {
  editorStateToDisplayText,
  editorStateToPlainText,
} from './editor-state-to-plain-text'

type NodeLike = Record<string, unknown>

const state = (children: NodeLike[]): SerializedEditorState =>
  ({ root: { type: 'root', children } }) as unknown as SerializedEditorState

const textNode = (text: string, type = 'text'): NodeLike => ({ type, text })

const paragraph = (...children: NodeLike[]): NodeLike => ({
  type: 'paragraph',
  children,
})

describe('editorStateToPlainText', () => {
  it('joins paragraph children and terminates each paragraph with a newline', () => {
    const editorState = state([
      paragraph(textNode('Hello'), textNode(' world')),
      paragraph(textNode('Second')),
    ])

    expect(editorStateToPlainText(editorState)).toBe('Hello world\nSecond\n')
  })

  it('renders line breaks and ignores unknown nodes', () => {
    const editorState = state([
      paragraph(textNode('a'), { type: 'linebreak' }, textNode('b')),
      paragraph({ type: 'unknown' }),
    ])

    expect(editorStateToPlainText(editorState)).toBe('a\nb\n\n')
  })

  it('keeps mention text as raw text in the plain output', () => {
    const editorState = state([paragraph(textNode('@note', 'mention'))])

    expect(editorStateToPlainText(editorState)).toBe('@note\n')
  })

  it('returns an empty string for an empty document', () => {
    expect(editorStateToPlainText(state([]))).toBe('')
  })
})

describe('editorStateToDisplayText', () => {
  it('wraps mentions into wiki links', () => {
    const editorState = state([
      paragraph(textNode('see '), textNode('@note', 'mention')),
    ])

    expect(editorStateToDisplayText(editorState)).toBe('see [[note|@note]]\n')
  })

  it('drops the leading @ when the mention text has none', () => {
    const editorState = state([paragraph(textNode('note', 'mention'))])

    expect(editorStateToDisplayText(editorState)).toBe('[[note|note]]\n')
  })

  it('leaves ordinary text untouched', () => {
    const editorState = state([paragraph(textNode('plain'))])

    expect(editorStateToDisplayText(editorState)).toBe('plain\n')
  })
})
