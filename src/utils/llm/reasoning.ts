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

const MAX_TAG_NAME_LENGTH = 15
const TAG_NAME_CHAR = /[a-zA-Z0-9_-]/

type PrefixDecision =
  | { kind: 'pending' }
  | { kind: 'plain' }
  | { kind: 'tag'; name: string; headerLength: number }

/**
 * Decides what the leading whitespace + `<name>` header of the response is.
 * `pending` means more characters are needed before the header can be judged
 * (the header may be split across stream chunks).
 */
function classifyPrefix(buffer: string): PrefixDecision {
  const start = buffer.search(/\S/)
  if (start === -1) return { kind: 'pending' }
  if (buffer[start] !== '<') return { kind: 'plain' }

  for (let i = start + 1; i < buffer.length; i++) {
    const char = buffer[i]
    if (char === '>') {
      const name = buffer.slice(start + 1, i)
      if (name.length === 0 || name.length > MAX_TAG_NAME_LENGTH) {
        return { kind: 'plain' }
      }
      return { kind: 'tag', name, headerLength: i + 1 }
    }
    if (!TAG_NAME_CHAR.test(char)) return { kind: 'plain' }
    if (i - start - 1 > MAX_TAG_NAME_LENGTH) return { kind: 'plain' }
  }
  return { kind: 'pending' }
}

/**
 * Splits `buffer` into the part that is safe to consume and a trailing slice
 * that may be the beginning of `closingTag` continued in the next chunk.
 */
function splitPartialClosingTag(
  buffer: string,
  closingTag: string,
): [complete: string, tail: string] {
  const maxKeep = Math.min(closingTag.length - 1, buffer.length)
  for (let keep = maxKeep; keep > 0; keep--) {
    const tail = buffer.slice(buffer.length - keep)
    if (closingTag.startsWith(tail)) {
      return [buffer.slice(0, buffer.length - keep), tail]
    }
  }
  return [buffer, '']
}

export type TagInterceptState = {
  /**
   * Feeds one stream delta and returns the full visible content / reasoning.
   * Each chunk costs O(delta) instead of rescanning the whole response.
   */
  push: (
    contentDelta: string,
    reasoningDelta?: string,
  ) => {
    content: string
    reasoning: string
  }
  /**
   * Releases the small tail held back to detect a closing tag split across
   * chunks. Call once when the stream ends.
   */
  flush: () => { content: string; reasoning: string }
}

/**
 * Streaming counterpart of {@link interceptTagContent}. The tag header is
 * classified once; afterwards only the newly arrived delta is scanned.
 */
export function createTagInterceptor(): TagInterceptState {
  let state: 'checking' | 'plain' | 'inside' | 'closed' = 'checking'
  let pending = ''
  let closingTag = ''
  let tail = ''
  let content = ''
  let thought = ''
  let modelReasoning = ''

  const consumeInside = (chunk: string) => {
    if (!chunk) return
    const buffer = tail + chunk
    const closeIndex = buffer.indexOf(closingTag)
    if (closeIndex !== -1) {
      thought += buffer.slice(0, closeIndex)
      content += buffer.slice(closeIndex + closingTag.length)
      tail = ''
      state = 'closed'
      return
    }
    const [complete, rest] = splitPartialClosingTag(buffer, closingTag)
    thought += complete
    tail = rest
  }

  const snapshot = () => ({
    content: state === 'checking' ? pending : content,
    reasoning: thought
      ? (modelReasoning ? `${modelReasoning}\n${thought}` : thought).trim()
      : modelReasoning,
  })

  return {
    push(contentDelta, reasoningDelta = '') {
      modelReasoning += reasoningDelta

      if (state === 'closed' || state === 'plain') {
        content += contentDelta
        return snapshot()
      }

      if (state === 'inside') {
        consumeInside(contentDelta)
        return snapshot()
      }

      pending += contentDelta
      const decision = classifyPrefix(pending)
      if (decision.kind === 'pending') return snapshot()

      if (
        decision.kind === 'plain' ||
        COMMON_HTML_TAGS.has(decision.name.toLowerCase())
      ) {
        content = pending
        pending = ''
        state = 'plain'
        return snapshot()
      }

      const rest = pending.slice(decision.headerLength)
      pending = ''
      closingTag = `</${decision.name}>`
      thought = ''
      tail = ''
      state = 'inside'
      consumeInside(rest)
      return snapshot()
    },

    flush() {
      if (state === 'inside' && tail) {
        thought += tail
        tail = ''
      }
      return snapshot()
    },
  }
}
