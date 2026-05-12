import fuzzysort from 'fuzzysort'
import { App, TFile, TFolder } from 'obsidian'

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
      pathScore: 0.5,
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
  const currentFile = app.workspace.getActiveFile()

  const allSupportedFiles = app.vault.getFiles().filter((file) => {
    const extension = file.extension
    return extension === 'md'
  })

  const allFilesWithMetadata: SearchItem[] = allSupportedFiles.map((file) => ({
    type: 'file',
    path: file.path,
    name: file.name,
    file,
    distance: currentFile
      ? currentFile === file
        ? null
        : calculateFileDistance(currentFile, file)
      : null,
    daysSinceLastModified:
      (Date.now() - file.stat.mtime) / (1000 * 60 * 60 * 24),
  }))

  const allFolders = app.vault.getAllFolders()
  const allFoldersWithMetadata: SearchItem[] = allFolders.map((folder) => ({
    type: 'folder',
    path: folder.path,
    name: folder.name,
    folder,
    distance: currentFile ? calculateFileDistance(currentFile, folder) : null,
  }))

  const searchItems: SearchItem[] = [
    ...allFilesWithMetadata,
    ...allFoldersWithMetadata,
  ]

  if (!query) {
    return getEmptyQueryResult(searchItems, 15)
  }

  const results = fuzzysort.go(query, searchItems, {
    keys: ['path', 'name'],
    threshold: 0.3,
    limit: 15,
    all: true,
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
      }
    case 'folder':
      return {
        type: 'folder',
        folder: item.folder,
      }
  }
}
