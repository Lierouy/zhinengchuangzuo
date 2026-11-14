import type { App, TFile } from 'obsidian'
import { describe, expect, it, vi } from 'vitest'

import { makeTFile } from '../test/fakes/fakeApp'

import type { HandleReferenceScan } from './handleReferences'
import {
  collectReferenceBlocks,
  resolveHandleReferences,
} from './handleReferences'

/** The offsets a mocked `resolveSubpath` reports for one heading or block. */
type SubpathOffsets = { start: number; end?: number | null }

type SubpathResult = {
  start: { line: number; col: number; offset: number }
  end: { line: number; col: number; offset: number } | null
}

/**
 * The shared Obsidian mock resolves no subpath at all, so the excerpt code path
 * is unreachable without replacing it. This module only imports types from
 * `obsidian`, so overriding one export is safe.
 */
const resolveSubpathMock = vi.hoisted(() =>
  vi.fn<(_cache: unknown, _subpath: string) => SubpathResult | null>(
    () => null,
  ),
)

vi.mock('obsidian', async (importOriginal) => ({
  ...(await importOriginal<typeof import('obsidian')>()),
  resolveSubpath: resolveSubpathMock,
}))

type LinkInput = { link: string; original?: string; offset?: number }

function createApp({
  links = [],
  embeds = [],
  targets = {},
  contents = {},
  subpaths = {},
}: {
  links?: LinkInput[]
  embeds?: LinkInput[]
  /** Keyed by lowercased linkpath, mirroring Obsidian's case-insensitive lookup. */
  targets?: Record<string, TFile>
  contents?: Record<string, string>
  /** Keyed by `${filePath}\u0000${subpath}`; every other subpath stays unresolved. */
  subpaths?: Record<string, SubpathOffsets>
} = {}): { app: App; source: TFile } {
  const source = makeTFile('notes/source.md')

  const toEntry = (input: LinkInput, index: number) => ({
    link: input.link,
    original: input.original,
    position: { start: { offset: input.offset ?? index * 10 } },
  })

  const app = {
    metadataCache: {
      getFileCache: (file: TFile) =>
        file.path === source.path
          ? {
              path: file.path,
              links: links.map(toEntry),
              embeds: embeds.map((input, index) =>
                toEntry(input, links.length + index),
              ),
            }
          : { path: file.path },
      getFirstLinkpathDest: (path: string) =>
        targets[path.toLowerCase()] ?? null,
    },
    vault: {
      cachedRead: async (file: TFile) => contents[file.path] ?? '',
    },
  } as unknown as App

  const at = (offset: number) => ({ line: 0, col: 0, offset })
  resolveSubpathMock.mockReset()
  resolveSubpathMock.mockImplementation((cache, subpath) => {
    const path = (cache as { path?: string } | null)?.path ?? ''
    const offsets = subpaths[`${path}\u0000${subpath}`]
    if (!offsets) return null
    return {
      start: at(offsets.start),
      end:
        offsets.end === null || offsets.end === undefined
          ? null
          : at(offsets.end),
    }
  })

  return { app, source }
}

function expectScan(scan: HandleReferenceScan | null): HandleReferenceScan {
  if (!scan) throw new Error('expected the source file to be indexed')
  return scan
}

