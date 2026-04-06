import { describe, expect, it } from 'bun:test'
import { OpenAICompatibleClient } from './client.js'

describe('OpenAICompatibleClient', () => {
  it('posts chat completions with bearer auth', async () => {
    const calls: Array<{
      url: string
      init: RequestInit
    }> = []

    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        init: init ?? {},
      })

      return new Response(
        JSON.stringify({
          id: 'chatcmpl_123',
          object: 'chat.completion',
          created: 123,
          model: 'doubao-seed-2-0-code-preview-260215',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'hello' },
              finish_reason: 'stop',
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    const client = new OpenAICompatibleClient(
      {
        apiKey: 'ark-key',
        baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
        model: 'doubao-seed-2-0-code-preview-260215',
      },
      { fetchImpl: fetchImpl as typeof fetch },
    )

    const response = await client.createChatCompletion({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://example.com/image.png' } },
            { type: 'text', text: 'What is in this image?' },
          ],
        },
      ],
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(
      'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    )
    expect(calls[0]?.init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer ark-key',
    })
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      model: 'doubao-seed-2-0-code-preview-260215',
      messages: [
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
      ],
    })
    expect(response.choices[0]?.message.content).toBe('hello')
  })

  it('translates Anthropic-style messages before posting', async () => {
    let body: unknown
    const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body))
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
    }

    const client = new OpenAICompatibleClient(
      {
        apiKey: 'ark-key',
        baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
        model: 'doubao-seed-2-0-code-preview-260215',
      },
      { fetchImpl: fetchImpl as typeof fetch },
    )

    await client.createChatCompletionFromAnthropicMessages([
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: 'https://example.com/cat.png' } },
          { type: 'text', text: 'Describe this.' },
        ],
      },
    ])

    expect(body).toEqual({
      model: 'doubao-seed-2-0-code-preview-260215',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/cat.png' },
            },
            { type: 'text', text: 'Describe this.' },
          ],
        },
      ],
    })
  })

  it('includes tools and tool choice when provided', async () => {
    let body: unknown
    const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body))
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
    }

    const client = new OpenAICompatibleClient(
      {
        apiKey: 'ark-key',
        baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
        model: 'doubao-seed-2-0-code-preview-260215',
      },
      { fetchImpl: fetchImpl as typeof fetch },
    )

    await client.createChatCompletion({
      messages: [{ role: 'user', content: 'hello' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'search',
            description: 'Search the web',
            parameters: { type: 'object', properties: {} },
          },
        },
      ],
      tool_choice: {
        type: 'function',
        function: { name: 'search' },
      },
    })

    expect(body).toEqual({
      model: 'doubao-seed-2-0-code-preview-260215',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'search',
            description: 'Search the web',
            parameters: { type: 'object', properties: {} },
          },
        },
      ],
      tool_choice: {
        type: 'function',
        function: { name: 'search' },
      },
    })
  })

  it('parses streaming chunks from SSE responses', async () => {
    const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toEqual({
        'Content-Type': 'application/json',
        Authorization: 'Bearer ark-key',
        Accept: 'text/event-stream',
      })
      expect(JSON.parse(String(init?.body))).toEqual({
        model: 'doubao-seed-2-0-code-preview-260215',
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
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
    }

    const client = new OpenAICompatibleClient(
      {
        apiKey: 'ark-key',
        baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
        model: 'doubao-seed-2-0-code-preview-260215',
      },
      { fetchImpl: fetchImpl as typeof fetch },
    )

    const chunks: string[] = []
    for await (const chunk of client.createChatCompletionStream({
      messages: [{ role: 'user', content: 'hello' }],
    })) {
      chunks.push(chunk.choices[0]?.delta.content ?? '')
    }

    expect(chunks).toEqual(['hel', 'lo'])
  })

  it('parses streaming tool call chunks from SSE responses', async () => {
    const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        model: 'doubao-seed-2-0-code-preview-260215',
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      })

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

    const client = new OpenAICompatibleClient(
      {
        apiKey: 'ark-key',
        baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
        model: 'doubao-seed-2-0-code-preview-260215',
      },
      { fetchImpl: fetchImpl as typeof fetch },
    )

    const assembled: Array<{
      id?: string
      name?: string
      arguments?: string
      finishReason?: string | null
    }> = []

    let content = ''
    for await (const chunk of client.createChatCompletionStream({
      messages: [{ role: 'user', content: 'hello' }],
    })) {
      const choice = chunk.choices[0]
      content += choice?.delta.content ?? ''
      if (choice?.delta.tool_calls?.length) {
        const toolCall = choice.delta.tool_calls[0]
        assembled.push({
          id: toolCall.id,
          name: toolCall.function?.name,
          arguments: toolCall.function?.arguments,
          finishReason: choice.finish_reason,
        })
      }
    }

    expect(content).toBe('')
    expect(assembled).toEqual([
      {
        id: 'call_1',
        name: 'search',
        arguments: '{"q":"ca',
        finishReason: null,
      },
      {
        id: undefined,
        name: undefined,
        arguments: 'ts"}',
        finishReason: 'tool_calls',
      },
    ])
  })
})
