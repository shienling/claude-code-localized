export type MiniMaxProviderConfig = {
  apiKey: string
  baseURL: string
  model: string
}

export type MiniMaxProviderEnv = {
  MINIMAX_API_KEY: string
  MINIMAX_BASE_URL: string
  MINIMAX_MODEL: string
  MODEL_PROVIDER_KIND: 'minimax'
  MODEL_PROTOCOL_FAMILY: 'anthropic-compatible'
}

export type MiniMaxEnv = NodeJS.ProcessEnv

function normalizeBaseURL(baseURL: string): string {
  return baseURL.replace(/\/+$/, '')
}

function isMiniMaxModel(model: string | undefined): boolean {
  return typeof model === 'string' && model.trim().toLowerCase().startsWith('minimax-')
}

export function resolveMiniMaxConfig(
  env: MiniMaxEnv = process.env,
): MiniMaxProviderConfig | null {
  const explicitKind = env.MODEL_PROVIDER_KIND?.trim().toLowerCase()
  if (explicitKind === 'claude' || explicitKind === 'openai-compatible') {
    return null
  }

  const legacyMiniMax = explicitKind === undefined && isMiniMaxModel(env.ANTHROPIC_MODEL)
  const isActiveMiniMax =
    explicitKind === 'minimax' ||
    !!env.MINIMAX_MODEL?.trim() ||
    legacyMiniMax

  const apiKey =
    env.MINIMAX_API_KEY?.trim() ||
    (isActiveMiniMax ? env.ANTHROPIC_AUTH_TOKEN?.trim() : '')
  const model =
    env.MINIMAX_MODEL?.trim() ||
    (legacyMiniMax ? env.ANTHROPIC_MODEL?.trim() : '')
  const baseURL =
    env.MINIMAX_BASE_URL?.trim() ||
    (legacyMiniMax ? env.ANTHROPIC_BASE_URL?.trim() : '') ||
    'https://api.minimaxi.com/anthropic'

  if (!apiKey || !model) {
    return null
  }

  return {
    apiKey,
    baseURL: normalizeBaseURL(baseURL),
    model,
  }
}

export function buildMiniMaxEnv(
  config: MiniMaxProviderConfig,
): MiniMaxProviderEnv {
  return {
    MINIMAX_API_KEY: config.apiKey.trim(),
    MINIMAX_BASE_URL: normalizeBaseURL(config.baseURL.trim()),
    MINIMAX_MODEL: config.model.trim(),
    MODEL_PROVIDER_KIND: 'minimax',
    MODEL_PROTOCOL_FAMILY: 'anthropic-compatible',
  }
}
