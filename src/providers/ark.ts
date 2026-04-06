import { buildOpenAICompatibleRequestURL } from './openai-compatible/config.js'
import { OpenAICompatibleClient } from './openai-compatible/client.js'

export const ARK_DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'

export function resolveArkConfig(env: NodeJS.ProcessEnv = process.env) {
  const apiKey =
    env.ARK_API_KEY?.trim() ||
    env.OPENAI_COMPATIBLE_API_KEY?.trim() ||
    env.OPENAI_API_KEY?.trim()
  const model =
    env.ARK_MODEL?.trim() ||
    env.OPENAI_COMPATIBLE_MODEL?.trim() ||
    env.OPENAI_MODEL?.trim()
  if (!apiKey || !model) {
    return null
  }

  return {
    apiKey,
    model,
    baseURL:
      (env.ARK_BASE_URL?.trim() || env.OPENAI_COMPATIBLE_BASE_URL?.trim() || ARK_DEFAULT_BASE_URL).replace(
        /\/+$/,
        '',
      ),
  }
}

export function createArkClient(env: NodeJS.ProcessEnv = process.env) {
  const config = resolveArkConfig(env)
  if (!config) {
    return null
  }
  return new OpenAICompatibleClient(config)
}

export { buildOpenAICompatibleRequestURL }
