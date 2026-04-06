import { describe, expect, it } from 'bun:test'
import {
  fromOpenAIChatCompletionResponse,
  toOpenAIChatMessages,
  toOpenAIChatToolChoice,
  toOpenAIChatTools,
} from './adapter.js'

describe('openai-compatible adapter', () => {
  it('maps Anthropic-style text, image, and tool blocks to OpenAI messages', () => {
    const messages = toOpenAIChatMessages([
      {
        role: 'system',
        content: 'You are helpful.',
      },
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: 'https://example.com/image.png' } },
          { type: 'text', text: 'What is in this image?' },
        ],
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I can inspect it.' },
          { type: 'tool_use', id: 'tool-1', name: 'search', input: { q: 'cats' } },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tool-1', content: 'done' },
        ],
      },
    ])

    expect(messages).toEqual([
      { role: 'system', content: 'You are helpful.' },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: 'https://example.com/image.png' },
          },
          { type: 'text', text: 'What is in this image?' },
        ],
      },
      {
        role: 'assistant',
        content: 'I can inspect it.',
        tool_calls: [
          {
            id: 'tool-1',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"q":"cats"}',
            },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'tool-1',
        content: 'done',
      },
    ])
  })

  it('converts chat completion responses back to assistant messages', () => {
    expect(
      fromOpenAIChatCompletionResponse({
        id: 'chatcmpl_1',
        object: 'chat.completion',
        created: 1,
        model: 'doubao-seed-2-0-code-preview-260215',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'hello' },
            finish_reason: 'stop',
          },
        ],
      }),
    ).toEqual([
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'hello',
          },
        ],
      },
    ])
  })

  it('preserves tool calls when converting responses back', () => {
    expect(
      fromOpenAIChatCompletionResponse({
        id: 'chatcmpl_2',
        object: 'chat.completion',
        created: 2,
        model: 'doubao-seed-2-0-code-preview-260215',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'search',
                    arguments: '{"q":"cats"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }),
    ).toEqual([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'call_1',
            name: 'search',
            input: { q: 'cats' },
          },
        ],
      },
    ])
  })

  it('maps tool schemas and tool choice to OpenAI shape', () => {
    expect(
      toOpenAIChatTools([
        {
          name: 'search',
          description: 'Search the web',
          input_schema: { type: 'object', properties: {} },
          strict: true,
        },
      ]),
    ).toEqual([
      {
        type: 'function',
        function: {
          name: 'search',
          description: 'Search the web',
          parameters: { type: 'object', properties: {} },
          strict: true,
        },
      },
    ])

    expect(toOpenAIChatToolChoice({ type: 'tool', name: 'search' })).toEqual({
      type: 'function',
      function: { name: 'search' },
    })
    expect(toOpenAIChatToolChoice({ type: 'auto' })).toBe('auto')
    expect(toOpenAIChatToolChoice({ type: 'none' })).toBe('none')
  })
})
