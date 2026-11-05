export type LLMErrorCode =
  'api-key-not-set' | 'api-key-invalid' | 'base-url-not-set' | 'model-not-found'

/**
 * Every provider/model failure carries a machine-readable `code`, so callers
 * branch on data instead of on a growing family of otherwise identical
 * subclasses.
 */
export class LLMException extends Error {
  constructor(
    public readonly code: LLMErrorCode,
    message: string,
    public readonly rawError?: Error,
  ) {
    super(message)
    this.name = 'LLMException'
  }
}

/** Codes the user can fix in the settings tab. */
const SETTINGS_ERROR_CODES: ReadonlySet<LLMErrorCode> = new Set([
  'api-key-not-set',
  'api-key-invalid',
  'base-url-not-set',
])

export function isLLMError(
  error: unknown,
  code: LLMErrorCode,
): error is LLMException {
  return error instanceof LLMException && error.code === code
}

/** True when the failure is something the user can repair in the settings. */
export function isSettingsError(error: unknown): error is LLMException {
  return error instanceof LLMException && SETTINGS_ERROR_CODES.has(error.code)
}
