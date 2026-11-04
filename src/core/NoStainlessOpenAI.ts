import OpenAI from 'openai'

import { stripStainlessHeaders } from './headers'

type BuildRequestOptions = Parameters<OpenAI['buildRequest']>[0]
type BuildRequestReturn = ReturnType<OpenAI['buildRequest']>

export class NoStainlessOpenAI extends OpenAI {
  override buildRequest(
    options: BuildRequestOptions,
    { retryCount = 0 }: { retryCount?: number } = {},
  ): BuildRequestReturn {
    return Promise.resolve(super.buildRequest(options, { retryCount })).then(
      (req) => {
        const headers = req.req.headers
        if (headers) {
          stripStainlessHeaders(headers)
        }
        return req
      },
    )
  }
}
