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
  | { kind: 'missing-file'; link: string }

const FILE_EXTENSION = /\.[^./\\]+$/

/** True for paths that name a non-markdown file, e.g. `folder/image.png`. */
function isNonMarkdownPath(path: string): boolean {
  const extension = FILE_EXTENSION.exec(path)?.[0]
  return extension !== undefined && extension.toLowerCase() !== '.md'
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
): HandleReference[] | null {
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
        return isNonMarkdownPath(path) ? null : { kind: 'missing-file', link }
      }
      if (target.path === source.path || target.extension !== 'md') return null

      return { kind: 'linked', link, subpath, target }
    })
    .filter((candidate): candidate is Candidate => candidate !== null)

  const references: HandleReference[] = []
  const wholeFiles = new Set<string>()
  const seenExcerpts = new Set<string>()
  let contentCount = 0
  let noteCount = 0

  for (const candidate of candidates) {
    if (contentCount >= maxLinks) break

    if (candidate.kind === 'missing-file') {
      if (noteCount >= maxLinks) continue
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

    const subpathKey = `${target.path}\u0000${subpath.trim()}`
    if (seenExcerpts.has(subpathKey)) continue
    seenExcerpts.add(subpathKey)

    const targetCache = app.metadataCache.getFileCache(target)
    const hit = targetCache ? resolveSubpath(targetCache, subpath) : null
    if (!hit) {
      if (noteCount >= maxLinks) continue
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

  return references
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
 * reject the whole prompt instead of dropping single items.
 */
export async function collectReferenceBlocks(
  app: App,
  references: HandleReference[],
  initialLength: number,
): Promise<{ blocks: string[]; totalLength: number }> {
  const blocks: string[] = []
  let totalLength = initialLength

  for (const reference of references) {
    if (reference.kind === 'missing-file') {
      blocks.push(buildMissingFileBlock(reference.link))
      continue
    }
    if (reference.kind === 'missing-excerpt') {
      blocks.push(buildMissingExcerptBlock(reference.link))
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
      continue
    }

    const text = content
      .slice(reference.start, reference.end ?? content.length)
      .trim()
    blocks.push(buildExcerptBlock(reference.link, text))
    totalLength += text.length
  }

  return { blocks, totalLength }
}
