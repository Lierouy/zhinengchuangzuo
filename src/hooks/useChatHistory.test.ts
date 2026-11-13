import type { SerializedEditorState } from 'lexical'
import { describe, expect, it } from 'vitest'

import type { ChatAssistantMessage, ChatMessage } from '../types/chat'

import { deriveChatTitle } from './useChatHistory'

const editorState = (text: string): SerializedEditorState =>
  ({
    root: {
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'text', text }] }],
    },
  }) as unknown as SerializedEditorState

const user = (text: string): ChatMessage => ({
  role: 'user',
  content: editorState(text),
  promptContent: null,
  id: 'u1',
  mentionables: [],
})

const assistant = (text: string): ChatAssistantMessage => ({
  role: 'assistant',
  content: text,
  id: 'a1',
})

describe('deriveChatTitle', () => {
  it('uses the first user message text', () => {
    expect(deriveChatTitle([user('Hello there'), assistant('Hi')])).toBe(
      'Hello there',
    )
  })

  it('uses the first assistant message when the conversation starts with one', () => {
    expect(deriveChatTitle([assistant('Summary of the note')])).toBe(
      'Summary of the note',
    )
  })

  it('trims surrounding whitespace instead of keeping a blank title', () => {
    expect(deriveChatTitle([assistant('  spaced answer \n')])).toBe(
      'spaced answer',
    )
  })

  it('truncates to the shared name length limit', () => {
    const title = deriveChatTitle([assistant('x'.repeat(100))])
    expect(title).toHaveLength(40)
  })

  it('falls back when there is no message or no usable text', () => {
    expect(deriveChatTitle([])).toBe('New chat')
    expect(deriveChatTitle([assistant('   ')])).toBe('New chat')
    expect(
      deriveChatTitle([
        {
          role: 'user',
          content: null,
          promptContent: null,
          id: 'u1',
          mentionables: [],
        },
      ]),
    ).toBe('New chat')
  })
})
