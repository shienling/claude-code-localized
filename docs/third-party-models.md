# 使用第三方模型（协议分流总览）

本项目现在有两条模型接入路径：

- **Anthropic-compatible 主路径**：继续沿用现有 Anthropic SDK，请求形状是 Anthropic Messages API。MiniMax、OpenRouter，以及通过 LiteLLM 暴露出 `/v1/messages` 的服务都走这条路。
- **OpenAI-compatible 独立路径**：Ark 以及其他只提供 `chat/completions` 的服务走独立适配器，不复用 `ANTHROPIC_*` 配置。

## 兼容性矩阵

| 路径 | 适用服务 | 需要的 env | 鉴权方式 | 流式 / tool call | 已知限制 |
|------|----------|-----------|----------|------------------|----------|
| Anthropic-compatible 主路径 | Anthropic 官方、MiniMax、OpenRouter、LiteLLM 转发后的服务 | `ANTHROPIC_*` | `x-api-key` 或 `Authorization: Bearer`，取决于具体服务 | 沿用现有 Anthropic 流式与工具调用管线 | 适合原生支持 Anthropic Messages API 的服务；如果目标服务只支持 OpenAI 协议，需要先做协议转换 |
| OpenAI-compatible 独立路径 | Ark，以及其他只提供 OpenAI Chat Completions 的服务 | `ARK_*` + `MODEL_PROTOCOL_FAMILY=openai-compatible` | `Authorization: Bearer` | 走独立 OpenAI-compatible 适配器，支持流式回退 | 不复用 `ANTHROPIC_*`，也不假设 Anthropic 专有参数存在 |

如果模型供应商原生支持 Anthropic Messages API，或者你已经通过 LiteLLM 把它转换成 Anthropic-compatible 端点，优先走主路径。
如果供应商只支持 OpenAI Chat Completions，就走 Ark 这条独立通道，或者复用同类 OpenAI-compatible 适配器。

## 原理

```
Anthropic-compatible 主路径:
claude-code-haha ──Anthropic协议──▶ LiteLLM Proxy ──OpenAI协议──▶ 目标模型 API
                                      (协议转换)

OpenAI-compatible 独立路径:
claude-code-haha ──OpenAI Chat Completions──▶ Ark / OpenAI-compatible API
```

主路径会发出 Anthropic Messages API 请求，LiteLLM 代理将其自动转换为 OpenAI Chat Completions API 格式并转发给目标模型。Ark 路径则直接使用 OpenAI-compatible 请求形状。

---

## 方式一：Anthropic-compatible 主路径（LiteLLM 代理）

