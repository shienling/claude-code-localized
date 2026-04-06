export type OpenAICompatibleProviderConfig = {
  apiKey: string
  baseURL: string
  model: string
}

export type OpenAICompatibleProviderEnv = {
  OPENAI_COMPATIBLE_API_KEY: string
  OPENAI_COMPATIBLE_BASE_URL: string
  OPENAI_COMPATIBLE_MODEL: string
  MODEL_PROVIDER_KIND: 'openai-compatible'
  MODEL_PROTOCOL_FAMILY: 'openai-compatible'
}

export type OpenAICompatibleEnv = NodeJS.ProcessEnv

function normalizeBaseURL(baseURL: string): string {
  return baseURL.replace(/\/+$/, '')
}

export function resolveOpenAICompatibleConfig(
  env: OpenAICompatibleEnv = process.env,
): OpenAICompatibleProviderConfig | null {
  // OPENAI_COMPATIBLE_* is the canonical storage for all openai-compatible
  // providers. ARK_* stays as a legacy fallback so older configs keep working.
  const apiKey =
    env.OPENAI_COMPATIBLE_API_KEY?.trim() ||
    env.ARK_API_KEY?.trim() ||
    env.OPENAI_API_KEY?.trim()
  const model =
    env.OPENAI_COMPATIBLE_MODEL?.trim() ||
    env.ARK_MODEL?.trim() ||
    env.OPENAI_MODEL?.trim()
  const baseURL =
    env.OPENAI_COMPATIBLE_BASE_URL?.trim() ||
    env.ARK_BASE_URL?.trim()

  if (!apiKey || !model || !baseURL) {
    return null
  }

  return {
    apiKey,
    baseURL: normalizeBaseURL(baseURL),
    model,
  }
}

export function buildOpenAICompatibleRequestURL(baseURL: string): string {
  const normalizedBaseURL = baseURL.replace(/\/+$/, '')
  // If the caller already supplied the final endpoint, keep it as-is.
  if (/\/(chat\/completions|responses)$/.test(normalizedBaseURL)) {
    return normalizedBaseURL
  }
  // If not, add the standard /chat/completions path
  return `${normalizedBaseURL}/chat/completions`
}

export function buildOpenAICompatibleEnv(
  config: OpenAICompatibleProviderConfig,
): OpenAICompatibleProviderEnv {
  return {
    OPENAI_COMPATIBLE_API_KEY: config.apiKey.trim(),
    OPENAI_COMPATIBLE_BASE_URL: normalizeBaseURL(config.baseURL.trim()),
    OPENAI_COMPATIBLE_MODEL: config.model.trim(),
    MODEL_PROVIDER_KIND: 'openai-compatible',
    MODEL_PROTOCOL_FAMILY: 'openai-compatible',
  }
}

export function stripLegacyArkEnv(
  env: Record<string, string> | undefined,
): Record<string, string> {
  // Keep the persisted env canonical by removing the legacy Ark-only keys.
  const {
    ARK_API_KEY: _legacyArkApiKey,
    ARK_BASE_URL: _legacyArkBaseURL,
    ARK_MODEL: _legacyArkModel,
    ...restEnv
  } = env ?? {}
  return restEnv
}
