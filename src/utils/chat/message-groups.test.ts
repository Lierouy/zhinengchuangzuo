import { describe, expect, it } from 'vitest'

import type {
  ChatAssistantMessage,
  ChatMessage,
  ChatUserMessage,
} from '../../types/chat'

import { groupAssistantMessages } from './message-groups'

const userMessage = (id: string): ChatUserMessage => ({
  role: 'user',
  content: null,
  promptContent: '',
  id,
  mentionables: [],
})

const assistantMessage = (id: string): ChatAssistantMessage => ({
  role: 'assistant',
  content: `content ${id}`,
  id,
})

describe('groupAssistantMessages', () => {
  it('keeps user messages and groups consecutive assistant replies', () => {
    const messages: ChatMessage[] = [
      userMessage('u1'),
      assistantMessage('a1'),
      assistantMessage('a2'),
      userMessage('u2'),
      assistantMessage('a3'),
    ]

    const grouped = groupAssistantMessages(messages)

    expect(grouped).toHaveLength(4)
    expect(grouped[0]).toEqual(userMessage('u1'))
    expect(grouped[1]).toEqual([assistantMessage('a1'), assistantMessage('a2')])
    expect(grouped[2]).toEqual(userMessage('u2'))
    expect(grouped[3]).toEqual([assistantMessage('a3')])
  })

  it('opens a group when the conversation starts with an assistant reply', () => {
    const grouped = groupAssistantMessages([
      assistantMessage('a1'),
      assistantMessage('a2'),
    ])

    expect(grouped).toEqual([[assistantMessage('a1'), assistantMessage('a2')]])
  })

  it('returns an empty list for an empty conversation', () => {
    expect(groupAssistantMessages([])).toEqual([])
  })

  it('does not mutate the input array', () => {
    const messages = [userMessage('u1'), assistantMessage('a1')]
    const snapshot = [...messages]

    groupAssistantMessages(messages)

    expect(messages).toEqual(snapshot)
  })

  it('merges flattened assistant messages that arrive after a user turn', () => {
    const grouped = groupAssistantMessages([
      userMessage('u1'),
      assistantMessage('a1'),
      userMessage('u2'),
      assistantMessage('a2'),
      assistantMessage('a3'),
    ])

    expect(
      grouped.map((item) => (Array.isArray(item) ? item.length : 1)),
    ).toEqual([1, 1, 1, 2])
  })
})
