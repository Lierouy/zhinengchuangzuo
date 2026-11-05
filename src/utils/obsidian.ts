import { App, Editor, MarkdownView, TFile, TFolder, Vault } from 'obsidian'

import { MentionableBlockData } from '../types/mentionable'

/**
 * Recursively creates the given folder path segments (relative to the vault root).
 */
export async function ensureFolderExists(
  app: App,
  segments: string[],
): Promise<void> {
  let currentPath = ''
  for (const segment of segments.filter(Boolean)) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment
    if (!(await app.vault.adapter.exists(currentPath))) {
      await app.vault.adapter.mkdir(currentPath)
    }
  }
}

export async function readMultipleTFiles(
  files: TFile[],
  vault: Vault,
): Promise<string[]> {
  // Read files in parallel
  return await Promise.all(files.map((file) => vault.cachedRead(file)))
}

export function getNestedFiles(folder: TFolder): TFile[] {
  const files: TFile[] = []
  for (const child of folder.children) {
    if (child instanceof TFile) {
      files.push(child)
    } else if (child instanceof TFolder) {
      files.push(...getNestedFiles(child))
    }
  }
  return files
}

export async function getMentionableBlockData(
  editor: Editor,
  view: MarkdownView,
): Promise<MentionableBlockData | null> {
  const file = view.file
  if (!file) return null

  const selection = editor.getSelection()
  if (!selection) return null

  const startLine = editor.getCursor('from').line
  const endLine = editor.getCursor('to').line
  const selectionContent = editor
    .getValue()
    .split('\n')
    .slice(startLine, endLine + 1)
    .join('\n')

  return {
    content: selectionContent,
    file,
    startLine: startLine + 1, // +1 because startLine is 0-indexed
    endLine: endLine + 1, // +1 because startLine is 0-indexed
  }
}

export function getOpenFiles(app: App): TFile[] {
  try {
    const leaves = app.workspace.getLeavesOfType('markdown')

    return leaves.map((v) => (v.view as MarkdownView).file).filter((v) => !!v)
  } catch {
    return []
  }
}

export function calculateFileDistance(
  file1: TFile | TFolder,
  file2: TFile | TFolder,
): number | null {
  // Compare directory segments only: the last segment is the file/folder name
  // itself, and for root-level items it is not a folder at all.
  const dir1 = file1.path.split('/').slice(0, -1)
  const dir2 = file2.path.split('/').slice(0, -1)

  // Root-level items have no directory; treat them as distance 0 from each other.
  if (dir1.length === 0 || dir2.length === 0) {
    return dir1.length === dir2.length ? 0 : null
  }

  // Check if files are in different top-level folders
  if (dir1[0] !== dir2[0]) {
    return null
  }

  let i = 0
  // Find the common ancestor
  while (i < dir1.length && i < dir2.length && dir1[i] === dir2[i]) {
    i++
  }

  // Calculate distance from common ancestor to each file
  return dir1.length - i + (dir2.length - i)
}

export function openMarkdownFile(
  app: App,
  filePath: string,
  startLine?: number,
) {
  const file = app.vault.getFileByPath(filePath)
  if (!file) return

  const existingLeaf = app.workspace
    .getLeavesOfType('markdown')
    .find(
      (leaf) =>
        leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path,
    )

  if (existingLeaf) {
    app.workspace.setActiveLeaf(existingLeaf, { focus: true })

    if (startLine) {
      const view = existingLeaf.view as MarkdownView
      view.setEphemeralState({ line: startLine - 1 }) // -1 because line is 0-indexed
    }
  } else {
    const leaf = app.workspace.getLeaf('tab')
    void leaf.openFile(file, {
      eState: startLine ? { line: startLine - 1 } : undefined, // -1 because line is 0-indexed
    })
  }
}
