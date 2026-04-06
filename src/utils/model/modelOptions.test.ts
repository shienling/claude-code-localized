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
})