[LiteLLM](https://github.com/BerriAI/litellm) 是一个支持 100+ LLM 的统一代理网关（41k+ GitHub Stars），原生支持接收 Anthropic 协议请求。

### 1. 安装 LiteLLM

```bash
pip install 'litellm[proxy]'
```

### 2. 创建配置文件

新建 `litellm_config.yaml`：

#### 使用 OpenAI 模型

```yaml
model_list:
  - model_name: gpt-4o
    litellm_params:
      model: openai/gpt-4o
      api_key: os.environ/OPENAI_API_KEY

litellm_settings:
  drop_params: true  # 丢弃 Anthropic 专有参数（thinking 等）
```

#### 使用 DeepSeek 模型

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

#### 使用 Ollama 本地模型

```yaml
model_list:
  - model_name: llama3
    litellm_params:
      model: ollama/llama3
      api_base: http://localhost:11434

litellm_settings:
  drop_params: true
```

#### 使用多个模型（可在启动后切换）

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

### 3. 启动代理

```bash
# 设置目标模型的 API Key
export OPENAI_API_KEY=sk-xxx
# 或
export DEEPSEEK_API_KEY=sk-xxx

# 启动代理
litellm --config litellm_config.yaml --port 4000
```

代理启动后会在 `http://localhost:4000` 监听，并暴露 Anthropic 兼容的 `/v1/messages` 端点。

### 4. 配置本项目

有两种配置方式，任选其一：

#### 方式 A：通过 `.env` 文件

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

#### 方式 B：通过 `~/.claude/settings.json`

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

> **说明**：`ANTHROPIC_AUTH_TOKEN` 的值在使用 LiteLLM 代理时可以是任意字符串（LiteLLM 会用自己配置的 key 转发），除非你在 LiteLLM 端设置了 `master_key` 校验。

### 5. 启动并验证

```bash
./bin/claude-haha
```

如果一切正常，你应该能看到正常的对话界面，实际调用的是你配置的目标模型。

---

## 方式二：直连兼容 Anthropic 协议的第三方服务

部分第三方服务直接兼容 Anthropic Messages API，无需额外代理：

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

### MiniMax（已在 .env.example 中配置）

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

### Ark / OpenAI-compatible（新的独立入口）

Ark 这类只兼容 OpenAI Chat Completions 的服务，不要复用 MiniMax 的 Anthropic-compatible 配置。
在登录界面里可以直接选择 `Ark`，然后填模型名和 API key。
如果你想在 `/model` 里手动配置其他 OpenAI-compatible 服务，也可以先选 `Others`，再依次填写 API 地址、模型名和 API key。

```env
ARK_API_KEY=your_ark_api_key
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_MODEL=doubao-seed-2-0-code-preview-260215
MODEL_PROTOCOL_FAMILY=openai-compatible
```

如果后续你接的是别的 OpenAI-compatible 服务，也建议走同一条独立通道，而不是塞回 `ANTHROPIC_*`。

---

## 方式三：其他代理工具

社区还有一些专门为 Claude Code 做的代理工具：

| 工具 | 说明 | 链接 |
|------|------|------|
| **a2o** | Anthropic → OpenAI 单二进制文件，零依赖 | [Twitter](https://x.com/mantou543/status/2018846154855940200) |
| **Empero Proxy** | 完整的 Anthropic Messages API 转 OpenAI 代理 | [Twitter](https://x.com/EmperoAI/status/2036840854065762551) |
| **Alma** | 内置 OpenAI → Anthropic 转换代理的客户端 | [Twitter](https://x.com/yetone/status/2003508782127833332) |
| **Chutes** | Docker 容器，支持 60+ 开源模型 | [Twitter](https://x.com/chutes_ai/status/2027039742915662232) |

---

## 注意事项与已知限制

### 1. `drop_params: true` 很重要

本项目会发送 Anthropic 专有参数（如 `thinking`、`cache_control`），这些参数在 OpenAI API 中不存在。LiteLLM 配置中必须设置 `drop_params: true`，否则请求会报错。

### 2. Extended Thinking 不可用

Anthropic 的 Extended Thinking 功能是专有特性，其他模型不支持。使用第三方模型时此功能自动失效。

### 3. Prompt Caching 不可用

`cache_control` 是 Anthropic 专有功能。使用第三方模型时，prompt caching 不会生效（但不会导致报错，会被 `drop_params` 忽略）。

### 4. 工具调用兼容性

本项目大量使用工具调用（tool_use），LiteLLM 会自动转换 Anthropic tool_use 格式到 OpenAI function_calling 格式。大部分情况下可以正常工作，但某些复杂工具调用可能存在兼容性问题。如遇问题，建议使用能力较强的模型（如 GPT-4o）。

### 5. 遥测和非必要网络请求

建议配置以下环境变量以避免不必要的网络请求：
```
DISABLE_TELEMETRY=1
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
```

---

## FAQ

### Q: LiteLLM 代理报错 `/v1/responses` 找不到？

部分 OpenAI 兼容服务只支持 `/v1/chat/completions`。在 LiteLLM 配置中添加：

```yaml
litellm_settings:
  use_chat_completions_url_for_anthropic_messages: true
```

### Q: `ANTHROPIC_API_KEY` 和 `ANTHROPIC_AUTH_TOKEN` 有什么区别？

- `ANTHROPIC_API_KEY` → 通过 `x-api-key` 请求头发送
- `ANTHROPIC_AUTH_TOKEN` → 通过 `Authorization: Bearer` 请求头发送

LiteLLM 代理默认接受 Bearer Token 格式，建议使用 `ANTHROPIC_AUTH_TOKEN`。

### Q: 可以同时配置多个模型吗？

可以。在 `litellm_config.yaml` 中配置多个 `model_name`，然后通过修改 `ANTHROPIC_MODEL` 切换。

### Q: 本地 Ollama 模型效果不好怎么办？

本项目的系统提示和工具调用对模型能力要求较高。建议使用参数量较大的模型（如 Llama 3 70B+, Qwen 72B+），小模型可能无法正确处理工具调用。
