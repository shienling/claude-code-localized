import { describe, expect, it } from 'bun:test'
import { setMainLoopModelOverride } from '../../bootstrap/state.js'
import {
  getUserSpecifiedModelSetting,
  getMainLoopModel,
} from './model.js'

describe('model selection isolation', () => {
  it('keeps Claude family separate from a saved MiniMax config', () => {
    const previousEnv = {
      MODEL_PROVIDER_KIND: process.env.MODEL_PROVIDER_KIND,
      ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
      MINIMAX_MODEL: process.env.MINIMAX_MODEL,
    }

    try {
      setMainLoopModelOverride(undefined)
      process.env.MODEL_PROVIDER_KIND = 'claude'
      process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-6'
      process.env.MINIMAX_MODEL = 'MiniMax-M2.7'

      expect(getUserSpecifiedModelSetting()).toBe('claude-sonnet-4-6')
      expect(getMainLoopModel()).toBe('claude-sonnet-4-6')
    } finally {
      setMainLoopModelOverride(undefined)
      process.env.MODEL_PROVIDER_KIND = previousEnv.MODEL_PROVIDER_KIND
      process.env.ANTHROPIC_MODEL = previousEnv.ANTHROPIC_MODEL
      process.env.MINIMAX_MODEL = previousEnv.MINIMAX_MODEL
    }
  })

  it('keeps MiniMax isolated when the minimax provider kind is active', () => {
    const previousEnv = {
      MODEL_PROVIDER_KIND: process.env.MODEL_PROVIDER_KIND,
      ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
      MINIMAX_MODEL: process.env.MINIMAX_MODEL,
    }

    try {
      setMainLoopModelOverride(undefined)
      process.env.MODEL_PROVIDER_KIND = 'minimax'
      process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-6'
      process.env.MINIMAX_MODEL = 'MiniMax-M2.7'

      expect(getUserSpecifiedModelSetting()).toBe('MiniMax-M2.7')
      expect(getMainLoopModel()).toBe('MiniMax-M2.7')
    } finally {
      setMainLoopModelOverride(undefined)
      process.env.MODEL_PROVIDER_KIND = previousEnv.MODEL_PROVIDER_KIND
      process.env.ANTHROPIC_MODEL = previousEnv.ANTHROPIC_MODEL
      process.env.MINIMAX_MODEL = previousEnv.MINIMAX_MODEL
    }
  })

  it('prefers openai-compatible provider config when that family is active', () => {
    const previousEnv = {
      MODEL_PROVIDER_KIND: process.env.MODEL_PROVIDER_KIND,
      MODEL_PROTOCOL_FAMILY: process.env.MODEL_PROTOCOL_FAMILY,
      ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
      OPENAI_COMPATIBLE_API_KEY: process.env.OPENAI_COMPATIBLE_API_KEY,
      OPENAI_COMPATIBLE_BASE_URL: process.env.OPENAI_COMPATIBLE_BASE_URL,
      OPENAI_COMPATIBLE_MODEL: process.env.OPENAI_COMPATIBLE_MODEL,
    }

    try {
      setMainLoopModelOverride(undefined)
      process.env.MODEL_PROVIDER_KIND = 'openai-compatible'
      process.env.MODEL_PROTOCOL_FAMILY = 'openai-compatible'
      process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-6'
      process.env.OPENAI_COMPATIBLE_API_KEY = 'openai-key'
      process.env.OPENAI_COMPATIBLE_BASE_URL = 'https://api.example.com/v1'
      process.env.OPENAI_COMPATIBLE_MODEL = 'MiniMax-M2.7'

      expect(getUserSpecifiedModelSetting()).toBe('MiniMax-M2.7')
    } finally {
      setMainLoopModelOverride(undefined)
      process.env.MODEL_PROVIDER_KIND = previousEnv.MODEL_PROVIDER_KIND
      process.env.MODEL_PROTOCOL_FAMILY = previousEnv.MODEL_PROTOCOL_FAMILY
      process.env.ANTHROPIC_MODEL = previousEnv.ANTHROPIC_MODEL
      process.env.OPENAI_COMPATIBLE_API_KEY = previousEnv.OPENAI_COMPATIBLE_API_KEY
      process.env.OPENAI_COMPATIBLE_BASE_URL = previousEnv.OPENAI_COMPATIBLE_BASE_URL
      process.env.OPENAI_COMPATIBLE_MODEL = previousEnv.OPENAI_COMPATIBLE_MODEL
    }
  })

  it('ignores a polluted openai-compatible model when anthropic family is active', () => {
    const previousEnv = {
      MODEL_PROVIDER_KIND: process.env.MODEL_PROVIDER_KIND,
      MODEL_PROTOCOL_FAMILY: process.env.MODEL_PROTOCOL_FAMILY,
      ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
      OPENAI_COMPATIBLE_API_KEY: process.env.OPENAI_COMPATIBLE_API_KEY,
      OPENAI_COMPATIBLE_BASE_URL: process.env.OPENAI_COMPATIBLE_BASE_URL,
      OPENAI_COMPATIBLE_MODEL: process.env.OPENAI_COMPATIBLE_MODEL,
    }

    try {
      setMainLoopModelOverride(undefined)
      process.env.MODEL_PROVIDER_KIND = 'claude'
      process.env.MODEL_PROTOCOL_FAMILY = 'anthropic-compatible'
      process.env.ANTHROPIC_MODEL = 'MiniMax-M2.7'
      process.env.OPENAI_COMPATIBLE_API_KEY = 'openai-key'
      process.env.OPENAI_COMPATIBLE_BASE_URL = 'https://api.example.com/v1'
      process.env.OPENAI_COMPATIBLE_MODEL = 'MiniMax-M2.7'

      expect(getUserSpecifiedModelSetting()).not.toBe('MiniMax-M2.7')
    } finally {
      setMainLoopModelOverride(undefined)
      process.env.MODEL_PROVIDER_KIND = previousEnv.MODEL_PROVIDER_KIND
      process.env.MODEL_PROTOCOL_FAMILY = previousEnv.MODEL_PROTOCOL_FAMILY
      process.env.ANTHROPIC_MODEL = previousEnv.ANTHROPIC_MODEL
      process.env.OPENAI_COMPATIBLE_API_KEY = previousEnv.OPENAI_COMPATIBLE_API_KEY
      process.env.OPENAI_COMPATIBLE_BASE_URL = previousEnv.OPENAI_COMPATIBLE_BASE_URL
      process.env.OPENAI_COMPATIBLE_MODEL = previousEnv.OPENAI_COMPATIBLE_MODEL
    }
  })
})
