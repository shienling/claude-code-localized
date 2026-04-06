import { describe, expect, it } from 'bun:test'
import {
  buildOpenAICompatibleEnv,
  buildOpenAICompatibleRequestURL,
  resolveOpenAICompatibleConfig,
} from './config.js'
import { resolveArkConfig } from '../ark.js'
import { resolveModelProtocolFamily } from '../protocols.js'

describe('openai-compatible config', () => {
  it('builds the chat completions endpoint from the base URL', () => {
    expect(
      buildOpenAICompatibleRequestURL('https://ark.cn-beijing.volces.com/api/v3/'),
    ).toBe('https://ark.cn-beijing.volces.com/api/v3/chat/completions')
  })

  it('resolves Ark config from dedicated env vars', () => {
    const config = resolveArkConfig({
      ARK_API_KEY: 'ark-key',
      ARK_BASE_URL: 'https://ark.cn-beijing.volces.com/api/v3/',
      ARK_MODEL: 'doubao-seed-2-0-code-preview-260215',
    })

    expect(config).toEqual({
      apiKey: 'ark-key',
      baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
      model: 'doubao-seed-2-0-code-preview-260215',
    })
  })

  it('falls back to generic openai-compatible env vars', () => {
    const config = resolveOpenAICompatibleConfig({
      OPENAI_API_KEY: 'openai-key',
      OPENAI_MODEL: 'gpt-4o',
      OPENAI_COMPATIBLE_BASE_URL: 'https://api.example.com/v1/',
    })

    expect(config).toEqual({
      apiKey: 'openai-key',
      baseURL: 'https://api.example.com/v1',
      model: 'gpt-4o',
    })
  })

  it('defaults to anthropic-compatible unless explicitly switched', () => {
    expect(resolveModelProtocolFamily({})).toBe('anthropic-compatible')
    expect(
      resolveModelProtocolFamily({
        MODEL_PROTOCOL_FAMILY: 'openai-compatible',
      }),
    ).toBe('openai-compatible')
  })

  it('builds provider env vars for manual configuration', () => {
    expect(
      buildOpenAICompatibleEnv({
        apiKey: ' key ',
        baseURL: 'https://api.example.com/v1/',
        model: ' gpt-4o ',
      }),
    ).toEqual({
      OPENAI_COMPATIBLE_API_KEY: 'key',
      OPENAI_COMPATIBLE_BASE_URL: 'https://api.example.com/v1',
      OPENAI_COMPATIBLE_MODEL: 'gpt-4o',
      MODEL_PROTOCOL_FAMILY: 'openai-compatible',
    })
  })
})
