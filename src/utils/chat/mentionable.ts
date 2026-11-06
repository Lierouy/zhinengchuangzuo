import { App } from 'obsidian'

import { Mentionable, SerializedMentionable } from '../../types/mentionable'

export const serializeMentionable = (
  mentionable: Mentionable,
): SerializedMentionable => {
  switch (mentionable.type) {
    case 'file':
      return {
        type: 'file',
        file: mentionable.path,
      }
    case 'folder':
      return {
        type: 'folder',
        folder: mentionable.path,
      }
    case 'current-file':
      return {
        type: 'current-file',
        file: mentionable.file?.path ?? null,
      }
    case 'block':
      return {
        type: 'block',
        content: mentionable.content,
        file: mentionable.path,
        startLine: mentionable.startLine,
        endLine: mentionable.endLine,
      }
    case 'image':
      return {
        type: 'image',
        name: mentionable.name,
        mimeType: mentionable.mimeType,
        data: mentionable.data,
      }
  }
}

export const deserializeMentionable = (
  mentionable: SerializedMentionable,
  app: App,
): Mentionable | null => {
  try {
    switch (mentionable.type) {
      case 'file': {
        // A missing file keeps its record: dropping it here would also erase it
        // from the saved conversation on the next write.
        return {
          type: 'file',
          file: app.vault.getFileByPath(mentionable.file),
          path: mentionable.file,
        }
      }
      case 'folder': {
        return {
          type: 'folder',
          folder: app.vault.getFolderByPath(mentionable.folder),
          path: mentionable.folder,
        }
      }
      case 'current-file': {
        if (!mentionable.file) {
          return {
            type: 'current-file',
            file: null,
          }
        }
        const file = app.vault.getFileByPath(mentionable.file)
        return {
          type: 'current-file',
          file: file,
        }
      }
      case 'block': {
        return {
          type: 'block',
          content: mentionable.content,
          file: app.vault.getFileByPath(mentionable.file),
          path: mentionable.file,
          startLine: mentionable.startLine,
          endLine: mentionable.endLine,
        }
      }
      case 'image': {
        return {
          type: 'image',
          name: mentionable.name,
          mimeType: mentionable.mimeType,
          data: mentionable.data,
        }
      }
    }
  } catch (e) {
    console.error('Error deserializing mentionable', e)
    return null
  }
}

export function getMentionableKey(mentionable: SerializedMentionable): string {
  switch (mentionable.type) {
    case 'file':
      return `file:${mentionable.file}`
    case 'folder':
      return `folder:${mentionable.folder}`
    case 'current-file':
      return `current-file:${mentionable.file ?? 'current'}`
    case 'block':
      return `block:${mentionable.file}:${mentionable.startLine}:${mentionable.endLine}:${mentionable.content}`
    case 'image':
      return `image:${mentionable.name}:${hashString(mentionable.data)}`
  }
}
/**
 * Small non-cryptographic hash (FNV-1a) used to build stable identity keys.
 * Avoids slicing hundreds of KB of base64 and has far fewer collisions than
 * length + tail comparison.
 */
function hashString(value: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

/** Display name for a path whose entity no longer exists. */
export function getPathBasename(path: string): string {
  const segments = path.split('/')
  return segments[segments.length - 1] || path
}

/**
 * Counts file/folder mentions whose target no longer exists on disk.
 * Mentions hold the `TFile`/`TFolder` captured when they were picked, so a file
 * deleted afterwards would otherwise be read from a stale reference and fail
 * the whole request. Does not include excerpts: their text is a snapshot.
 */
export function countMissingMentionables(
  mentionables: Mentionable[],
  app: App,
): number {
  let missing = 0
  for (const mentionable of mentionables) {
    if (mentionable.type === 'file') {
      if (!app.vault.getFileByPath(mentionable.path)) missing++
    } else if (mentionable.type === 'folder') {
      if (!app.vault.getFolderByPath(mentionable.path)) missing++
    }
  }
  return missing
}

export function getMentionableName(mentionable: Mentionable): string {
  switch (mentionable.type) {
    case 'file':
      return mentionable.file?.name ?? getPathBasename(mentionable.path)
    case 'folder':
      return mentionable.folder?.name ?? getPathBasename(mentionable.path)
    case 'current-file':
      return mentionable.file?.name ?? 'Current File'
    case 'block':
      return `${mentionable.file?.name ?? getPathBasename(mentionable.path)} (${mentionable.startLine}-${mentionable.endLine})`
    case 'image':
      return mentionable.name
  }
}
