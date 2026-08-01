export type ModelSettings = {
  temperature?: number
  topP?: number
  contextCount?: number
  maxTokens?: number
  streamOutput?: boolean
  customParameters?: string[]
}

const trunc2 = (v: number) => Math.trunc(v * 100) / 100

export function sanitizeModelSettings(
  s: ModelSettings,
): Required<Pick<ModelSettings, 'customParameters'>> & ModelSettings {
  const out: ModelSettings = { ...s }

  if (typeof s.temperature === 'number' && !isNaN(s.temperature)) {
    let t = trunc2(s.temperature)
    if (t < 0) t = 0
    if (t > 2) t = 2
    out.temperature = t
  } else {
    delete out.temperature
  }

  if (typeof s.topP === 'number' && !isNaN(s.topP)) {
    let p = trunc2(s.topP)
    if (p < 0) p = 0
    if (p > 1) p = 1
    out.topP = p
  } else {
    delete out.topP
  }

  if (typeof s.contextCount === 'number' && !isNaN(s.contextCount)) {
    let c = Math.trunc(s.contextCount)
    if (c < 1) c = 1
    out.contextCount = c
  } else {
    delete out.contextCount
  }

  if (typeof s.maxTokens === 'number' && !isNaN(s.maxTokens)) {
    let m = Math.trunc(s.maxTokens)
    if (m < 1) m = 1
    out.maxTokens = m
  } else {
    delete out.maxTokens
  }

  if (Array.isArray(s.customParameters)) {
    out.customParameters = s.customParameters
      .map((p) => (p ?? '').trim())
      .filter((p) => p.length > 0)
  } else {
    out.customParameters = []
  }

  return out as Required<Pick<ModelSettings, 'customParameters'>> &
    ModelSettings
}

export function parseCustomParameters(
  customParameters: string[],
  target: Record<string, unknown>,
): void {
  for (const raw of customParameters) {
    const text = (raw ?? '').trim()
    if (!text) continue
    try {
      let obj: Record<string, unknown> | null = null
      if (text.startsWith('{')) {
        const parsed = JSON.parse(text)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          obj = parsed as Record<string, unknown>
        }
      } else {
        try {
          const parsed = JSON.parse(`{${text}}`)
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            obj = parsed as Record<string, unknown>
          }
        } catch (_) {
          /* ignore parse errors */
        }
      }
      if (obj) {
        for (const [k, v] of Object.entries(obj)) {
          target[k] = v
        }
      } else {
        console.warn('Failed to parse custom parameter, skipping:', text)
      }
    } catch (err) {
      console.warn('Invalid custom parameter input', text, err)
    }
  }
}

export function buildModelRequest(
  model: { id: string },
  settings: ModelSettings,
  messages: unknown[],
): {
  baseRequest: Record<string, unknown>
  settings: ReturnType<typeof sanitizeModelSettings>
} {
  const s = sanitizeModelSettings(settings)

  const baseRequest: Record<string, unknown> = {
    stream: s.streamOutput ?? true,
    model: model.id,
    messages,
  }

  if (typeof s.temperature === 'number') {
    baseRequest.temperature = s.temperature
  }
  if (typeof s.topP === 'number') {
    baseRequest.top_p = s.topP
  }
  if (typeof s.maxTokens === 'number') {
    baseRequest.max_tokens = s.maxTokens
  }

  if (s.customParameters) {
    parseCustomParameters(s.customParameters, baseRequest)
  }

  return { baseRequest, settings: s }
}
