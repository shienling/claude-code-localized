import { describe, expect, it } from 'bun:test'
import {
  formatOpenAICompatibleError,
  OpenAICompatibleRequestError,
} from './errors.js'

describe('openai-compatible errors', () => {
  it('formats auth and transport errors clearly', () => {
    expect(
      formatOpenAICompatibleError(
        new OpenAICompatibleRequestError({
          kind: 'http',
          requestURL: 'https://api.example.com/v1/chat/completions',
          status: 401,
          responseText: '{"error":"invalid api key"}',
          message: 'OpenAI-compatible request failed with 401',
        }),
      ),
    ).toContain('Unauthorized (401)')

    expect(
      formatOpenAICompatibleError(
        new OpenAICompatibleRequestError({
          kind: 'network',
          requestURL: 'https://api.example.com/v1/chat/completions',
          message: 'Unable to connect to API',
        }),
      ),
    ).toContain('Unable to connect to API at https://api.example.com/v1/chat/completions')
  })
})
