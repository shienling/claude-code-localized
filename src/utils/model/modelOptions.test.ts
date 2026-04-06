import { describe, expect, it } from 'bun:test'
import { CUSTOM_MODEL_OPTION, getModelOptions } from './modelOptions.js'

describe('model options', () => {
  it('includes an Others entry for custom models', () => {
    const previousApiKey = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? 'test-key'

    const options = getModelOptions()
    const lastOption = options[options.length - 1]

    expect(lastOption?.value).toBe(CUSTOM_MODEL_OPTION)
    expect(lastOption?.label).toBe('Others')

    if (previousApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY
    } else {
      process.env.ANTHROPIC_API_KEY = previousApiKey
    }
  })

  it('surfaces MiniMax when Claude is active but a saved MiniMax config exists', () => {
    const previousEnv = {
      MODEL_PROVIDER_KIND: process.env.MODEL_PROVIDER_KIND,
      MODEL_PROTOCOL_FAMILY: process.env.MODEL_PROTOCOL_FAMILY,
      ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
      MINIMAX_MODEL: process.env.MINIMAX_MODEL,
      OPENAI_COMPATIBLE_API_KEY: process.env.OPENAI_COMPATIBLE_API_KEY,
      OPENAI_COMPATIBLE_BASE_URL: process.env.OPENAI_COMPATIBLE_BASE_URL,
      OPENAI_COMPATIBLE_MODEL: process.env.OPENAI_COMPATIBLE_MODEL,
    }

    try {
      process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? 'test-key'
      process.env.MODEL_PROVIDER_KIND = 'claude'
      process.env.MODEL_PROTOCOL_FAMILY = 'anthropic-compatible'
      process.env.ANTHROPIC_MODEL = 'MiniMax-M2.7'
      process.env.MINIMAX_MODEL = 'MiniMax-M2.7'
      process.env.OPENAI_COMPATIBLE_API_KEY = 'openai-key'
      process.env.OPENAI_COMPATIBLE_BASE_URL = 'https://api.example.com/v1'
      process.env.OPENAI_COMPATIBLE_MODEL = 'MiniMax-M2.7'

      const options = getModelOptions()

      expect(options.some(opt => opt.value === 'MiniMax-M2.7')).toBe(true)
      expect(options[options.length - 1]?.value).toBe(CUSTOM_MODEL_OPTION)
    } finally {
      if (previousEnv.ANTHROPIC_API_KEY === undefined) {
        delete process.env.ANTHROPIC_API_KEY
      } else {
        process.env.ANTHROPIC_API_KEY = previousEnv.ANTHROPIC_API_KEY
      }
      process.env.MODEL_PROVIDER_KIND = previousEnv.MODEL_PROVIDER_KIND
      process.env.MODEL_PROTOCOL_FAMILY = previousEnv.MODEL_PROTOCOL_FAMILY
      process.env.ANTHROPIC_MODEL = previousEnv.ANTHROPIC_MODEL
      process.env.MINIMAX_MODEL = previousEnv.MINIMAX_MODEL
      process.env.OPENAI_COMPATIBLE_API_KEY = previousEnv.OPENAI_COMPATIBLE_API_KEY
      process.env.OPENAI_COMPATIBLE_BASE_URL = previousEnv.OPENAI_COMPATIBLE_BASE_URL
      process.env.OPENAI_COMPATIBLE_MODEL = previousEnv.OPENAI_COMPATIBLE_MODEL
    }
  })

  it('keeps Others as the final option when MiniMax is the active anthropic-compatible model', () => {
    const previousEnv = {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      MODEL_PROVIDER_KIND: process.env.MODEL_PROVIDER_KIND,
      ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
      MINIMAX_MODEL: process.env.MINIMAX_MODEL,
    }

    try {
      process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? 'test-key'
      process.env.MODEL_PROVIDER_KIND = 'minimax'
      process.env.ANTHROPIC_MODEL = 'MiniMax-M2.7'
      process.env.MINIMAX_MODEL = 'MiniMax-M2.7'

      const options = getModelOptions()

      expect(options.some(opt => opt.value === 'MiniMax-M2.7')).toBe(true)
      expect(options[options.length - 1]?.value).toBe(CUSTOM_MODEL_OPTION)
    } finally {
      if (previousEnv.ANTHROPIC_API_KEY === undefined) {
        delete process.env.ANTHROPIC_API_KEY
      } else {
        process.env.ANTHROPIC_API_KEY = previousEnv.ANTHROPIC_API_KEY
      }
      process.env.MODEL_PROVIDER_KIND = previousEnv.MODEL_PROVIDER_KIND
      process.env.ANTHROPIC_MODEL = previousEnv.ANTHROPIC_MODEL
      process.env.MINIMAX_MODEL = previousEnv.MINIMAX_MODEL
    }
  })

  it('surfaces MiniMax as an option when only legacy ANTHROPIC_MODEL state is present', () => {
    const previousEnv = {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      MODEL_PROVIDER_KIND: process.env.MODEL_PROVIDER_KIND,
      ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
      MINIMAX_MODEL: process.env.MINIMAX_MODEL,
      ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN,
      ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
    }

    try {
      process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? 'test-key'
      delete process.env.MODEL_PROVIDER_KIND
      delete process.env.MINIMAX_MODEL
      process.env.ANTHROPIC_MODEL = 'MiniMax-M2.7-highspeed'
      process.env.ANTHROPIC_AUTH_TOKEN = 'legacy-key'
      process.env.ANTHROPIC_BASE_URL = 'https://api.minimaxi.com/anthropic'

      const options = getModelOptions()

      expect(options.some(opt => opt.value === 'MiniMax-M2.7-highspeed')).toBe(true)
      expect(options.some(opt => opt.label === 'MiniMax-M2.7')).toBe(true)
    } finally {
      if (previousEnv.ANTHROPIC_API_KEY === undefined) {
        delete process.env.ANTHROPIC_API_KEY
      } else {
        process.env.ANTHROPIC_API_KEY = previousEnv.ANTHROPIC_API_KEY
      }
      process.env.MODEL_PROVIDER_KIND = previousEnv.MODEL_PROVIDER_KIND
      process.env.ANTHROPIC_MODEL = previousEnv.ANTHROPIC_MODEL
      process.env.MINIMAX_MODEL = previousEnv.MINIMAX_MODEL
      process.env.ANTHROPIC_AUTH_TOKEN = previousEnv.ANTHROPIC_AUTH_TOKEN
      process.env.ANTHROPIC_BASE_URL = previousEnv.ANTHROPIC_BASE_URL
    }
  })
})
