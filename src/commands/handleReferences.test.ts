import type { App, TFile } from 'obsidian'
import { describe, expect, it } from 'vitest'

import { makeTFile } from '../test/fakes/fakeApp'

import type { HandleReferenceScan } from './handleReferences'
import {
  collectReferenceBlocks,
  resolveHandleReferences,
} from './handleReferences'

type LinkInput = { link: string; original?: string; offset?: number }

function createApp({
  links = [],
  embeds = [],
  targets = {},
  contents = {},
}: {
  links?: LinkInput[]
  embeds?: LinkInput[]
  /** Keyed by lowercased linkpath, mirroring Obsidian's case-insensitive lookup. */
  targets?: Record<string, TFile>
  contents?: Record<string, string>
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
              links: links.map(toEntry),
              embeds: embeds.map((input, index) =>
                toEntry(input, links.length + index),
              ),
            }
          : {},
      getFirstLinkpathDest: (path: string) =>
        targets[path.toLowerCase()] ?? null,
    },
    vault: {
      cachedRead: async (file: TFile) => contents[file.path] ?? '',
    },
  } as unknown as App

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
    // target. The mocked resolver never resolves, so every link becomes a note.
    expect(scan.references).toHaveLength(4)
    expect(
      scan.references.every(
        (reference) => reference.kind === 'missing-excerpt',
      ),
    ).toBe(true)
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

  it('does not flag a prompt whose references all resolved', async () => {
    const { app } = createApp({ contents: { 'notes/a.md': 'content' } })
    const references: References = [
      { kind: 'file', link: '[[a]]', file: makeTFile('notes/a.md') },
    ]

    const result = await collectReferenceBlocks(app, references, 4)

    expect(result.hasMissing).toBe(false)
    expect(result.totalLength).toBe(4 + 'content'.length)
  })
})
