import { describe, expect, it } from 'bun:test'
import { createUserMessage } from '../../utils/messages.js'
import { asSystemPrompt } from '../../utils/systemPromptType.js'
import { queryOpenAICompatibleModel } from './openaiCompatibleQuery.js'

describe('queryOpenAICompatibleModel', () => {
  it('emits stream events and a final assistant message', async () => {
    const previousEnv = {
      MODEL_PROTOCOL_FAMILY: process.env.MODEL_PROTOCOL_FAMILY,
      ARK_API_KEY: process.env.ARK_API_KEY,
      ARK_MODEL: process.env.ARK_MODEL,
      ARK_BASE_URL: process.env.ARK_BASE_URL,
    }

    const previousFetch = globalThis.fetch
    try {
      process.env.MODEL_PROTOCOL_FAMILY = 'openai-compatible'
      process.env.ARK_API_KEY = 'ark-key'
      process.env.ARK_MODEL = 'doubao-seed-2-0-code-preview-260215'
      process.env.ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'

      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(_input)).toBe(
          'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
        )
        expect(JSON.parse(String(init?.body))).toEqual({
          model: 'doubao-seed-2-0-code-preview-260215',
          messages: [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'hello' },
          ],
          stream: true,
          max_tokens: 64,
          temperature: 0.2,
        })

        return new Response(
          [
            'data: {"id":"chunk_1","object":"chat.completion.chunk","created":1,"model":"doubao-seed-2-0-code-preview-260215","choices":[{"index":0,"delta":{"role":"assistant","content":"hel"},"finish_reason":null}]}',
            '',
            'data: {"id":"chunk_2","object":"chat.completion.chunk","created":2,"model":"doubao-seed-2-0-code-preview-260215","choices":[{"index":0,"delta":{"content":"lo"},"finish_reason":"stop"}]}',
            '',
            'data: [DONE]',
            '',
          ].join('\n'),
          {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          },
        )
      }) as typeof fetch

      const messages: Array<{ type: string }> = []
      for await (const message of queryOpenAICompatibleModel({
        messages: [createUserMessage({ content: 'hello' })],
        systemPrompt: asSystemPrompt(['You are helpful.']),
        model: 'claude-sonnet-4-6',
        signal: new AbortController().signal,
        maxOutputTokens: 64,
        temperature: 0.2,
      })) {
        messages.push(message as { type: string })
      }

      expect(messages[0]?.type).toBe('stream_event')
      expect(messages[messages.length - 1]?.type).toBe('assistant')
    } finally {
      process.env.MODEL_PROTOCOL_FAMILY = previousEnv.MODEL_PROTOCOL_FAMILY
      process.env.ARK_API_KEY = previousEnv.ARK_API_KEY
      process.env.ARK_MODEL = previousEnv.ARK_MODEL
      process.env.ARK_BASE_URL = previousEnv.ARK_BASE_URL
      globalThis.fetch = previousFetch
    }
  })

  it('falls back to non-streaming when the stream yields no chunks', async () => {
    const previousEnv = {
      MODEL_PROTOCOL_FAMILY: process.env.MODEL_PROTOCOL_FAMILY,
      ARK_API_KEY: process.env.ARK_API_KEY,
      ARK_MODEL: process.env.ARK_MODEL,
      ARK_BASE_URL: process.env.ARK_BASE_URL,
    }

    const previousFetch = globalThis.fetch
    try {
      process.env.NODE_ENV = 'test'
      process.env.MODEL_PROTOCOL_FAMILY = 'openai-compatible'
      process.env.ARK_API_KEY = 'ark-key'
      process.env.ARK_MODEL = 'doubao-seed-2-0-code-preview-260215'
      process.env.ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'

      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        const headers = init?.headers as Record<string, string>
        if (headers.Accept === 'text/event-stream') {
          return new Response('', {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          })
        }

        return new Response(
          JSON.stringify({
            id: 'chatcmpl_123',
            object: 'chat.completion',
            created: 123,
            model: 'doubao-seed-2-0-code-preview-260215',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'fallback' },
                finish_reason: 'stop',
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }) as typeof fetch

      const messages: Array<{ type: string }> = []
      for await (const message of queryOpenAICompatibleModel({
        messages: [createUserMessage({ content: 'hello' })],
        systemPrompt: asSystemPrompt(['You are helpful.']),
        model: 'doubao-seed-2-0-code-preview-260215',
        signal: new AbortController().signal,
        maxOutputTokens: 64,
        temperature: 0.2,
      })) {
        messages.push(message as { type: string })
      }

      expect(messages).toHaveLength(1)
      expect(messages[0]?.type).toBe('assistant')
    } finally {
      process.env.MODEL_PROTOCOL_FAMILY = previousEnv.MODEL_PROTOCOL_FAMILY
      process.env.ARK_API_KEY = previousEnv.ARK_API_KEY
      process.env.ARK_MODEL = previousEnv.ARK_MODEL
      process.env.ARK_BASE_URL = previousEnv.ARK_BASE_URL
      globalThis.fetch = previousFetch
    }
  })

  it('emits tool stream events for streamed tool calls', async () => {
    const previousEnv = {
      MODEL_PROTOCOL_FAMILY: process.env.MODEL_PROTOCOL_FAMILY,
      ARK_API_KEY: process.env.ARK_API_KEY,
      ARK_MODEL: process.env.ARK_MODEL,
      ARK_BASE_URL: process.env.ARK_BASE_URL,
    }

    const previousFetch = globalThis.fetch
    try {
      process.env.NODE_ENV = 'test'
      process.env.MODEL_PROTOCOL_FAMILY = 'openai-compatible'
      process.env.ARK_API_KEY = 'ark-key'
      process.env.ARK_MODEL = 'doubao-seed-2-0-code-preview-260215'
      process.env.ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'

      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        const headers = init?.headers as Record<string, string>
        if (headers.Accept === 'text/event-stream') {
          return new Response(
            [
              'data: {"id":"chunk_1","object":"chat.completion.chunk","created":1,"model":"doubao-seed-2-0-code-preview-260215","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"search","arguments":"{\\"q\\":\\"ca"}}]},"finish_reason":null}]}',
              '',
              'data: {"id":"chunk_2","object":"chat.completion.chunk","created":2,"model":"doubao-seed-2-0-code-preview-260215","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"type":"function","function":{"arguments":"ts\\"}"}}]},"finish_reason":"tool_calls"}]}',
              '',
              'data: [DONE]',
              '',
            ].join('\n'),
            {
              status: 200,
              headers: { 'Content-Type': 'text/event-stream' },
            },
          )
        }

        return new Response(
          JSON.stringify({
            id: 'chatcmpl_123',
            object: 'chat.completion',
            created: 123,
            model: 'doubao-seed-2-0-code-preview-260215',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'done' },
                finish_reason: 'stop',
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }) as typeof fetch

      const seen: Array<{ type: string; eventType?: string }> = []
      for await (const message of queryOpenAICompatibleModel({
        messages: [createUserMessage({ content: 'hello' })],
        systemPrompt: asSystemPrompt(['You are helpful.']),
        model: 'doubao-seed-2-0-code-preview-260215',
        signal: new AbortController().signal,
        maxOutputTokens: 64,
        temperature: 0.2,
      })) {
        seen.push({
          type: message.type,
          eventType:
            message.type === 'stream_event' ? message.event.type : undefined,
        })
      }

      expect(seen[0]).toEqual({ type: 'stream_event', eventType: 'message_start' })
      expect(seen.some(item => item.eventType === 'content_block_start')).toBe(true)
      expect(seen.some(item => item.eventType === 'content_block_delta')).toBe(true)
      expect(seen[seen.length - 1]).toEqual({ type: 'assistant', eventType: undefined })
    } finally {
      process.env.MODEL_PROTOCOL_FAMILY = previousEnv.MODEL_PROTOCOL_FAMILY
      process.env.ARK_API_KEY = previousEnv.ARK_API_KEY
      process.env.ARK_MODEL = previousEnv.ARK_MODEL
      process.env.ARK_BASE_URL = previousEnv.ARK_BASE_URL
      globalThis.fetch = previousFetch
    }
  })
})
