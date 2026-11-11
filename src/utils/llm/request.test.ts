import { describe, expect, it } from 'vitest'

import type { ContentPart, RequestMessage } from '../../types/request'

import { formatMessages } from './request'

const SEPARATOR = '\n\n---\n\n'

const user = (content: string | ContentPart[]): RequestMessage => ({
  role: 'user',
  content,
})

const assistant = (content: string): RequestMessage => ({
  role: 'assistant',
  content,
})

const system = (content: string): RequestMessage => ({
  role: 'system',
  content,
})

const text = (value: string): ContentPart => ({ type: 'text', text: value })

const image = (url: string): ContentPart => ({
  type: 'image_url',
  image_url: { url },
})

describe('formatMessages', () => {
  it('moves and concatenates every system message to the front', () => {
    const result = formatMessages([
      user('hello'),
      system('rule one'),
      assistant('hi'),
      system('  '),
      system('rule two'),
    ])

    expect(result[0]).toEqual({
      role: 'system',
      content: `rule one${SEPARATOR}rule two`,
    })
    expect(result.map((message) => message.role)).toEqual([
      'system',
      'user',
      'assistant',
    ])
  })

  it('drops an empty system message instead of adding a blank turn', () => {
    const result = formatMessages([user('hello'), system('   ')])
    expect(result).toEqual([{ role: 'user', content: 'hello' }])
  })

  it('merges consecutive messages of the same role', () => {
    const result = formatMessages([
      user('first'),
      user('second'),
      user('third'),
      assistant('answer'),
    ])

    expect(result).toEqual([
      { role: 'user', content: `first${SEPARATOR}second${SEPARATOR}third` },
      { role: 'assistant', content: 'answer' },
    ])
  })

  it('keeps alternating roles untouched', () => {
    const messages = [user('a'), assistant('b'), user('c')]
    expect(formatMessages(messages)).toEqual(messages)
  })

  it('drops blank user messages and lets the next turn merge normally', () => {
    const result = formatMessages([
      user('real'),
      user('   '),
      assistant('answer'),
      user('follow-up'),
    ])

    expect(result).toEqual([
      { role: 'user', content: 'real' },
      { role: 'assistant', content: 'answer' },
      { role: 'user', content: 'follow-up' },
    ])
  })

  it('treats content made only of blank text parts as empty', () => {
    const result = formatMessages([user([text(' '), text('\n')]), user('keep')])
    expect(result).toEqual([{ role: 'user', content: 'keep' }])
  })

  it('normalizes string and part content into parts when merging text', () => {
    const result = formatMessages([user([text('left')]), user('right')])

    expect(result).toEqual([{ role: 'user', content: `left${SEPARATOR}right` }])
  })

  it('keeps images and marks the boundary between merged turns', () => {
    const result = formatMessages([
      user([image('data:image/png;base64,AAA')]),
      user('caption'),
    ])

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          image('data:image/png;base64,AAA'),
          text(SEPARATOR),
          text('caption'),
        ],
      },
    ])
  })

  it('does not insert a separator when one side contributed nothing', () => {
    const result = formatMessages([
      user([image('data:image/png;base64,AAA')]),
      user('   '),
    ])

    expect(result).toEqual([
      {
        role: 'user',
        content: [image('data:image/png;base64,AAA')],
      },
    ])
  })

  it('never mutates the caller messages', () => {
    const first = user('first')
    const second = user('second')
    const messages = [first, second]

    formatMessages(messages)

    expect(messages).toEqual([first, second])
    expect(messages[0]).not.toBe(messages[1])
  })

  it('returns an empty list when there is nothing to send', () => {
    expect(formatMessages([])).toEqual([])
    expect(formatMessages([user('  ')])).toEqual([])
  })
})
