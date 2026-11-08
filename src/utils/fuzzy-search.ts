import {
  SnapshotKeys,
  go as fuzzysortGo,
  snapshot as fuzzysortSnapshot,
} from 'fuzzysort'
import { App, EventRef, TFile, TFolder } from 'obsidian'

import { MentionableFile, MentionableFolder } from '../types/mentionable'

import { calculateFileDistance } from './obsidian'

export type SearchableMentionable = MentionableFile | MentionableFolder

type FileWithMetadata = {
  type: 'file'
  path: string
  name: string
  file: TFile
  distance: number | null
  daysSinceLastModified: number
}

type FolderWithMetadata = {
  type: 'folder'
  path: string
  name: string
  folder: TFolder
  distance: number | null
}

type SearchItem = FolderWithMetadata | FileWithMetadata

const MS_PER_DAY = 1000 * 60 * 60 * 24
const VAULT_INVALIDATE_DEBOUNCE_MS = 200
const EMPTY_QUERY_LIMIT = 15

/**
 * The vault rarely changes, so the metadata list and the prepared fuzzysort
 * snapshot are built once and reused for every keystroke. They are dropped
 * only when the active file changes (distances are relative to it) or when
 * files are created, deleted or renamed.
 */
type SearchIndex = {
  currentFilePath: string | null
  items: SearchItem[]
  snapshot: SnapshotKeys<SearchItem>
}

let searchIndex: SearchIndex | null = null
let invalidateTimer: ReturnType<typeof setTimeout> | null = null
let listeningApp: App | null = null
const vaultEventRefs: EventRef[] = []

function scheduleIndexInvalidation(): void {
  if (invalidateTimer !== null) {
    clearTimeout(invalidateTimer)
  }
  invalidateTimer = setTimeout(() => {
    invalidateTimer = null
    searchIndex = null
  }, VAULT_INVALIDATE_DEBOUNCE_MS)
}

/**
 * Drops the cached index together with every vault listener it registered.
 * Called on plugin unload so a reload cannot keep listening to a dead app.
 */
export function disposeSearchIndex(): void {
  if (invalidateTimer !== null) {
    clearTimeout(invalidateTimer)
    invalidateTimer = null
  }
  if (listeningApp) {
    for (const ref of vaultEventRefs) {
      listeningApp.vault.offref(ref)
    }
  }
  vaultEventRefs.length = 0
  listeningApp = null
  searchIndex = null
}

function ensureVaultListeners(app: App): void {
  if (listeningApp === app) return
  // The index belongs to a single app instance; drop the previous listeners.
  disposeSearchIndex()
  listeningApp = app
  // `modify` keeps the "recently edited" boost of a cached index from ageing.
  vaultEventRefs.push(
    app.vault.on('create', scheduleIndexInvalidation),
    app.vault.on('delete', scheduleIndexInvalidation),
    app.vault.on('rename', scheduleIndexInvalidation),
    app.vault.on('modify', scheduleIndexInvalidation),
  )
}

/**
 * Distance is a property of the target's directory, not of the individual
 * file, so it is computed once per directory instead of once per vault item.
 */
function createDirectoryDistanceResolver(
  currentFile: TFile | null,
): (item: TFile | TFolder) => number | null {
  const cache = new Map<string, number | null>()

  return (item) => {
    if (!currentFile) return null
    const separator = item.path.lastIndexOf('/')
    const dir = separator === -1 ? '' : item.path.slice(0, separator)
    const cached = cache.get(dir)
    if (cached !== undefined) return cached

    const distance = calculateFileDistance(currentFile, item)
    cache.set(dir, distance)
    return distance
  }
}

