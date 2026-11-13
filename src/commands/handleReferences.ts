import { App, TFile, parseLinktext, resolveSubpath } from 'obsidian'

import {
  buildExcerptBlock,
  buildFileBlock,
  buildMissingExcerptBlock,
  buildMissingFileBlock,
} from './handlePrompt'

type HandleReference =
  | { kind: 'file'; link: string; file: TFile }
  | {
      kind: 'excerpt'
      link: string
      file: TFile
      start: number
      end: number | null
    }
  | { kind: 'missing-file'; link: string }
  | { kind: 'missing-excerpt'; link: string; path: string }

type Candidate =
  | { kind: 'linked'; link: string; subpath: string; target: TFile }
  | { kind: 'missing-file'; link: string; path: string }

const FILE_EXTENSION = /\.[^./\\]+$/

/**
 * Vault paths are case-insensitive in Obsidian, so `[[Book]]` and `[[bOOK]]`
 * name the same missing file and share one note. Headings and block ids are
 * matched case-sensitively by `resolveSubpath`, so they keep their own casing.
 */
function filePathKey(path: string): string {
  return path.trim().toLowerCase()
}

/** True for paths that name a non-markdown file, e.g. `folder/image.png`. */
function isNonMarkdownPath(path: string): boolean {
  const extension = FILE_EXTENSION.exec(path)?.[0]
  return extension !== undefined && extension.toLowerCase() !== '.md'
}

/** Outcome of {@link resolveHandleReferences}. */
export type HandleReferenceScan = {
  references: HandleReference[]
  /**
   * True when `maxLinks` cut something off: a link that would have been
   * included was dropped because the content or note budget was already full.
   * Duplicates and self-references never set it, because they are skipped for
   * reasons unrelated to the limit.
   */
  truncated: boolean
}

/**
 * Resolves the links of `source` in document order. Links to the source itself,
 * to non-markdown files and in-document anchors are skipped.
 *
 * A whole-file link supersedes the excerpts of the same file collected before
 * it, but only once that link is actually accepted, so links beyond `maxLinks`
 * never affect earlier content. Returns `null` when the file is not indexed yet.
 */
export function resolveHandleReferences(
  app: App,
  source: TFile,
  maxLinks: number,
): HandleReferenceScan | null {
  const cache = app.metadataCache.getFileCache(source)
  if (!cache) return null

  const candidates = [...(cache.links ?? []), ...(cache.embeds ?? [])]
    .sort((a, b) => a.position.start.offset - b.position.start.offset)
    .map((reference): Candidate | null => {
      const original = reference.original
      const link = original ? original : `[[${reference.link}]]`
      const { path, subpath } = parseLinktext(reference.link)
      if (!path) return null

      const target = app.metadataCache.getFirstLinkpathDest(path, source.path)
      if (!target) {
        // A missing asset such as `[[image.png]]` is expected; stay silent.
        return isNonMarkdownPath(path)
          ? null
          : { kind: 'missing-file', link, path }
      }
      if (target.path === source.path || target.extension !== 'md') return null

      return { kind: 'linked', link, subpath, target }
    })
    .filter((candidate): candidate is Candidate => candidate !== null)

  const references: HandleReference[] = []
  const wholeFiles = new Set<string>()
  const seenExcerpts = new Set<string>()
  const seenMissingFiles = new Set<string>()
  let contentCount = 0
  let noteCount = 0
  let truncated = false

  for (const candidate of candidates) {
    if (candidate.kind === 'missing-file') {
      // Repeated mentions of one broken path collapse into a single note, and a
      // duplicate is dropped before the note budget is consulted.
      const key = filePathKey(candidate.path)
      if (seenMissingFiles.has(key)) continue
      seenMissingFiles.add(key)
      if (noteCount >= maxLinks) {
        truncated = true
        continue
      }
      noteCount += 1
      references.push({ kind: 'missing-file', link: candidate.link })
      continue
    }

    const { target, subpath, link } = candidate
    if (!subpath) {
      if (wholeFiles.has(target.path)) continue
      // A whole-file link replaces the excerpts and notes about that file, which
      // frees content and note budget before the cap is checked: `[[note]]` after
      // two excerpts of the same note must not be rejected for replacing them.
      const superseded = findSupersededReferences(references, target.path)
      if (contentCount - superseded.excerpts >= maxLinks) {
        truncated = true
        continue
      }
      for (const index of superseded.indexes) references.splice(index, 1)
      wholeFiles.add(target.path)
      contentCount -= superseded.excerpts
      noteCount -= superseded.notes
      contentCount += 1
      references.push({ kind: 'file', link, file: target })
      continue
    }
    if (wholeFiles.has(target.path)) continue

    // Case-sensitive like `resolveSubpath`: `#Intro` and `#intro` are different
    // targets, and merging them before resolving would either hide a broken link
    // or drop the one that actually resolves.
    const subpathKey = `${target.path}\u0000${subpath.trim()}`
    if (seenExcerpts.has(subpathKey)) continue
    seenExcerpts.add(subpathKey)

    const targetCache = app.metadataCache.getFileCache(target)
    const hit = targetCache ? resolveSubpath(targetCache, subpath) : null
    if (!hit) {
      if (noteCount >= maxLinks) {
        truncated = true
        continue
      }
      noteCount += 1
      references.push({ kind: 'missing-excerpt', link, path: target.path })
      continue
    }

    // Catches differently written links that resolve to the same location.
    const offsetKey = `${target.path}\u0000@${hit.start.offset}`
    if (seenExcerpts.has(offsetKey)) continue
    seenExcerpts.add(offsetKey)

    if (contentCount >= maxLinks) {
      truncated = true
      continue
    }
    contentCount += 1
    references.push({
      kind: 'excerpt',
      link,
      file: target,
      start: hit.start.offset,
      end: hit.end?.offset ?? null,
    })
  }

  return { references, truncated }
}

