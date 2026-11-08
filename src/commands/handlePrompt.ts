export function buildBrowsingFileBlock(path: string, content: string): string {
  return `<file type="用户正在浏览">\n<path>${path}</path>\n<body>\n${content}\n</body>\n</file>\n`
}

export function buildFileBlock(link: string, body: string): string {
  return `<file>\n<link>${link}</link>\n<body>\n${body}\n</body>\n</file>\n`
}

export function buildExcerptBlock(link: string, text: string): string {
  return `<excerpt>\n<link>${link}</link>\n<text>\n${text}\n</text>\n</excerpt>\n`
}

export function buildMissingFileBlock(link: string): string {
  return `<file>\n<link>${link}</link>\n<note>(文件缺失)</note>\n</file>\n`
}

export function buildMissingExcerptBlock(link: string): string {
  return `<excerpt>\n<link>${link}</link>\n<note>(文本缺失)</note>\n</excerpt>\n`
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