function buildIndex(app: App): SearchIndex {
  const currentFile = app.workspace.getActiveFile()
  const resolveDistance = createDirectoryDistanceResolver(currentFile)
  const now = Date.now()

  const items: SearchItem[] = []
  for (const file of app.vault.getFiles()) {
    if (file.extension !== 'md') continue
    items.push({
      type: 'file',
      path: file.path,
      name: file.name,
      file,
      // The active file itself is never "nearby".
      distance:
        currentFile && currentFile.path !== file.path
          ? resolveDistance(file)
          : null,
      daysSinceLastModified: (now - file.stat.mtime) / MS_PER_DAY,
    })
  }

  for (const folder of app.vault.getAllFolders()) {
    items.push({
      type: 'folder',
      path: folder.path,
      name: folder.name,
      folder,
      distance: resolveDistance(folder),
    })
  }

  return {
    currentFilePath: currentFile?.path ?? null,
    items,
    snapshot: fuzzysortSnapshot(items, { keys: ['path', 'name'] }),
  }
}

function getIndex(app: App): SearchIndex {
  ensureVaultListeners(app)
  const currentFilePath = app.workspace.getActiveFile()?.path ?? null
  if (searchIndex && searchIndex.currentFilePath === currentFilePath) {
    return searchIndex
  }
  searchIndex = buildIndex(app)
  return searchIndex
}

function scoreFnWithBoost({
  searchItem,
  pathScore,
  nameScore,
}: {
  searchItem: SearchItem
  pathScore: number
  nameScore: number
}): number {
  const score = Math.max(pathScore, nameScore)

  let boost = 1

  // Exact/near-exact name match always takes priority over proximity/recent
  if (nameScore >= 0.9) {
    boost = Math.max(boost, 2)
  }

  switch (searchItem.type) {
    case 'file': {
      const { distance, daysSinceLastModified } = searchItem

      // Boost for recently modified files
      if (daysSinceLastModified <= 10) {
        const recentBoost = 1 + 2 / (daysSinceLastModified + 2)
        boost = Math.max(boost, recentBoost)
      }

      // Boost for nearby files
      if (distance !== null && distance >= 0 && distance < 3) {
        const nearbyBoost = 1 + 0.5 / Math.max(distance + 1, 1)
        boost = Math.max(boost, nearbyBoost)
      }

      break
    }
    case 'folder': {
      const { distance } = searchItem

      // Boost for nearby folders
      if (distance !== null && distance >= 0 && distance < 3) {
        const nearbyBoost = 1 + 0.5 / Math.max(distance + 1, 1)
        boost = Math.max(boost, nearbyBoost)
      }

      break
    }
  }

  // Normalize the boost
  return boost * score
}

function getEmptyQueryResult(
  searchItems: SearchItem[],
  limit: number,
): SearchableMentionable[] {
  // Sort files based on a custom scoring function
  const sortedFiles = searchItems.sort((a, b) => {
    const scoreA = scoreFnWithBoost({
      searchItem: a,
      pathScore: 0.5, // Use 0.5 as a base score
      nameScore: 0.5,
    })
    const scoreB = scoreFnWithBoost({
      searchItem: b,
      pathScore: 0.5, // Use 0.5 as a base score
      nameScore: 0.5,
    })
    return scoreB - scoreA // Sort in descending order
  })

  // Return only the top 'limit' files
  return sortedFiles
    .slice(0, limit)
    .map((item) => searchItemToMentionable(item))
}

export function fuzzySearch(app: App, query: string): SearchableMentionable[] {
  const index = getIndex(app)

  if (!query) {
    // Copy first: the empty-query sort must not reorder the cached index.
    return getEmptyQueryResult([...index.items], EMPTY_QUERY_LIMIT)
  }

  const results = fuzzysortGo(query, index.snapshot, {
    threshold: 0.3,
    limit: EMPTY_QUERY_LIMIT,
    scoreFn: (result) =>
      scoreFnWithBoost({
        searchItem: result.obj,
        pathScore: result[0].score,
        nameScore: result[1].score,
      }),
  })

  return results.map((result) => searchItemToMentionable(result.obj))
}

function searchItemToMentionable(item: SearchItem): SearchableMentionable {
  switch (item.type) {
    case 'file':
      return {
        type: 'file',
        file: item.file,
        path: item.path,
      }
    case 'folder':
      return {
        type: 'folder',
        folder: item.folder,
        path: item.path,
      }
  }
}