type SupersededReferences = {
  indexes: number[]
  excerpts: number
  notes: number
}

/**
 * Positions of the references a whole-file link of `path` replaces, with the
 * budget each of them held. Indexes descend so the caller can splice them out in
 * order.
 */
function findSupersededReferences(
  references: HandleReference[],
  path: string,
): SupersededReferences {
  const superseded: SupersededReferences = {
    indexes: [],
    excerpts: 0,
    notes: 0,
  }
  for (let i = references.length - 1; i >= 0; i -= 1) {
    const reference = references[i]
    if (reference.kind === 'excerpt' && reference.file.path === path) {
      superseded.excerpts += 1
      superseded.indexes.push(i)
    } else if (
      reference.kind === 'missing-excerpt' &&
      reference.path === path
    ) {
      superseded.notes += 1
      superseded.indexes.push(i)
    }
  }
  return superseded
}

/**
 * Reads the references in order and renders them as prompt blocks. `hasMissing`
 * is true when at least one block tells the model its target is unavailable.
 *
 * `initialLength` is the length of the surrounding prompt, i.e. the source
 * document that is not read here. When the running total passes `maxChars` the
 * remaining files are not read at all: the caller rejects the prompt, so reading
 * them would only cost memory and time. `exceeded` reports that early exit.
 */
export async function collectReferenceBlocks(
  app: App,
  references: HandleReference[],
  initialLength: number,
  maxChars = Number.POSITIVE_INFINITY,
): Promise<{ blocks: string[]; hasMissing: boolean; exceeded: boolean }> {
  const blocks: string[] = []
  let totalLength = initialLength
  let hasMissing = false

  for (const reference of references) {
    if (
      reference.kind === 'missing-file' ||
      reference.kind === 'missing-excerpt'
    ) {
      blocks.push(
        reference.kind === 'missing-file'
          ? buildMissingFileBlock(reference.link)
          : buildMissingExcerptBlock(reference.link),
      )
      hasMissing = true
      continue
    }

    const content = await app.vault.cachedRead(reference.file)
    if (reference.kind === 'file') {
      blocks.push(buildFileBlock(reference.link, content))
      totalLength += content.length
    } else if (reference.start >= content.length) {
      // The cached offsets no longer fit the file, most likely because it shrank.
      blocks.push(buildMissingExcerptBlock(reference.link))
      hasMissing = true
      continue
    } else {
      const text = content
        .slice(reference.start, reference.end ?? content.length)
        .trim()
      blocks.push(buildExcerptBlock(reference.link, text))
      totalLength += text.length
    }

    if (totalLength > maxChars) {
      return { blocks, hasMissing, exceeded: true }
    }
  }

  return { blocks, hasMissing, exceeded: false }
}
