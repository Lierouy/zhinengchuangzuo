import { ResponseUsage } from '../../types/response'

/** Starting point of a usage counter, and the value of a missing `usage`. */
export const EMPTY_USAGE: ResponseUsage = {
  prompt_tokens: 0,
  completion_tokens: 0,
}

/**
 * Narrows a provider payload to the fields the plugin shows. Providers send
 * extra members (`total_tokens`, `prompt_tokens_details`, cache counters, ...);
 * dropping them here keeps the stored metadata identical for the streaming and
 * the non-streaming path.
 *
 * Pass `undefined` to get {@link EMPTY_USAGE} instead of `undefined`, so callers
 * never have to branch.
 */
export function toUsage(raw?: Partial<ResponseUsage> | null): ResponseUsage {
  return {
    prompt_tokens: raw?.prompt_tokens ?? 0,
    completion_tokens: raw?.completion_tokens ?? 0,
  }
}

/**
 * Folds one usage report into the running total. Streaming chunks carry the
 * counters at different times, and a chunk without `usage` must not reset what
 * an earlier one reported.
 */
export function mergeUsage(
  current: ResponseUsage,
  next?: Partial<ResponseUsage> | null,
): ResponseUsage {
  return {
    prompt_tokens: next?.prompt_tokens ?? current.prompt_tokens,
    completion_tokens: next?.completion_tokens ?? current.completion_tokens,
  }
}
