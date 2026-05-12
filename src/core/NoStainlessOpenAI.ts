import OpenAI from 'openai'

type BuildRequestOptions = Parameters<OpenAI['buildRequest']>[0]
type BuildRequestReturn = ReturnType<OpenAI['buildRequest']>

const stripMetadataHeaders = (headers: Headers | Record<string, string>) => {
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    const keysToDelete: string[] = []
    headers.forEach((_value, key) => {
      const lowerKey = key.toLowerCase()
      if (lowerKey.startsWith('x-stainless') || lowerKey === 'user-agent') {
        keysToDelete.push(key)
      }
    })
    keysToDelete.forEach((key) => {
      headers.delete(key)
    })
    return
  }

  const headerMap = headers as Record<string, string>
  Object.keys(headerMap).forEach((key) => {
    const lowerKey = key.toLowerCase()
    if (lowerKey.startsWith('x-stainless') || lowerKey === 'user-agent') {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete headerMap[key]
    }
  })
}

export class NoStainlessOpenAI extends OpenAI {
  override buildRequest(
    options: BuildRequestOptions,
    { retryCount = 0 }: { retryCount?: number } = {},
  ): BuildRequestReturn {
    return Promise.resolve(super.buildRequest(options, { retryCount })).then(
      (req) => {
        const headers = req.req.headers
        if (headers) {
          stripMetadataHeaders(headers)
        }
        return req
      },
    )
  }
}
