import { describe, expect, it } from 'bun:test'
import { CUSTOM_MODEL_OPTION } from '../utils/model/modelOptions.js'
import {
  getInitialCustomProviderDraft,
  resolveModelPickerDefaultValue,
} from './ModelPicker.js'

describe('ModelPicker custom provider behavior', () => {
  it('defaults to Others when openai-compatible config is active', () => {
    expect(
      resolveModelPickerDefaultValue('gpt-4o', {
        MODEL_PROVIDER_KIND: 'openai-compatible',
        MODEL_PROTOCOL_FAMILY: 'openai-compatible',
        OPENAI_COMPATIBLE_API_KEY: 'key',
        OPENAI_COMPATIBLE_BASE_URL: 'https://api.example.com/v1',
        OPENAI_COMPATIBLE_MODEL: 'gpt-4o',
      }),
    ).toBe(CUSTOM_MODEL_OPTION)
  })

  it('keeps the selected anthropic model when not using openai-compatible config', () => {
    expect(
      resolveModelPickerDefaultValue('sonnet', {
        MODEL_PROTOCOL_FAMILY: 'anthropic-compatible',
        ANTHROPIC_MODEL: 'sonnet',
      }),
    ).toBe('sonnet')
  })

  it('does not let a polluted MiniMax value stay selected under Claude', () => {
    expect(
      resolveModelPickerDefaultValue('MiniMax-M2.7', {
        MODEL_PROVIDER_KIND: 'claude',
        MODEL_PROTOCOL_FAMILY: 'anthropic-compatible',
      }),
    ).toBe('__NO_PREFERENCE__')
  })

  it('prefers canonical openai-compatible config over legacy Ark vars when reopening Others', () => {
    expect(
      getInitialCustomProviderDraft({
        ARK_API_KEY: 'legacy-ark-key',
        ARK_BASE_URL: 'https://ark.cn-beijing.volces.com/api/v3/',
        ARK_MODEL: 'legacy-ark-model',
        OPENAI_COMPATIBLE_API_KEY: 'openai-compatible-key',
        OPENAI_COMPATIBLE_BASE_URL: 'https://api.example.com/v1/',
        OPENAI_COMPATIBLE_MODEL: 'gpt-4o-mini',
      }),
    ).toEqual({
      apiKey: 'openai-compatible-key',
      baseURL: 'https://api.example.com/v1',
      model: 'gpt-4o-mini',
    })
  })

  it('falls back to Default when a polluted openai-compatible model is no longer the active family', () => {
    expect(
      resolveModelPickerDefaultValue('MiniMax-M2.7', {
        MODEL_PROVIDER_KIND: 'claude',
        MODEL_PROTOCOL_FAMILY: 'anthropic-compatible',
        OPENAI_COMPATIBLE_API_KEY: 'key',
        OPENAI_COMPATIBLE_BASE_URL: 'https://api.example.com/v1',
        OPENAI_COMPATIBLE_MODEL: 'MiniMax-M2.7',
      }),
    ).toBe('__NO_PREFERENCE__')
  })
})
