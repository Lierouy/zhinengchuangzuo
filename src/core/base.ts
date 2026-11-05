import { ChatModel } from '../types/chat-model.types'
import {
  LLMOptions,
  LLMRequestNonStreaming,
  LLMRequestStreaming,
} from '../types/request'
import {
  LLMResponseNonStreaming,
  LLMResponseStreaming,
} from '../types/response'

/**
 * What every provider must be able to do.
 *
 * This is a plain object type rather than an abstract class: the two
 * implementations share no code, so inheritance only added ceremony. Each
 * provider module exposes a `createXxxProvider(provider)` factory that returns
 * this shape.
 */
export type LLMProviderClient = {
  generateResponse(
    model: ChatModel,
    request: LLMRequestNonStreaming,
    options?: LLMOptions,
  ): Promise<LLMResponseNonStreaming>

  streamResponse(
    model: ChatModel,
    request: LLMRequestStreaming,
    options?: LLMOptions,
  ): Promise<AsyncIterable<LLMResponseStreaming>>
}
