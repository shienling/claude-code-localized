import { describe, expect, it } from 'bun:test'
import {
  buildMiniMaxEnv,
  resolveMiniMaxConfig,
} from './minimax.js'
import { resolveModelProviderKind } from './protocols.js'

describe('minimax provider config', () => {
  it('builds canonical minimax env vars', () => {
    expect(
      buildMiniMaxEnv({
        apiKey: ' key ',
        baseURL: 'https://api.minimaxi.com/anthropic/',
        model: ' MiniMax-M2.7-highspeed ',
      }),
    ).toEqual({
      MINIMAX_API_KEY: 'key',
      MINIMAX_BASE_URL: 'https://api.minimaxi.com/anthropic',
      MINIMAX_MODEL: 'MiniMax-M2.7-highspeed',
      MODEL_PROVIDER_KIND: 'minimax',
      MODEL_PROTOCOL_FAMILY: 'anthropic-compatible',
    })
  })

  it('resolves explicit minimax configs without touching Claude config', () => {
    expect(
      resolveMiniMaxConfig({
        MODEL_PROVIDER_KIND: 'minimax',
        MINIMAX_API_KEY: 'minimax-key',
        MINIMAX_BASE_URL: 'https://api.minimaxi.com/anthropic/',
        MINIMAX_MODEL: 'MiniMax-M2.7-highspeed',
        ANTHROPIC_MODEL: 'claude-sonnet-4-6',
      }),
    ).toEqual({
      apiKey: 'minimax-key',
      baseURL: 'https://api.minimaxi.com/anthropic',
      model: 'MiniMax-M2.7-highspeed',
    })
  })

  it('does not treat Claude provider state as minimax even if old minimax env remains', () => {
    expect(
      resolveMiniMaxConfig({
        MODEL_PROVIDER_KIND: 'claude',
        MINIMAX_API_KEY: 'minimax-key',
        MINIMAX_BASE_URL: 'https://api.minimaxi.com/anthropic',
        MINIMAX_MODEL: 'MiniMax-M2.7-highspeed',
        ANTHROPIC_MODEL: 'claude-sonnet-4-6',
      }),
    ).toBeNull()
  })

  it('resolves legacy ANTHROPIC_MODEL-only minimax configs when provider kind is unset', () => {
    expect(
      resolveMiniMaxConfig({
        ANTHROPIC_MODEL: 'MiniMax-M2.7-highspeed',
        ANTHROPIC_AUTH_TOKEN: 'legacy-key',
        ANTHROPIC_BASE_URL: 'https://api.minimaxi.com/anthropic',
      }),
    ).toEqual({
      apiKey: 'legacy-key',
      baseURL: 'https://api.minimaxi.com/anthropic',
      model: 'MiniMax-M2.7-highspeed',
    })
  })

  it('defaults provider kind to Claude unless explicitly set', () => {
    expect(resolveModelProviderKind({})).toBe('claude')
    expect(
      resolveModelProviderKind({
        MINIMAX_API_KEY: 'minimax-key',
        MINIMAX_BASE_URL: 'https://api.minimaxi.com/anthropic',
        MINIMAX_MODEL: 'MiniMax-M2.7-highspeed',
      }),
    ).toBe('claude')
  })
})
