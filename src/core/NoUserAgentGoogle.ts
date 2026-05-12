import { GoogleGenAI, GoogleGenAIOptions } from '@google/genai'

/**
 * A GoogleGenAI wrapper that strips the User-Agent header from SDK requests.
 * This is useful for bypassing compatibility issues with certain proxy/relay APIs
 * that may reject or behave differently based on the SDK's User-Agent identifier.
 */
export class NoUserAgentGoogle extends GoogleGenAI {
  constructor(options: GoogleGenAIOptions) {
    super(options)

    // After initialization, strip User-Agent from the default headers.
    // The apiClient is `protected readonly` in GoogleGenAI, accessible from subclass.
    const httpOptions = this.apiClient.clientOptions.httpOptions
    if (httpOptions?.headers) {
      const filtered: Record<string, string> = {}
      for (const key of Object.keys(httpOptions.headers)) {
        if (key.toLowerCase() !== 'user-agent') {
          filtered[key] = httpOptions.headers[key]
        }
      }
      httpOptions.headers = filtered
    }
  }
}
