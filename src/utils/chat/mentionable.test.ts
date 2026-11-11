import { describe, expect, it } from 'vitest'

import { createFakeApp, makeTFile, makeTFolder } from '../../test/fakes/fakeApp'
import type {
  Mentionable,
  SerializedMentionable,
} from '../../types/mentionable'

import {
  countMissingMentionables,
  deserializeMentionable,
  getMentionableKey,
  getMentionableName,
  getPathBasename,
  serializeMentionable,
} from './mentionable'

describe('serializeMentionable', () => {
  it('reduces file and folder mentions to their path', () => {
    expect(
      serializeMentionable({
        type: 'file',
        file: makeTFile('notes/a.md'),
        path: 'notes/a.md',
      }),
    ).toEqual({ type: 'file', file: 'notes/a.md' })

    expect(
      serializeMentionable({
        type: 'folder',
        folder: makeTFolder('notes'),
        path: 'notes',
      }),
    ).toEqual({ type: 'folder', folder: 'notes' })
  })

  it('serializes a current-file mention with an optional path', () => {
    expect(
      serializeMentionable({
        type: 'current-file',
        file: makeTFile('a.md'),
      }),
    ).toEqual({ type: 'current-file', file: 'a.md' })
    expect(serializeMentionable({ type: 'current-file', file: null })).toEqual({
      type: 'current-file',
      file: null,
    })
  })

  it('keeps block ranges and image payloads', () => {
    expect(
      serializeMentionable({
        type: 'block',
        content: 'excerpt',
        file: makeTFile('a.md'),
        path: 'a.md',
        startLine: 2,
        endLine: 4,
      }),
    ).toEqual({
      type: 'block',
      content: 'excerpt',
      file: 'a.md',
      startLine: 2,
      endLine: 4,
    })

    expect(
      serializeMentionable({
        type: 'image',
        name: 'cat.png',
        mimeType: 'image/png',
        data: 'AAA',
      }),
    ).toEqual({
      type: 'image',
      name: 'cat.png',
      mimeType: 'image/png',
      data: 'AAA',
    })
  })
})

describe('deserializeMentionable', () => {
  it('resolves files that still exist and keeps the path otherwise', () => {
    const { app, vault } = createFakeApp({ 'notes/a.md': 'body' })

    expect(
      deserializeMentionable({ type: 'file', file: 'notes/a.md' }, app),
    ).toMatchObject({ type: 'file', path: 'notes/a.md' })

    const missing = deserializeMentionable(
      { type: 'file', file: 'gone.md' },
      app,
    )
    expect(missing).toMatchObject({ type: 'file', path: 'gone.md' })
    expect(missing?.type === 'file' ? missing.file : 'unexpected').toBeNull()
    expect(vault.files.has('notes/a.md')).toBe(true)
  })

  it('restores folders, current files, blocks and images', () => {
    const { app } = createFakeApp({ 'notes/a.md': 'body' })

    expect(
      deserializeMentionable({ type: 'folder', folder: 'notes' }, app),
    ).toMatchObject({ type: 'folder', path: 'notes' })

    expect(
      deserializeMentionable({ type: 'current-file', file: 'notes/a.md' }, app),
    ).toMatchObject({ type: 'current-file', file: { path: 'notes/a.md' } })

    expect(
      deserializeMentionable(
        {
          type: 'block',
          content: 'excerpt',
          file: 'notes/a.md',
          startLine: 1,
          endLine: 2,
        },
        app,
      ),
    ).toMatchObject({
      type: 'block',
      path: 'notes/a.md',
      startLine: 1,
      endLine: 2,
    })

    expect(
      deserializeMentionable(
        { type: 'image', name: 'cat.png', mimeType: 'image/png', data: 'AAA' },
        app,
      ),
    ).toEqual({
      type: 'image',
      name: 'cat.png',
      mimeType: 'image/png',
      data: 'AAA',
    })
  })
})

describe('getMentionableKey', () => {
  it('distinguishes every mentionable type', () => {
    const keys = [
      getMentionableKey({ type: 'file', file: 'a.md' }),
      getMentionableKey({ type: 'folder', folder: 'a.md' }),
      getMentionableKey({ type: 'current-file', file: 'a.md' }),
      getMentionableKey({ type: 'current-file', file: null }),
      getMentionableKey({
        type: 'block',
        content: 'x',
        file: 'a.md',
        startLine: 1,
        endLine: 2,
      }),
      getMentionableKey({
        type: 'image',
        name: 'x.png',
        mimeType: 'image/png',
        data: 'AAA',
      }),
    ]

    expect(new Set(keys).size).toBe(keys.length)
  })

  it('changes the block and image keys when the content changes', () => {
    const block = (content: string): SerializedMentionable => ({
      type: 'block',
      content,
      file: 'a.md',
      startLine: 1,
      endLine: 2,
    })

    expect(getMentionableKey(block('first'))).not.toBe(
      getMentionableKey(block('second')),
    )
  })
})

describe('countMissingMentionables', () => {
  it('counts files and folders that no longer exist', () => {
    const { app } = createFakeApp({ 'a.md': 'body' })
    const mentionables: Mentionable[] = [
      { type: 'file', file: makeTFile('a.md'), path: 'a.md' },
      { type: 'file', file: makeTFile('gone.md'), path: 'gone.md' },
      { type: 'folder', folder: null, path: 'gone-folder' },
      { type: 'current-file', file: null },
      { type: 'image', name: 'x.png', mimeType: 'image/png', data: 'AAA' },
    ]

    expect(countMissingMentionables(mentionables, app)).toBe(2)
  })
})

describe('getMentionableName', () => {
  it('falls back to the path when the entity is gone', () => {
    expect(
      getMentionableName({ type: 'file', file: null, path: 'dir/a.md' }),
    ).toBe('a.md')
    expect(
      getMentionableName({ type: 'folder', folder: null, path: 'dir' }),
    ).toBe('dir')
    expect(getMentionableName({ type: 'current-file', file: null })).toBe(
      'Current File',
    )
  })

  it('formats blocks with their line range', () => {
    expect(
      getMentionableName({
        type: 'block',
        content: 'x',
        file: makeTFile('a.md'),
        path: 'a.md',
        startLine: 3,
        endLine: 5,
      }),
    ).toBe('a.md (3-5)')
  })
})

describe('getPathBasename', () => {
  it('returns the last segment and falls back to the input', () => {
    expect(getPathBasename('dir/sub/a.md')).toBe('a.md')
    expect(getPathBasename('')).toBe('')
  })
})