describe('resolveHandleReferences', () => {
  it('collapses repeated broken links into one note, ignoring case', () => {
    const { app, source } = createApp({
      links: [{ link: 'Book' }, { link: 'bOOK' }],
    })

    const scan = expectScan(resolveHandleReferences(app, source, 30))

    expect(scan.references).toHaveLength(1)
    expect(scan.references[0]).toMatchObject({
      kind: 'missing-file',
      link: '[[Book]]',
    })
    expect(scan.truncated).toBe(false)
  })

  it('collapses broken links that differ only in the md suffix', () => {
    const { app, source } = createApp({
      links: [{ link: 'Notes/Book' }, { link: 'Notes/Book.MD', offset: 20 }],
    })

    const scan = expectScan(resolveHandleReferences(app, source, 30))

    expect(scan.references).toHaveLength(1)
    expect(scan.references[0]).toMatchObject({
      kind: 'missing-file',
      link: '[[Notes/Book]]',
    })
  })

  it('keeps heading and block links case-sensitive', () => {
    const { app, source } = createApp({
      links: [
        { link: 'note#Intro' },
        { link: 'note#intro' },
        { link: 'note#^Blk' },
        { link: 'note#^blk' },
      ],
      targets: { note: makeTFile('notes/note.md') },
    })

    const scan = expectScan(resolveHandleReferences(app, source, 30))

    // `resolveSubpath` matches case-sensitively, so each casing is a distinct
    // target. Nothing resolves here, so every link becomes a note.
    expect(scan.references).toHaveLength(4)
    expect(
      scan.references.every(
        (reference) => reference.kind === 'missing-excerpt',
      ),
    ).toBe(true)
  })

  it('renders an excerpt when the subpath resolves', () => {
    const { app, source } = createApp({
      links: [{ link: 'note#Intro' }],
      targets: { note: makeTFile('notes/note.md') },
      subpaths: { 'notes/note.md\u0000#Intro': { start: 4, end: 14 } },
    })

    const scan = expectScan(resolveHandleReferences(app, source, 30))

    expect(scan.references).toHaveLength(1)
    expect(scan.references[0]).toMatchObject({
      kind: 'excerpt',
      link: '[[note#Intro]]',
      start: 4,
      end: 14,
    })
    expect(scan.truncated).toBe(false)
  })

  it('drops the second link when two subpaths resolve to the same offset', () => {
    const { app, source } = createApp({
      links: [{ link: 'note#Intro' }, { link: 'note#^blk' }],
      targets: { note: makeTFile('notes/note.md') },
      subpaths: {
        'notes/note.md\u0000#Intro': { start: 4 },
        'notes/note.md\u0000#^blk': { start: 4 },
      },
    })

    const scan = expectScan(resolveHandleReferences(app, source, 30))

    expect(scan.references.map((reference) => reference.link)).toEqual([
      '[[note#Intro]]',
    ])
    expect(scan.truncated).toBe(false)
  })

  it('ignores excerpts of a file that was already included whole', () => {
    const { app, source } = createApp({
      links: [{ link: 'note' }, { link: 'note#Intro' }],
      targets: { note: makeTFile('notes/note.md') },
      subpaths: { 'notes/note.md\u0000#Intro': { start: 0 } },
    })

    const scan = expectScan(resolveHandleReferences(app, source, 30))

    expect(scan.references.map((reference) => reference.kind)).toEqual(['file'])
    expect(scan.truncated).toBe(false)
  })

  it('replaces earlier excerpts with the whole file at the cap', () => {
    const { app, source } = createApp({
      links: [{ link: 'note#Intro' }, { link: 'note' }],
      targets: { note: makeTFile('notes/note.md') },
      subpaths: { 'notes/note.md\u0000#Intro': { start: 0, end: 5 } },
    })

    const scan = expectScan(resolveHandleReferences(app, source, 1))

    expect(scan.references).toHaveLength(1)
    expect(scan.references[0]).toMatchObject({
      kind: 'file',
      link: '[[note]]',
      file: { path: 'notes/note.md' },
    })
    // The excerpt is replaced instead of added on top, so the cap still holds.
    expect(scan.truncated).toBe(false)
  })

  it('reclaims the note budget when a whole file replaces a missing excerpt', () => {
    const { app, source } = createApp({
      links: [{ link: 'note#gone' }, { link: 'note' }, { link: 'missing' }],
      targets: { note: makeTFile('notes/note.md') },
    })

    const scan = expectScan(resolveHandleReferences(app, source, 1))

    expect(scan.references.map((reference) => reference.kind)).toEqual([
      'file',
      'missing-file',
    ])
    expect(scan.truncated).toBe(false)
  })

  it('reports truncation when the content cap stops a resolved excerpt', () => {
    const { app, source } = createApp({
      links: [{ link: 'a' }, { link: 'note#Intro' }],
      targets: { a: makeTFile('notes/a.md'), note: makeTFile('notes/note.md') },
      subpaths: { 'notes/note.md\u0000#Intro': { start: 0 } },
    })

    const scan = expectScan(resolveHandleReferences(app, source, 1))

    expect(scan.references.map((reference) => reference.kind)).toEqual(['file'])
    expect(scan.truncated).toBe(true)
  })

  it('caps the notes produced by unresolved subpaths', () => {
    const { app, source } = createApp({
      links: [{ link: 'a#gone' }, { link: 'b#gone' }],
      targets: { a: makeTFile('notes/a.md'), b: makeTFile('notes/b.md') },
    })

    const scan = expectScan(resolveHandleReferences(app, source, 1))

    expect(scan.references.map((reference) => reference.kind)).toEqual([
      'missing-excerpt',
    ])
    expect(scan.truncated).toBe(true)
  })

  it('reports truncation when the content cap stops the scan', () => {
    const { app, source } = createApp({
      links: [{ link: 'a' }, { link: 'b' }, { link: 'c' }],
      targets: {
        a: makeTFile('notes/a.md'),
        b: makeTFile('notes/b.md'),
        c: makeTFile('notes/c.md'),
      },
    })

    const scan = expectScan(resolveHandleReferences(app, source, 2))

    expect(scan.references).toHaveLength(2)
    expect(scan.truncated).toBe(true)
  })

  it('does not report truncation when every candidate is consumed', () => {
    const { app, source } = createApp({
      links: [{ link: 'a' }, { link: 'b' }],
      targets: {
        a: makeTFile('notes/a.md'),
        b: makeTFile('notes/b.md'),
      },
    })

    const scan = expectScan(resolveHandleReferences(app, source, 2))

    expect(scan.references).toHaveLength(2)
    expect(scan.truncated).toBe(false)
  })

  it('does not report truncation when the leftover candidate is a duplicate', () => {
    const { app, source } = createApp({
      links: [{ link: 'a' }, { link: 'b' }, { link: 'a' }],
      targets: {
        a: makeTFile('notes/a.md'),
        b: makeTFile('notes/b.md'),
      },
    })

    const scan = expectScan(resolveHandleReferences(app, source, 2))

    expect(scan.references.map((reference) => reference.link)).toEqual([
      '[[a]]',
      '[[b]]',
    ])
    expect(scan.truncated).toBe(false)
  })

  it('does not report truncation for a repeated link at the cap', () => {
    const { app, source } = createApp({
      links: [{ link: 'a' }, { link: 'a' }],
      targets: { a: makeTFile('notes/a.md') },
    })

    const scan = expectScan(resolveHandleReferences(app, source, 1))

    expect(scan.references).toHaveLength(1)
    expect(scan.truncated).toBe(false)
  })

  it('keeps collecting content after the note cap is reached', () => {
    const { app, source } = createApp({
      links: [{ link: 'missing-one' }, { link: 'missing-two' }, { link: 'a' }],
      targets: { a: makeTFile('notes/a.md') },
    })

    const scan = expectScan(resolveHandleReferences(app, source, 1))

    expect(scan.references.map((reference) => reference.kind)).toEqual([
      'missing-file',
      'file',
    ])
    expect(scan.truncated).toBe(true)
  })

  it('does not spend the note budget on duplicated broken links', () => {
    const { app, source } = createApp({
      links: [{ link: 'gone' }, { link: 'GONE' }, { link: 'a' }],
      targets: { a: makeTFile('notes/a.md') },
    })

    const scan = expectScan(resolveHandleReferences(app, source, 1))

    expect(scan.references.map((reference) => reference.kind)).toEqual([
      'missing-file',
      'file',
    ])
    expect(scan.truncated).toBe(false)
  })
})

