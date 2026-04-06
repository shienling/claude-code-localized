export type ModelProtocolFamily = 'anthropic-compatible' | 'openai-compatible'

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
