import { APIUserAbortError } from '@anthropic-ai/sdk/error'
import type { BetaUsage as Usage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { randomUUID } from 'crypto'
import type { Tools } from '../../Tool.js'
import type {
  AssistantMessage,
  Message,
  StreamEvent,
} from '../../types/message.js'
import type { SystemPrompt } from '../../utils/systemPromptType.js'
import { EMPTY_USAGE } from './emptyUsage.js'
import {
  createAssistantAPIErrorMessage,
  createAssistantMessage,
  normalizeMessagesForAPI,
} from '../../utils/messages.js'
import { createArkClient } from '../../providers/ark.js'
import type {
  AnthropicCompatibleMessage,
  AnthropicCompatibleContentBlock,
} from '../../providers/openai-compatible/types.js'
import {
  fromOpenAIChatCompletionResponse,
  toOpenAIChatMessages,
  toOpenAIChatToolChoice,
  toOpenAIChatTools,
  type AnthropicCompatibleToolSchema,
} from '../../providers/openai-compatible/adapter.js'
import type { OpenAIChatCompletionChunk } from '../../providers/openai-compatible/types.js'

function mapUsage(usage?: {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}): Usage {
  return {
    ...EMPTY_USAGE,
    input_tokens: usage?.prompt_tokens ?? 0,
    output_tokens: usage?.completion_tokens ?? 0,
  }
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.message.includes('aborted'))
  )
}