describe('collectReferenceBlocks', () => {
  type References = Parameters<typeof collectReferenceBlocks>[1]

  /** App whose reads are recorded, so the early exit can be observed. */
  function createReadCountingApp(contents: Record<string, string> = {}) {
    const reads: string[] = []
    const app = {
      vault: {
        cachedRead: async (file: TFile) => {
          reads.push(file.path)
          return contents[file.path] ?? ''
        },
      },
    } as unknown as App
    return { app, reads }
  }

  const fileReference = (path: string): References[number] => ({
    kind: 'file',
    link: `[[${path}]]`,
    file: makeTFile(path),
  })

  it('flags a prompt that carries a missing-file note', async () => {
    const { app } = createApp()
    const references: References = [{ kind: 'missing-file', link: '[[gone]]' }]

    const result = await collectReferenceBlocks(app, references, 4)

    expect(result.hasMissing).toBe(true)
    expect(result.blocks[0]).toContain('(文件缺失)')
  })

  it('flags a note produced when the cached offsets no longer fit', async () => {
    const { app } = createApp({ contents: { 'notes/a.md': 'short' } })
    const references: References = [
      {
        kind: 'excerpt',
        link: '[[a#gone]]',
        file: makeTFile('notes/a.md'),
        start: 99,
        end: null,
      },
    ]

    const result = await collectReferenceBlocks(app, references, 4)

    expect(result.hasMissing).toBe(true)
    expect(result.blocks[0]).toContain('(文本缺失)')
  })

  it('renders only the requested range of an excerpt', async () => {
    const { app } = createApp({
      contents: { 'notes/a.md': 'before [target] after' },
    })
    const references: References = [
      {
        kind: 'excerpt',
        link: '[[a#target]]',
        file: makeTFile('notes/a.md'),
        start: 7,
        end: 15,
      },
    ]

    const result = await collectReferenceBlocks(app, references, 0)

    expect(result.hasMissing).toBe(false)
    expect(result.blocks[0]).toContain('[target]')
    expect(result.blocks[0]).not.toContain('before')
  })

  it('does not flag a prompt whose references all resolved', async () => {
    const { app } = createApp({ contents: { 'notes/a.md': 'content' } })
    const references: References = [
      { kind: 'file', link: '[[a]]', file: makeTFile('notes/a.md') },
    ]

    const result = await collectReferenceBlocks(app, references, 4)

    expect(result.hasMissing).toBe(false)
    expect(result.exceeded).toBe(false)
    expect(result.blocks).toHaveLength(1)
  })

  it('counts the initial length against the budget', async () => {
    const { app } = createApp({ contents: { 'notes/a.md': 'content' } })
    const references: References = [
      { kind: 'file', link: '[[a]]', file: makeTFile('notes/a.md') },
    ]

    // 4 characters of source plus 7 read characters: `>` leaves the exact fit.
    expect(
      (await collectReferenceBlocks(app, references, 4, 11)).exceeded,
    ).toBe(false)
    expect(
      (await collectReferenceBlocks(app, references, 4, 10)).exceeded,
    ).toBe(true)
  })

  it('stops reading the remaining files once the budget is exceeded', async () => {
    const { app, reads } = createReadCountingApp({
      'notes/a.md': 'a'.repeat(40),
      'notes/b.md': 'b'.repeat(40),
      'notes/c.md': 'c'.repeat(40),
    })

    const result = await collectReferenceBlocks(
      app,
      [
        fileReference('notes/a.md'),
        fileReference('notes/b.md'),
        fileReference('notes/c.md'),
      ],
      0,
      60,
    )

    expect(result.exceeded).toBe(true)
    // The third file is never read: the prompt is rejected anyway.
    expect(reads).toEqual(['notes/a.md', 'notes/b.md'])
  })

  it('collects every file when it stays within the budget', async () => {
    const { app, reads } = createReadCountingApp({
      'notes/a.md': 'a'.repeat(10),
      'notes/b.md': 'b'.repeat(10),
    })

    const result = await collectReferenceBlocks(
      app,
      [fileReference('notes/a.md'), fileReference('notes/b.md')],
      0,
      20,
    )

    // Exactly at the cap is still inside it.
    expect(result.exceeded).toBe(false)
    expect(reads).toHaveLength(2)
  })
})
