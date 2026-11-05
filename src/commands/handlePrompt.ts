import type { App, TFile } from 'obsidian'

export type WikiLink = { raw: string; index: number }

/**
 * Collects `[[wiki links]]` in appearance order. Duplicates (ignoring a
 * leading `./`) are dropped so the same target is never resolved twice.
 */
export function extractWikiLinks(content: string): WikiLink[] {
  const linkPattern = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g
  const seen = new Set<string>()
  const links: WikiLink[] = []

  let match: RegExpExecArray | null
  while ((match = linkPattern.exec(content))) {
    const raw = match[1].trim()
    const key = raw.replace(/^\.\//, '')
    if (seen.has(key)) continue
    seen.add(key)
    links.push({ raw, index: match.index })
  }

  return links.sort((a, b) => a.index - b.index)
}

export function buildFileBlock(path: string, content: string): string {
  return `<file>\n<path>${path}</path>\n<body>\n${content}\n</body>\n</file>\n`
}

export function buildBrowsingFileBlock(path: string, content: string): string {
  return `<file type="用户正在浏览">\n<path>${path}</path>\n<body>\n${content}\n</body>\n</file>\n`
}

/**
 * Assembles the prompt sent to the model: the browsing file first, then one
 * block per linked file, separated by a blank line.
 */
export function buildHandlePrompt(
  filePath: string,
  fileContent: string,
  linkedBlocks: string[],
): string {
  return [buildBrowsingFileBlock(filePath, fileContent), ...linkedBlocks].join(
    '\n',
  )
}

/** Reads linked files in order, stopping before the character budget is exceeded. */
export async function collectLinkedContent(
  app: App,
  files: TFile[],
  initialLength: number,
  maxChars: number,
): Promise<{ blocks: string[]; dropped: TFile[] }> {
  const blocks: string[] = []
  const dropped: TFile[] = []
  let runningTotal = initialLength

  for (const file of files) {
    const content = await app.vault.cachedRead(file)
    if (runningTotal + content.length > maxChars) {
      dropped.push(file)
      continue
    }
    blocks.push(buildFileBlock(file.path, content))
    runningTotal += content.length
  }

  return { blocks, dropped }
}
