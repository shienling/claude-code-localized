# Using Third-Party Models (Protocol Routing Overview)

This project now has two model access paths:

- **Anthropic-compatible main path**: keeps using the existing Anthropic SDK and Anthropic Messages API request shape. MiniMax, OpenRouter, and any service exposed through LiteLLM as `/v1/messages` use this path.
- **OpenAI-compatible separate path**: Ark and other services that only expose `chat/completions` use an independent adapter and do not reuse `ANTHROPIC_*` settings.

## Compatibility Matrix

| Path | Typical services | Required env | Auth | Streaming / tool calls | Known limits |
|------|------------------|--------------|------|-------------------------|--------------|
| Anthropic-compatible main path | Anthropic, MiniMax, OpenRouter, LiteLLM-forwarded services | `ANTHROPIC_*` | `x-api-key` or `Authorization: Bearer`, depending on the service | Uses the existing Anthropic streaming and tool-call pipeline | Best for services that natively support Anthropic Messages API; if the service only supports OpenAI, you need protocol translation first |
| OpenAI-compatible separate path | Ark and other services that only expose OpenAI Chat Completions | `ARK_*` + `MODEL_PROTOCOL_FAMILY=openai-compatible` | `Authorization: Bearer` | Uses the independent OpenAI-compatible adapter, with streaming fallback | Does not reuse `ANTHROPIC_*`, and does not assume Anthropic-specific params exist |

If your provider natively supports Anthropic Messages API, or you already translated it into an Anthropic-compatible endpoint via LiteLLM, prefer the main path.
If your provider only supports OpenAI Chat Completions, use the Ark path or another OpenAI-compatible adapter.

## How It Works

```
Anthropic-compatible main path:
claude-code-haha ──Anthropic protocol──▶ LiteLLM Proxy ──OpenAI protocol──▶ Target Model API
                                          (translation)

OpenAI-compatible separate path:
claude-code-haha ──OpenAI Chat Completions──▶ Ark / OpenAI-compatible API
```

The main path sends Anthropic Messages API requests. The LiteLLM proxy automatically translates them to OpenAI Chat Completions API format and forwards them to the target model. The Ark path uses OpenAI-compatible request shapes directly.

---

## Option 1: Anthropic-compatible Main Path (LiteLLM Proxy)

