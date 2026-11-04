import Anthropic from '@anthropic-ai/sdk'

import { stripStainlessHeaders } from './headers'

type BuildRequestOptions = Parameters<Anthropic['buildRequest']>[0]
type BuildRequestReturn = ReturnType<Anthropic['buildRequest']>

export class NoStainlessAnthropic extends Anthropic {
  override buildRequest(
    options: BuildRequestOptions,
    { retryCount = 0 }: { retryCount?: number } = {},
  ): BuildRequestReturn {
    return Promise.resolve(super.buildRequest(options, { retryCount })).then(
      (req) => {
        const headers = req.req.headers as Headers | Record<string, string>
        if (headers) {
          stripStainlessHeaders(headers)
        }
        return req
      },
    )
  }
}
