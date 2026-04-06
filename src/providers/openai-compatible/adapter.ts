import type {
  AnthropicCompatibleContentBlock,
  AnthropicCompatibleMessage,
  OpenAIChatToolChoice,
  OpenAIChatToolDefinition,
  OpenAIChatMessage,
  OpenAIToolCall,
  OpenAIChatCompletionResponse,
} from './types.js'
import { safeParseJSON } from '../../utils/json.js'

function isTextBlock(
  block: AnthropicCompatibleContentBlock,
): block is Extract<AnthropicCompatibleContentBlock, { type: 'text' }> {
  return block.type === 'text'
}

function isImageBlock(
  block: AnthropicCompatibleContentBlock,
): block is Extract<AnthropicCompatibleContentBlock, { type: 'image' }> {
  return block.type === 'image'
}

function isToolUseBlock(
  block: AnthropicCompatibleContentBlock,
): block is Extract<AnthropicCompatibleContentBlock, { type: 'tool_use' }> {
  return block.type === 'tool_use'
}

function isToolResultBlock(
  block: AnthropicCompatibleContentBlock,
): block is Extract<AnthropicCompatibleContentBlock, { type: 'tool_result' }> {
  return block.type === 'tool_result'
}

function stringifyContent(content: unknown): string {
  if (typeof content === 'string') return content
  return JSON.stringify(content)
}

export type AnthropicCompatibleToolSchema = {
  name: string
  description?: string
  input_schema?: unknown
  strict?: boolean
}

export function toOpenAIChatTools(
  tools: AnthropicCompatibleToolSchema[],
): OpenAIChatToolDefinition[] {
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
      ...(tool.input_schema !== undefined
        ? { parameters: tool.input_schema }
        : {}),
      ...(tool.strict !== undefined ? { strict: tool.strict } : {}),
    },
  }))
}

export function toOpenAIChatToolChoice(
  toolChoice?: { type: 'auto' | 'none' | 'tool'; name?: string } | undefined,
): OpenAIChatToolChoice | undefined {
  if (!toolChoice) return undefined
  if (toolChoice.type === 'auto') return 'auto'
  if (toolChoice.type === 'none') return 'none'
  if (toolChoice.type === 'tool' && toolChoice.name) {
    return {
      type: 'function',
      function: { name: toolChoice.name },
    }
  }
  return undefined
}

function imageSourceToURL(
  source: Extract<AnthropicCompatibleContentBlock, { type: 'image' }>['source'],
): string {
  if (source.type === 'url') return source.url
  return `data:${source.media_type};base64,${source.data}`
}

export function toOpenAIChatMessages(
  messages: AnthropicCompatibleMessage[],
  options: { includeImages?: boolean } = { includeImages: true },
): OpenAIChatMessage[] {
  const output: OpenAIChatMessage[] = []

  for (const message of messages) {
    if (typeof message.content === 'string') {
      output.push({
        role: message.role,
        content: message.content,
        ...(message.name ? { name: message.name } : {}),
      })
      continue
    }

    const textParts: string[] = []
    const imageParts: {
      type: 'image_url'
      image_url: { url: string }
    }[] = []
    const toolCalls: OpenAIToolCall[] = []
    let hasNonResultContent = false

    for (const block of message.content) {
      if (isTextBlock(block)) {
        textParts.push(block.text)
        hasNonResultContent = true
      } else if (isImageBlock(block)) {
        imageParts.push({
          type: 'image_url' as const,
          image_url: { url: imageSourceToURL(block.source) },
        })
        hasNonResultContent = true
      } else if (isToolUseBlock(block)) {
        if (message.role === 'assistant') {
          toolCalls.push({
            id: block.id,
            type: 'function',
            function: {
              name: block.name,
              arguments: stringifyContent(block.input),
            },
          })
        }
      } else if (isToolResultBlock(block)) {
        output.push({
          role: 'tool',
          tool_call_id: block.tool_use_id,
          content: stringifyContent(block.content),
        })
      }
    }

    if (message.role === 'assistant') {
      output.push({
        role: 'assistant',
        content: textParts.length > 0 ? textParts.join('\n') : null,
        ...(message.name ? { name: message.name } : {}),
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      })
      continue
    }

    if (hasNonResultContent) {
      output.push({
        role: message.role,
        content:
          options.includeImages && imageParts.length > 0
            ? [
                ...imageParts,
                ...(textParts.length > 0
                  ? [{ type: 'text' as const, text: textParts.join('\n') }]
                  : []),
              ]
            : textParts.join('\n'),
        ...(message.name ? { name: message.name } : {}),
      })
    }
  }

  return output
}

export function fromOpenAIChatCompletionResponse(
  response: OpenAIChatCompletionResponse,
): AnthropicCompatibleMessage[] {
  const choice = response.choices[0]
  if (!choice) return []

  const content: AnthropicCompatibleContentBlock[] = []
  if (choice.message.content) {
    content.push({ type: 'text', text: choice.message.content })
  }

  for (const call of choice.message.tool_calls ?? []) {
    content.push({
      type: 'tool_use',
      id: call.id,
      name: call.function.name,
      input: safeParseJSON(call.function.arguments, false) ?? call.function.arguments,
    })
  }

  return [
    {
      role: 'assistant',
      content: content.length > 0 ? content : '',
    },
  ]
}
