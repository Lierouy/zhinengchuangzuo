const COMMON_HTML_TAGS = new Set([
  'html',
  'base',
  'head',
  'link',
  'meta',
  'style',
  'title',
  'body',
  'address',
  'article',
  'aside',
  'footer',
  'header',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hgroup',
  'main',
  'nav',
  'section',
  'search',
  'blockquote',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'hr',
  'li',
  'menu',
  'ol',
  'p',
  'pre',
  'ul',
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'br',
  'cite',
  'code',
  'data',
  'dfn',
  'em',
  'i',
  'kbd',
  'mark',
  'q',
  'rp',
  'rt',
  'ruby',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var',
  'wbr',
  'area',
  'audio',
  'img',
  'map',
  'track',
  'video',
  'embed',
  'fencedframe',
  'iframe',
  'object',
  'picture',
  'source',
  'svg',
  'math',
  'canvas',
  'noscript',
  'script',
  'del',
  'ins',
  'caption',
  'col',
  'colgroup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'button',
  'datalist',
  'fieldset',
  'form',
  'input',
  'label',
  'legend',
  'meter',
  'optgroup',
  'option',
  'output',
  'progress',
  'select',
  'textarea',
  'details',
  'dialog',
  'summary',
  'slot',
  'template',
  'selectedcontent',
])

/**
 * Extract non-standard XML tag content from model output and move it to reasoning.
 * Some models wrap thinking content in custom XML tags (e.g. <thinking>...</thinking>).
 * This function detects such tags, strips them from `content`, and appends their
 * inner text to `reasoning`.
 */
export function interceptTagContent(
  content: string,
  reasoning: string,
): { content: string; reasoning: string } {
  if (!content.trimStart().startsWith('<')) {
    return { content, reasoning }
  }

  const match = content.match(/^\s*<([a-zA-Z0-9_-]{1,15})>/)
  if (!match) {
    return { content, reasoning }
  }

  const tagName = match[1].toLowerCase()
  // Only intercept tags NOT in the common HTML whitelist
  if (COMMON_HTML_TAGS.has(tagName)) {
    return { content, reasoning }
  }

  const tagStartStr = match[0]
  const tagEndStr = `</${match[1]}>`

  const startIndex = content.indexOf(tagStartStr)
  if (startIndex === -1) {
    return { content, reasoning }
  }

  const endIndex = content.indexOf(tagEndStr)
  let extractedThought: string
  let newContent: string

  if (endIndex !== -1) {
    // Tag is fully closed
    extractedThought = content.substring(
      startIndex + tagStartStr.length,
      endIndex,
    )
    newContent =
      content.substring(0, startIndex) +
      content.substring(endIndex + tagEndStr.length)
  } else {
    // Tag is still open (streaming)
    extractedThought = content.substring(startIndex + tagStartStr.length)
    newContent = content.substring(0, startIndex)
  }

  const newReasoning = (
    (reasoning ? reasoning + '\n' : '') + extractedThought
  ).trim()
  return { content: newContent, reasoning: newReasoning }
}
