export type OpenAICompatibleProviderConfig = {
  apiKey: string
  baseURL: string
  model: string
}

export type OpenAICompatibleProviderEnv = {
  OPENAI_COMPATIBLE_API_KEY: string
  OPENAI_COMPATIBLE_BASE_URL: string
  OPENAI_COMPATIBLE_MODEL: string
  MODEL_PROTOCOL_FAMILY: 'openai-compatible'
}

export type OpenAICompatibleEnv = NodeJS.ProcessEnv

function normalizeBaseURL(baseURL: string): string {
  return baseURL.replace(/\/+$/, '')
}

export function resolveOpenAICompatibleConfig(
  env: OpenAICompatibleEnv = process.env,
): OpenAICompatibleProviderConfig | null {
  const apiKey =
    env.ARK_API_KEY?.trim() ||
    env.OPENAI_COMPATIBLE_API_KEY?.trim() ||
    env.OPENAI_API_KEY?.trim()
  const model =
    env.ARK_MODEL?.trim() ||
    env.OPENAI_COMPATIBLE_MODEL?.trim() ||
    env.OPENAI_MODEL?.trim()
  const baseURL =
    env.ARK_BASE_URL?.trim() ||
    env.OPENAI_COMPATIBLE_BASE_URL?.trim()

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
  return `${baseURL.replace(/\/+$/, '')}/chat/completions`
}

export function buildOpenAICompatibleEnv(
  config: OpenAICompatibleProviderConfig,
): OpenAICompatibleProviderEnv {
  return {
    OPENAI_COMPATIBLE_API_KEY: config.apiKey.trim(),
    OPENAI_COMPATIBLE_BASE_URL: normalizeBaseURL(config.baseURL.trim()),
    OPENAI_COMPATIBLE_MODEL: config.model.trim(),
    MODEL_PROTOCOL_FAMILY: 'openai-compatible',
  }
}
