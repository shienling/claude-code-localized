export type OpenAIImageURLPart = {
  type: 'image_url'
  image_url: {
    url: string
    detail?: 'auto' | 'low' | 'high'
  }
}

export type OpenAITextPart = {
  type: 'text'
  text: string
}

export type OpenAIContentPart = OpenAITextPart | OpenAIImageURLPart

export type OpenAIChatRole = 'system' | 'user' | 'assistant' | 'tool'

export type OpenAIChatMessage = {
  role: OpenAIChatRole
  content: string | OpenAIContentPart[] | null
  name?: string
  tool_call_id?: string
  tool_calls?: OpenAIToolCall[]
}

export type OpenAIToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export type OpenAIChatToolDefinition = {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: unknown
    strict?: boolean
  }
}

export type OpenAIChatToolChoice =
  | 'auto'
  | 'none'
  | {
      type: 'function'
      function: {
        name: string
      }
    }

export type OpenAIChatCompletionRequest = {
  model: string
  messages: OpenAIChatMessage[]
  stream?: boolean
  temperature?: number
  max_tokens?: number
  top_p?: number
  stop?: string | string[]
  tools?: OpenAIChatToolDefinition[]
  tool_choice?: OpenAIChatToolChoice
}

export type OpenAIChatCompletionChoice = {
  index: number
  message: {
    role: OpenAIChatRole
    content: string | null
    tool_calls?: OpenAIToolCall[]
  }
  finish_reason: string | null
}

export type OpenAIChatCompletionChunkChoiceDelta = {
  role?: OpenAIChatRole
  content?: string | null
  tool_calls?: Array<{
    index: number
    id?: string
    type: 'function'
    function?: {
      name?: string
      arguments?: string
    }
  }>
}

export type OpenAIChatCompletionChunkChoice = {
  index: number
  delta: OpenAIChatCompletionChunkChoiceDelta
  finish_reason: string | null
}

export type OpenAIChatCompletionChunk = {
  id: string
  object: 'chat.completion.chunk'
  created: number
  model: string
  choices: OpenAIChatCompletionChunkChoice[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

export type OpenAIChatCompletionResponse = {
  id: string
  object: 'chat.completion'
  created: number
  model: string
  choices: OpenAIChatCompletionChoice[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

export type AnthropicCompatibleTextBlock = {
  type: 'text'
  text: string
}

export type AnthropicCompatibleImageBlock = {
  type: 'image'
  source:
    | {
        type: 'base64'
        media_type: string
        data: string
      }
    | {
        type: 'url'
        url: string
      }
}

export type AnthropicCompatibleToolUseBlock = {
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}

export type AnthropicCompatibleToolResultBlock = {
  type: 'tool_result'
  tool_use_id: string
  content: string | unknown[]
  is_error?: boolean
}

export type AnthropicCompatibleContentBlock =
  | AnthropicCompatibleTextBlock
  | AnthropicCompatibleImageBlock
  | AnthropicCompatibleToolUseBlock
  | AnthropicCompatibleToolResultBlock
  | {
      type: string
      [key: string]: unknown
    }

export type AnthropicCompatibleMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string | AnthropicCompatibleContentBlock[]
  name?: string
}
