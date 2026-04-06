export type OpenAICompatibleErrorKind =
  | 'network'
  | 'http'
  | 'empty-response'

export class OpenAICompatibleRequestError extends Error {
  readonly kind: OpenAICompatibleErrorKind
  readonly status?: number
  readonly responseText?: string
  readonly requestURL: string

  constructor(params: {
    kind: OpenAICompatibleErrorKind
    requestURL: string
    message: string
    status?: number
    responseText?: string
    cause?: unknown
  }) {
    super(params.message, params.cause !== undefined ? { cause: params.cause } : undefined)
    this.name = 'OpenAICompatibleRequestError'
    this.kind = params.kind
    this.requestURL = params.requestURL
    this.status = params.status
    this.responseText = params.responseText
  }
}

function compactWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function summarizeResponseText(text: string, limit = 240): string {
  const compact = compactWhitespace(text)
  if (compact.length <= limit) return compact
  return `${compact.slice(0, limit - 1)}…`
}

export function formatOpenAICompatibleError(error: unknown): string {
  if (!(error instanceof OpenAICompatibleRequestError)) {
    return error instanceof Error ? error.message : String(error)
  }

  if (error.kind === 'network') {
    return `Unable to connect to API at ${error.requestURL}. Check the API address, network, proxy, and TLS certificates.`
  }

  if (error.kind === 'empty-response') {
    return `API at ${error.requestURL} returned no response body. Check whether the endpoint supports chat/completions streaming.`
  }

  const status = error.status ?? 0
  const body = error.responseText ? summarizeResponseText(error.responseText) : ''

  if (status === 401) {
    return `Unauthorized (401) from API at ${error.requestURL}. Check the API key.${body ? ` ${body}` : ''}`
  }
  if (status === 403) {
    return `Forbidden (403) from API at ${error.requestURL}. The API key does not have permission for this model or endpoint.${body ? ` ${body}` : ''}`
  }
  if (status === 404) {
    return `Not found (404) from API at ${error.requestURL}. Check the API address and path.${body ? ` ${body}` : ''}`
  }
  if (status === 429) {
    return `Rate limited (429) by API at ${error.requestURL}. Try again later or check quota.${body ? ` ${body}` : ''}`
  }
  if (status >= 500) {
    return `Server error (${status}) from API at ${error.requestURL}.${body ? ` ${body}` : ''}`
  }

  return `API request failed (${status}) at ${error.requestURL}.${body ? ` ${body}` : ''}`
}