export async function* queryOpenAICompatibleModel({
  messages,
  systemPrompt,
  model,
  signal,
  temperature,
  maxOutputTokens,
  tools,
  toolChoice,
}: {
  messages: Message[]
  systemPrompt: SystemPrompt
  model: string
  signal: AbortSignal
  temperature?: number
  maxOutputTokens: number
  tools?: AnthropicCompatibleToolSchema[]
  toolChoice?: { type: 'auto' | 'none' | 'tool'; name?: string }
}): AsyncGenerator<StreamEvent | AssistantMessage> {
  const client = createArkClient()
  if (!client) {
    yield createAssistantAPIErrorMessage({
      content:
        'Ark/OpenAI-compatible mode is selected, but no Ark configuration was found.',
    })
    return
  }

  const normalizedMessages = normalizeMessagesForAPI(
    messages,
    (tools ?? []) as unknown as Tools,
  )

  const requestMessages: AnthropicCompatibleMessage[] = []
  const systemText = systemPrompt.join('\n\n').trim()
  if (systemText) {
    requestMessages.push({
      role: 'system',
      content: systemText,
    })
  }

  for (const message of normalizedMessages) {
    requestMessages.push({
      role: message.type,
      content: Array.isArray(message.message.content)
        ? (message.message.content as AnthropicCompatibleContentBlock[])
        : message.message.content,
    })
  }

  const requestOptions = {
    max_tokens: maxOutputTokens,
    temperature,
    signal,
    ...(tools && tools.length > 0 && { tools: toOpenAIChatTools(tools) }),
    ...(toolChoice && { tool_choice: toOpenAIChatToolChoice(toolChoice) }),
  }

  try {
    const startedAt = Date.now()
    const streamState = {
      hasStarted: false,
      textBlockStarted: false,
      contentParts: [] as string[],
      toolCallParts: new Map<
        number,
        {
          id?: string
          name?: string
          arguments: string
        }
      >(),
      finishReason: null as string | null,
      usage: undefined as
        | {
            prompt_tokens?: number
            completion_tokens?: number
            total_tokens?: number
          }
        | undefined,
      firstChunk: undefined as OpenAIChatCompletionChunk | undefined,
      lastChunk: undefined as OpenAIChatCompletionChunk | undefined,
    }

    try {
      for await (const chunk of client.createChatCompletionStream(
        {
          ...requestOptions,
          messages: toOpenAIChatMessages(requestMessages, { includeImages: true }),
        },
      )) {
        streamState.firstChunk ??= chunk
        streamState.lastChunk = chunk
        if (!streamState.hasStarted) {
          streamState.hasStarted = true
          yield {
            type: 'stream_event',
            event: {
              type: 'message_start',
              message: {
                id: randomUUID(),
                role: 'assistant',
                type: 'message',
                content: [],
              },
            },
            ttftMs: Date.now() - startedAt,
          } as StreamEvent
        }

        for (const choice of chunk.choices) {
          if (choice.delta.content) {
            if (!streamState.textBlockStarted) {
              streamState.textBlockStarted = true
              yield {
                type: 'stream_event',
                event: {
                  type: 'content_block_start',
                  index: 0,
                  content_block: {
                    type: 'text',
                    text: '',
                  },
                },
              } as StreamEvent
            }
            streamState.contentParts.push(choice.delta.content)
            yield {
              type: 'stream_event',
              event: {
                type: 'content_block_delta',
                index: 0,
                delta: {
                  type: 'text_delta',
                  text: choice.delta.content,
                },
              },
            } as StreamEvent
          }

          for (const toolCall of choice.delta.tool_calls ?? []) {
            const current = streamState.toolCallParts.get(toolCall.index) ?? {
              arguments: '',
            }
            const started = streamState.toolCallParts.has(toolCall.index)
            if (toolCall.id) {
              current.id = toolCall.id
            }
            if (toolCall.function?.name) {
              current.name = toolCall.function.name
            }
            if (toolCall.function?.arguments) {
              current.arguments += toolCall.function.arguments
            }
            streamState.toolCallParts.set(toolCall.index, current)

            if (!started) {
              yield {
                type: 'stream_event',
                event: {
                  type: 'content_block_start',
                  index: toolCall.index,
                  content_block: {
                    type: 'tool_use',
                    id: current.id ?? toolCall.id ?? randomUUID(),
                    name: current.name ?? toolCall.function?.name ?? '',
                    input: {},
                  },
                },
              } as StreamEvent
            }

            yield {
              type: 'stream_event',
              event: {
                type: 'content_block_delta',
                index: toolCall.index,
                delta: {
                  type: 'input_json_delta',
                  partial_json: toolCall.function?.arguments ?? '',
                },
              },
            } as StreamEvent
          }

          if (choice.finish_reason !== null) {
            streamState.finishReason = choice.finish_reason
          }
        }
      }
    } catch (error) {
      if (
        !streamState.hasStarted &&
        shouldFallbackToNonStreaming(error)
      ) {
        const response = await client.createChatCompletionFromAnthropicMessages(
          requestMessages,
          requestOptions,
        )
        const resultMessages = fromOpenAIChatCompletionResponse(response)
        const content = resultMessages[0]?.content ?? ''
        yield createAssistantMessage({
          content: resultMessages[0]?.content ?? content,
          usage: mapUsage(response.usage),
        })
        return
      }

      throw error
    }

    if (!streamState.firstChunk || !streamState.lastChunk) {
      const response = await client.createChatCompletionFromAnthropicMessages(
        requestMessages,
        requestOptions,
      )
      const resultMessages = fromOpenAIChatCompletionResponse(response)
      const content = resultMessages[0]?.content ?? ''
      yield createAssistantMessage({
        content: resultMessages[0]?.content ?? content,
        usage: mapUsage(response.usage),
      })
      return
    }

    if (streamState.textBlockStarted) {
      yield {
        type: 'stream_event',
        event: {
          type: 'content_block_stop',
          index: 0,
        },
      } as StreamEvent
    }

    for (const index of [...streamState.toolCallParts.keys()].sort(
      (left, right) => left - right,
    )) {
      yield {
        type: 'stream_event',
        event: {
          type: 'content_block_stop',
          index,
        },
      } as StreamEvent
    }

    const toolCalls = [...streamState.toolCallParts.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, toolCall]) => ({
        id: toolCall.id ?? '',
        type: 'function' as const,
        function: {
          name: toolCall.name ?? '',
          arguments: toolCall.arguments,
        },
      }))

    yield {
      type: 'stream_event',
      event: {
        type: 'message_delta',
        context_management: null,
        delta: {
          container: null,
          stop_reason: streamState.finishReason,
          stop_sequence: null,
        },
        usage: {
          input_tokens: streamState.lastChunk?.usage?.prompt_tokens ?? null,
          output_tokens:
            streamState.lastChunk?.usage?.completion_tokens ?? 0,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null,
          iterations: null,
          server_tool_use: null,
        },
      } as never,
    } as StreamEvent
    yield {
      type: 'stream_event',
      event: {
        type: 'message_stop',
      },
    } as StreamEvent

    const response = {
      id: streamState.lastChunk.id ?? streamState.firstChunk.id,
      object: 'chat.completion' as const,
      created: streamState.lastChunk.created ?? streamState.firstChunk.created,
      model: streamState.lastChunk.model ?? streamState.firstChunk.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant' as const,
            content:
              streamState.contentParts.length > 0
                ? streamState.contentParts.join('')
                : null,
            ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
          },
          finish_reason: streamState.finishReason,
        },
      ],
      ...(streamState.lastChunk.usage
        ? { usage: streamState.lastChunk.usage }
        : {}),
    }

    const resultMessages = fromOpenAIChatCompletionResponse(response)
    const content = resultMessages[0]?.content ?? ''
    yield createAssistantMessage({
      content: resultMessages[0]?.content ?? content,
      usage: mapUsage(response.usage),
    })
    return
  } catch (error) {
    if (signal.aborted || isAbortError(error)) {
      throw new APIUserAbortError()
    }
    yield createAssistantAPIErrorMessage({
      content: `Ark/OpenAI-compatible request failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    })
    return
  }
}

function shouldFallbackToNonStreaming(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes('returned no body') ||
      error.message.includes('failed with 404') ||
      error.message.includes('failed with 405') ||
      error.message.includes('text/event-stream'))
  )
}
