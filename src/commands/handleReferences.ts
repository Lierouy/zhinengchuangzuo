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
   * True when `maxLinks` cut something off: the scan stopped early because the
   * content cap was reached, or a missing-target note was skipped afterwards.
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
    if (contentCount >= maxLinks) {
      // Reaching the cap here means at least one candidate was left unprocessed.
      truncated = true
      break
    }

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
      wholeFiles.add(target.path)
      const removed = dropSupersededExcerpts(references, target.path)
      contentCount -= removed.excerpts
      noteCount -= removed.notes
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

/** Removes the excerpts and missing-text notes of `path` already collected. */
function dropSupersededExcerpts(
  references: HandleReference[],
  path: string,
): { excerpts: number; notes: number } {
  let excerpts = 0
  let notes = 0
  for (let i = references.length - 1; i >= 0; i -= 1) {
    const reference = references[i]
    if (reference.kind === 'excerpt' && reference.file.path === path) {
      references.splice(i, 1)
      excerpts += 1
      continue
    }
    if (reference.kind === 'missing-excerpt' && reference.path === path) {
      references.splice(i, 1)
      notes += 1
    }
  }
  return { excerpts, notes }
}

/**
 * Reads every reference in order and renders it as a prompt block.
 * `totalLength` covers the source file plus all included text, so the caller can
 * reject the whole prompt instead of dropping single items. `hasMissing` is true
 * when at least one block tells the model its target is unavailable.
 */
export async function collectReferenceBlocks(
  app: App,
  references: HandleReference[],
  initialLength: number,
): Promise<{ blocks: string[]; totalLength: number; hasMissing: boolean }> {
  const blocks: string[] = []
  let totalLength = initialLength
  let hasMissing = false

  for (const reference of references) {
    if (reference.kind === 'missing-file') {
      blocks.push(buildMissingFileBlock(reference.link))
      hasMissing = true
      continue
    }
    if (reference.kind === 'missing-excerpt') {
      blocks.push(buildMissingExcerptBlock(reference.link))
      hasMissing = true
      continue
    }

    const content = await app.vault.cachedRead(reference.file)
    if (reference.kind === 'file') {
      blocks.push(buildFileBlock(reference.link, content))
      totalLength += content.length
      continue
    }

    // The cached offsets no longer fit the file, most likely because it shrank.
    if (reference.start >= content.length) {
      blocks.push(buildMissingExcerptBlock(reference.link))
      hasMissing = true
      continue
    }

    const text = content
      .slice(reference.start, reference.end ?? content.length)
      .trim()
    blocks.push(buildExcerptBlock(reference.link, text))
    totalLength += text.length
  }

  return { blocks, totalLength, hasMissing }
}
