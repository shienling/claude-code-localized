import {
  buildOpenAICompatibleRequestURL,
  type OpenAICompatibleProviderConfig,
} from './config.js'
import { toOpenAIChatMessages } from './adapter.js'
import {
  OpenAICompatibleRequestError,
} from './errors.js'
import type {
  AnthropicCompatibleMessage,
  OpenAIChatCompletionChunk,
  OpenAIChatCompletionRequest,
  OpenAIChatCompletionResponse,
} from './types.js'

export type OpenAICompatibleClientOptions = {
  fetchImpl?: typeof fetch
}

export class OpenAICompatibleClient {
  constructor(
    private readonly config: OpenAICompatibleProviderConfig,
    private readonly options: OpenAICompatibleClientOptions = {},
  ) {}

  async createChatCompletion(
    request: Omit<OpenAIChatCompletionRequest, 'model'> & {
      model?: string
      signal?: AbortSignal
    },
  ): Promise<OpenAIChatCompletionResponse> {
    const { signal, ...bodyRequest } = request
    const fetchImpl = this.options.fetchImpl ?? fetch
    const requestURL = buildOpenAICompatibleRequestURL(this.config.baseURL)
    let response: Response
    try {
      response = await fetchImpl(requestURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        signal,
        body: JSON.stringify({
          ...bodyRequest,
          model: bodyRequest.model ?? this.config.model,
        }),
      })
    } catch (cause) {
      throw new OpenAICompatibleRequestError({
        kind: 'network',
        requestURL,
        message: `Unable to connect to API at ${requestURL}. Check the API address, network, proxy, and TLS certificates.`,
        cause,
      })
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new OpenAICompatibleRequestError({
        kind: 'http',
        requestURL,
        status: response.status,
        responseText: errorText,
        message: `OpenAI-compatible request failed with ${response.status}: ${errorText || response.statusText}`,
      })
    }

    return (await response.json()) as OpenAIChatCompletionResponse
  }

  async *createChatCompletionStream(
    request: Omit<OpenAIChatCompletionRequest, 'model' | 'stream'> & {
      model?: string
      signal?: AbortSignal
    },
  ): AsyncGenerator<OpenAIChatCompletionChunk> {
    const { signal, ...bodyRequest } = request
    const fetchImpl = this.options.fetchImpl ?? fetch
    const requestURL = buildOpenAICompatibleRequestURL(this.config.baseURL)
    let response: Response
    try {
      response = await fetchImpl(requestURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
          Accept: 'text/event-stream',
        },
        signal,
        body: JSON.stringify({
          ...bodyRequest,
          stream: true,
          model: bodyRequest.model ?? this.config.model,
        }),
      })
    } catch (cause) {
      throw new OpenAICompatibleRequestError({
        kind: 'network',
        requestURL,
        message: `Unable to connect to API at ${requestURL}. Check the API address, network, proxy, and TLS certificates.`,
        cause,
      })
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new OpenAICompatibleRequestError({
        kind: 'http',
        requestURL,
        status: response.status,
        responseText: errorText,
        message: `OpenAI-compatible request failed with ${response.status}: ${errorText || response.statusText}`,
      })
    }

    if (!response.body) {
      throw new OpenAICompatibleRequestError({
        kind: 'empty-response',
        requestURL,
        message: `API at ${requestURL} returned no response body.`,
      })
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const { frames, remaining } = parseSseFrames(buffer)
        buffer = remaining

        for (const frame of frames) {
          if (!frame.data || frame.data === '[DONE]') continue
          yield JSON.parse(frame.data) as OpenAIChatCompletionChunk
        }
      }

      buffer += decoder.decode()
      const { frames } = parseSseFrames(buffer)
      for (const frame of frames) {
        if (!frame.data || frame.data === '[DONE]') continue
        yield JSON.parse(frame.data) as OpenAIChatCompletionChunk
      }
    } finally {
      reader.releaseLock()
    }
  }

  async createChatCompletionFromAnthropicMessages(
    messages: AnthropicCompatibleMessage[],
    request: Omit<OpenAIChatCompletionRequest, 'model' | 'messages'> & {
      model?: string
      signal?: AbortSignal
    } = {},
  ): Promise<OpenAIChatCompletionResponse> {
    return this.createChatCompletion({
      ...request,
      messages: toOpenAIChatMessages(messages),
    })
  }
}

type ParsedSseFrame = {
  data?: string
}

function parseSseFrames(buffer: string): {
  frames: ParsedSseFrame[]
  remaining: string
} {
  const frames: ParsedSseFrame[] = []
  let pos = 0

  let idx: number
  while ((idx = buffer.indexOf('\n\n', pos)) !== -1) {
    const rawFrame = buffer.slice(pos, idx)
    pos = idx + 2

    if (!rawFrame.trim()) continue

    const frame: ParsedSseFrame = {}
    for (const line of rawFrame.split('\n')) {
      if (!line.startsWith('data:')) continue
      frame.data = line.startsWith('data: ')
        ? line.slice(6)
        : line.slice(5)
    }

    if (frame.data !== undefined) {
      frames.push(frame)
    }
  }

  return { frames, remaining: buffer.slice(pos) }
}
