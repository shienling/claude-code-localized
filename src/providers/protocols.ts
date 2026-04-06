export type ModelProtocolFamily = 'anthropic-compatible' | 'openai-compatible'
export type ModelProviderKind = 'claude' | 'minimax' | 'openai-compatible'

export type AuthStyle = 'oauth' | 'api-key' | 'bearer'

export type ProviderProtocol = {
  family: ModelProtocolFamily
  name: string
  requestPath: string
  authStyle: AuthStyle
}

export function resolveModelProtocolFamily(
  env: NodeJS.ProcessEnv = process.env,
): ModelProtocolFamily {
  return env.MODEL_PROTOCOL_FAMILY === 'openai-compatible'
    ? 'openai-compatible'
    : 'anthropic-compatible'
}

export function resolveModelProviderKind(
  env: NodeJS.ProcessEnv = process.env,
): ModelProviderKind {
  const explicit = env.MODEL_PROVIDER_KIND?.trim().toLowerCase()
  if (
    explicit === 'claude' ||
    explicit === 'minimax' ||
    explicit === 'openai-compatible'
  ) {
    return explicit
  }

  return 'claude'
}

export const ANTHROPIC_COMPATIBLE_PROTOCOL: ProviderProtocol = {
  family: 'anthropic-compatible',
  name: 'Anthropic Messages API',
  requestPath: '/v1/messages',
  authStyle: 'api-key',
}

export const OPENAI_COMPATIBLE_PROTOCOL: ProviderProtocol = {
  family: 'openai-compatible',
  name: 'OpenAI Chat Completions',
  requestPath: '/chat/completions',
  authStyle: 'bearer',
}