[LiteLLM](https://github.com/BerriAI/litellm) is a unified proxy gateway supporting 100+ LLMs (41k+ GitHub Stars), with native support for receiving Anthropic protocol requests.

### 1. Install LiteLLM

```bash
pip install 'litellm[proxy]'
```

### 2. Create Configuration File

Create `litellm_config.yaml`:

#### Using OpenAI Models

```yaml
model_list:
  - model_name: gpt-4o
    litellm_params:
      model: openai/gpt-4o
      api_key: os.environ/OPENAI_API_KEY

litellm_settings:
  drop_params: true  # Drop Anthropic-specific params (thinking, etc.)
```

#### Using DeepSeek Models

```yaml
model_list:
  - model_name: deepseek-chat
    litellm_params:
      model: deepseek/deepseek-chat
      api_key: os.environ/DEEPSEEK_API_KEY
      api_base: https://api.deepseek.com

litellm_settings:
  drop_params: true
```

#### Using Ollama Local Models

```yaml
model_list:
  - model_name: llama3
    litellm_params:
      model: ollama/llama3
      api_base: http://localhost:11434

litellm_settings:
  drop_params: true
```

#### Using Multiple Models (switchable after startup)

```yaml
model_list:
  - model_name: gpt-4o
    litellm_params:
      model: openai/gpt-4o
      api_key: os.environ/OPENAI_API_KEY

  - model_name: deepseek-chat
    litellm_params:
      model: deepseek/deepseek-chat
      api_key: os.environ/DEEPSEEK_API_KEY
      api_base: https://api.deepseek.com

  - model_name: llama3
    litellm_params:
      model: ollama/llama3
      api_base: http://localhost:11434

litellm_settings:
  drop_params: true
```

### 3. Start the Proxy

```bash
# Set your target model's API key
export OPENAI_API_KEY=sk-xxx
# or
export DEEPSEEK_API_KEY=sk-xxx

# Start the proxy
litellm --config litellm_config.yaml --port 4000
```

The proxy will listen on `http://localhost:4000` and expose an Anthropic-compatible `/v1/messages` endpoint.

### 4. Configure This Project

Choose one of two configuration methods:

#### Method A: Via `.env` File

```env
ANTHROPIC_AUTH_TOKEN=sk-anything
ANTHROPIC_BASE_URL=http://localhost:4000
ANTHROPIC_MODEL=gpt-4o
ANTHROPIC_DEFAULT_SONNET_MODEL=gpt-4o
ANTHROPIC_DEFAULT_HAIKU_MODEL=gpt-4o
ANTHROPIC_DEFAULT_OPUS_MODEL=gpt-4o
API_TIMEOUT_MS=3000000
DISABLE_TELEMETRY=1
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
```

#### Method B: Via `~/.claude/settings.json`

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "sk-anything",
    "ANTHROPIC_BASE_URL": "http://localhost:4000",
    "ANTHROPIC_MODEL": "gpt-4o",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "gpt-4o",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "gpt-4o",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "gpt-4o",
    "API_TIMEOUT_MS": "3000000",
    "DISABLE_TELEMETRY": "1",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  }
}
```

> **Note**: The `ANTHROPIC_AUTH_TOKEN` value can be any string when using the LiteLLM proxy (LiteLLM uses its own configured key for forwarding), unless you've set a `master_key` on the LiteLLM side.

### 5. Start and Verify

```bash
./bin/claude-haha
```

If everything is configured correctly, you should see the normal chat interface, with your configured target model handling the requests.

---

## Option 2: Direct Connection to Anthropic-Compatible Services

Some third-party services directly support the Anthropic Messages API, no proxy needed:

### OpenRouter

```env
ANTHROPIC_AUTH_TOKEN=sk-or-v1-xxx
ANTHROPIC_BASE_URL=https://openrouter.ai/api/v1
ANTHROPIC_MODEL=openai/gpt-4o
ANTHROPIC_DEFAULT_SONNET_MODEL=openai/gpt-4o
ANTHROPIC_DEFAULT_HAIKU_MODEL=openai/gpt-4o-mini
ANTHROPIC_DEFAULT_OPUS_MODEL=openai/gpt-4o
DISABLE_TELEMETRY=1
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
```

### MiniMax (pre-configured in .env.example)

```env
ANTHROPIC_AUTH_TOKEN=your_token_here
ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic
ANTHROPIC_MODEL=MiniMax-M2.7-highspeed
ANTHROPIC_DEFAULT_SONNET_MODEL=MiniMax-M2.7-highspeed
ANTHROPIC_DEFAULT_HAIKU_MODEL=MiniMax-M2.7-highspeed
ANTHROPIC_DEFAULT_OPUS_MODEL=MiniMax-M2.7-highspeed
API_TIMEOUT_MS=3000000
DISABLE_TELEMETRY=1
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
```

### Ark / OpenAI-compatible (separate entry)

Ark and other services that only support OpenAI Chat Completions should not reuse MiniMax's Anthropic-compatible configuration. In the login flow, choose `Ark`, then enter the model name and API key.
If you want to configure another OpenAI-compatible service from `/model`, choose `Others`, then enter the API address, model name, and API key.

```env
ARK_API_KEY=your_ark_api_key
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_MODEL=doubao-seed-2-0-code-preview-260215
MODEL_PROTOCOL_FAMILY=openai-compatible
```

If you add another OpenAI-compatible service later, it should follow the same separate path instead of being pushed back into `ANTHROPIC_*`.

---

## Option 3: Other Proxy Tools

The community has built several proxy tools specifically for Claude Code:

| Tool | Description | Link |
|------|-------------|------|
| **a2o** | Anthropic → OpenAI single binary, zero dependencies | [Twitter](https://x.com/mantou543/status/2018846154855940200) |
| **Empero Proxy** | Full Anthropic Messages API to OpenAI translation | [Twitter](https://x.com/EmperoAI/status/2036840854065762551) |
| **Alma** | Client with built-in OpenAI → Anthropic proxy | [Twitter](https://x.com/yetone/status/2003508782127833332) |
| **Chutes** | Docker container supporting 60+ open-source models | [Twitter](https://x.com/chutes_ai/status/2027039742915662232) |

---

## Known Limitations

### 1. `drop_params: true` Is Essential

This project sends Anthropic-specific parameters (e.g., `thinking`, `cache_control`) that don't exist in the OpenAI API. You must set `drop_params: true` in the LiteLLM config, otherwise requests will fail.

### 2. Extended Thinking Unavailable

Anthropic's Extended Thinking is a proprietary feature not supported by other models. It is automatically disabled when using third-party models.

### 3. Prompt Caching Unavailable

`cache_control` is an Anthropic-specific feature. Prompt caching won't work with third-party models (but won't cause errors — it's silently ignored by `drop_params`).

### 4. Tool Calling Compatibility

This project heavily uses tool calling (tool_use). LiteLLM automatically translates Anthropic's tool_use format to OpenAI's function_calling format. This works in most cases, but some complex tool calls may have compatibility issues. If you encounter problems, try using a more capable model (e.g., GPT-4o).

### 5. Telemetry and Non-Essential Requests

Configure these environment variables to avoid unnecessary network requests:
```
DISABLE_TELEMETRY=1
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
```

---

## FAQ

### Q: LiteLLM proxy returns `/v1/responses` not found?

Some OpenAI-compatible services only support `/v1/chat/completions`. Add this to your LiteLLM config:

```yaml
litellm_settings:
  use_chat_completions_url_for_anthropic_messages: true
```

### Q: What's the difference between `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN`?

- `ANTHROPIC_API_KEY` → Sent via `x-api-key` header
- `ANTHROPIC_AUTH_TOKEN` → Sent via `Authorization: Bearer` header

LiteLLM proxy accepts Bearer Token format by default, so `ANTHROPIC_AUTH_TOKEN` is recommended.

### Q: Can I configure multiple models?

Yes. Define multiple `model_name` entries in `litellm_config.yaml`, then switch by changing the `ANTHROPIC_MODEL` value.

### Q: Local Ollama models don't work well?

This project's system prompts and tool calls require strong model capabilities. Use larger models (e.g., Llama 3 70B+, Qwen 72B+). Smaller models may fail to handle tool calling correctly.
