/**
 * Removes SDK fingerprint headers (`x-stainless-*` and `user-agent`) so that
 * providers/proxies that reject them keep working.
 *
 * Header names are case-insensitive, so every comparison is lower-cased.
 */
export function stripStainlessHeaders(
  headers: Headers | Record<string, string>,
): void {
  const shouldStrip = (key: string) => {
    const lowerKey = key.toLowerCase()
    return lowerKey.startsWith('x-stainless') || lowerKey === 'user-agent'
  }

  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    const keysToDelete: string[] = []
    headers.forEach((_value, key) => {
      if (shouldStrip(key)) keysToDelete.push(key)
    })
    keysToDelete.forEach((key) => headers.delete(key))
    return
  }

  const headerMap = headers as Record<string, string>
  Object.keys(headerMap).forEach((key) => {
    if (shouldStrip(key)) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete headerMap[key]
    }
  })
}
