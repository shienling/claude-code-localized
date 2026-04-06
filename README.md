# Claude Code Haha

<p align="right"><strong>中文</strong> | <a href="./README.en.md">English</a></p>

基于 Claude Code 泄露源码修复的**本地可运行版本**，支持三类互斥入口：`Claude`（原生 Anthropic）、`MiniMax`（Anthropic-compatible 第三方）、`Others` / `Ark`（OpenAI-compatible 自定义服务）。

> 原始泄露源码无法直接运行。本仓库修复了启动链路中的多个阻塞问题，使完整的 Ink TUI 交互界面可以在本地工作。

<p align="center">
  <img src="docs/00runtime.png" alt="运行截图" width="800">
</p>

## 目录

- [功能](#功能)
- [Beacon 交付流程](#beacon-交付流程)
- [架构概览](#架构概览)
- [快速开始](#快速开始)
- [环境变量说明](#环境变量说明)
- [降级模式](#降级模式)
- [Computer Use 桌面控制](#computer-use-桌面控制)
- [常见问题](#常见问题)
- [相对于原始泄露源码的修复](#相对于原始泄露源码的修复)
- [项目结构](#项目结构)
- [技术栈](#技术栈)

---

## 功能

- 完整的 Ink TUI 交互界面（与官方 Claude Code 一致）
- `--print` 无头模式（脚本/CI 场景）
- 支持 MCP 服务器、插件、Skills
- 支持自定义 API 端点和模型（[第三方模型使用指南](docs/third-party-models.md)）
- **Computer Use 桌面控制**（截屏、鼠标、键盘、应用管理）— [使用指南](docs/computer-use.md)
- **Beacon 交付流程**（需求澄清 → 方案设计 → 明确确认 → 并行开发 → 测试验收）
- 降级 Recovery CLI 模式

> **Computer Use 说明**：本项目包含**魔改版的 Computer Use** 功能。官方实现依赖 Anthropic 私有原生模块，我们替换了整个底层操作层，使用 Python bridge（`pyautogui` + `mss` + `pyobjc`）实现，使得任何人都可以在 macOS 上使用。详见 [Computer Use 功能指南](docs/computer-use.md)。

---

## Beacon 交付流程

Beacon 是一个结构化的六阶段交付循环，适合需要明确需求、风险边界和验收标准的功能开发。它集成了 **OpenSpec**（文档规范）、**Superpowers**（行为纪律）和 **Oh-My-Agent**（角色协作）三大系统，并加入了独立的安全威胁建模与 QA 三道门验收。

```bash
# 启动 Beacon 流程
claude
> /beacon 实现一个用户登录功能

# 或指定已有的 文档/链接
> /beacon docs.md

# 也可以直接贴超长需求文档
> /beacon # 个人记账应用
```

### 六阶段流程

| 阶段 | 状态 | 说明 |
|------|------|------|
| **需求补全** | `clarifying` | 主动追问，澄清需求细节 |
| **方案设计** | `awaiting_approval` | 生成 OpenSpec 文档，等待确认 |
| **明确确认** | - | 用户必须明确说「开始开发」 |
| **开发协调** | `coordinating` | PM 规划任务，协调并行工作 |
| **并行开发** | `implementing` | 前端/后端并行实施 |
| **测试验收** | `verifying` | QA 验证，输出验收报告 |
| **完成收口** | `completed` | 保留最终证据，不再继续改写 |

### 确认门禁

实施阶段仅在用户**明确确认**后开始：

```
开始开发 / 确认开始 / 开始 / 继续开发
```

> ⚠️ **Superpowers 纪律**：AI 禁止直接跳到编码，必须经过澄清和确认流程。

### OpenSpec 文档体系

Beacon 会在 `openspec/changes/<change-id>/` 下生成标准文档。为了兼容超长需求输入，`<change-id>` 使用短目录名 + 短 hash，不会把整段需求文本拼进路径里。

| 文件 | 用途 |
|------|------|
| `overview.md` | 总览 + 执行状态追踪 |
| `proposal.md` | 需求提案（Summary, Scope, Dependencies） |
| `design.md` | 技术设计（Architecture, API Changes） |
| `tasks.md` | 任务分解（Task List, Dependencies） |
| `frontend/proposal.md` | 前端方案（UI 范围、验证行为） |
| `backend/proposal.md` | 后端方案（API 形状、数据变更） |
| `review/architecture-review.md` | 架构审查（可行性、耦合、边界） |
| `review/backend-audit.md` | 后端审查（API、数据、并发、恢复） |
| `review/security-threat-model.md` | 安全威胁建模（攻击面、信任边界） |
| `review/security-audit.md` | 安全审查（认证、授权、滥用防护） |
| `review/risk-register.md` | 风险登记（blocker / warning / note） |
| `review/backend-question-bank.md` | 后端问答库（并发、幂等、恢复等） |
| `review/security-question-bank.md` | 安全问答库（登录、会话、重放等） |
| `qa/proposal.md` | 测试方案（测试覆盖、验收清单） |
| `qa/acceptance.md` | 验收报告（Tests Run, Verified, Unverified） |

### 执行状态标记

`overview.md` 中的状态流转：

```yaml
clarification_gate: pending → ready     # 需求澄清完成
coordination_brief: pending → ready     # PM 规划完成
review_status: pending → in_progress → completed     # 架构/后端审查完成
security_status: pending → in_progress → completed   # 安全审查完成
frontend_handoff: pending → ready       # 前端交付完成
backend_handoff: pending → ready        # 后端交付完成
qa_status: pending → in_progress → completed  # QA 验收完成
```

### 角色协作（Oh-My-Agent）

| 角色 | 职责 |
|------|------|
| **pm/planner** | 确认依赖顺序、并行性、完成定义 |
| **architecture-reviewer** | 审查架构可行性、隐藏耦合、范围边界 |
| **backend-auditor** | 审查后端契约、并发、恢复、性能风险 |
| **security-threat-modeler** | 建模攻击面、信任边界、滥用场景 |
| **security-auditor** | 审查认证、授权、会话、滥用防护 |
| **senior-reviewer** | 汇总 review 结论，输出 blocker / warning / note |
| **frontend** | UI、表单行为、验证、用户流程 |
| **backend** | API、数据变更、验证逻辑 |
| **qa** | 验证行为、运行测试、记录结果 |

### Superpowers 行为纪律

每个阶段强制注入的行为约束：

| 阶段 | 强制行为 |
|------|----------|
| **clarifying** | `brainstorming` - 必须主动追问，解决歧义 |
| **awaiting_approval** | `writing-plans` - 禁止直接编码，必须等待确认 |
| **coordinating** | `subagent-driven-development` - 规划并行任务 |
| **implementing** | `test-driven-development` - TDD，委托给角色工作器 |
| **verifying** | `verification-before-completion` - 必须有验证证据，且通过三道门 |
| **completed** | 保留最终证据，不可静默扩展 |

### 关键运行规则

- `change-id` 只保留短目录名 + 短 hash，长需求全文只进入文档内容，不进入路径。
- 每个可写文件只能有一个 owner，禁止多个 worker 同时写同一个 `proposal.md` / `review/*.md` / `acceptance.md`。
- `frontend` 和 `backend` 默认同 turn 并行派发，主线程不能先等一个再发另一个。
- `qa` 必须同时完成三道门：构建通过、API smoke test 通过、页面级契约检查通过。
- review 如果发现 blocker，会回流到对应 owner 修改 md，而不是强行进入开发。

### 完整流程图

```
/beacon 实现用户登录功能
         │
         ▼
┌─────────────────────────────────────────┐
│ Phase 1: 需求补全 (clarifying)           │
│ • 主动追问：登录方式？第三方登录？验证码？  │
│ • 更新 proposal.md, design.md, tasks.md  │
│ • Superpowers: brainstorming             │
└─────────────────────────────────────────┘
         │ 用户回答完毕
         ▼
┌─────────────────────────────────────────┐
│ Phase 2: 方案设计 (awaiting_approval)    │
│ • 确保 proposal/design/tasks 全部填实    │
│ • 总结最终范围，询问是否开始开发          │
│ • ⚠️ 禁止直接编码！                       │
└─────────────────────────────────────────┘
         │ 用户说 "开始开发"
         ▼
┌─────────────────────────────────────────┐
│ Phase 3: 开发协调 (coordinating)         │
│ • pm/planner 生成执行简报                │
│ • 规划前端/后端并行任务                   │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ Phase 4: 并行开发 (implementing)         │
│ • frontend + backend 同 turn 派发        │
│ • 主线程先发两个 Task，再等待结果        │
│ • Superpowers: test-driven-development   │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ Phase 5: 测试验收 (verifying)            │
│ • QA 验证行为，更新 acceptance.md        │
│ • 三道门：build / API smoke / page contract
│ • Superpowers: verification-before-completion │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ Phase 6: 完成收口 (completed)            │
│ • 输出验收报告                           │
│ • Tests Run / Verified / Unverified      │
└─────────────────────────────────────────┘
```

### 三大系统详解

#### OpenSpec - 文档规范系统

**核心定位**："Agree before you build" — 在编写代码之前，让人与 AI 对需求达成共识。

**设计哲学**：

```text
→ fluid not rigid          # 灵活而非僵化
→ iterative not waterfall  # 迭代而非瀑布
→ easy not complex         # 简单而非复杂
→ built for brownfield     # 适用于存量项目
```

**核心职责**：定义"写什么" — 需求提案、技术设计、任务分解、状态追踪。

#### Superpowers - 行为纪律系统

**核心定位**："Mandatory workflows, not suggestions" — 强制性的工作流程，而非建议。

**核心哲学**：

| 原则 | 说明 |
|------|------|
| **Test-Driven Development** | 永远先写测试 |
| **Systematic over ad-hoc** | 流程优于猜测 |
| **Complexity reduction** | 简单性是首要目标 |
| **Evidence over claims** | 验证后再声明成功 |

**核心技能**：

| 技能 | 触发时机 | 作用 |
|------|----------|------|
| `brainstorming` | 编码前 | 苏格拉底式提问，澄清需求 |
| `writing-plans` | 设计确认后 | 生成详细实施计划 |
| `subagent-driven-development` | 计划确认后 | 派发子代理执行 |
| `test-driven-development` | 实施时 | RED-GREEN-REFACTOR 循环 |
| `verification-before-completion` | 完成前 | 必须有验证证据 |

**核心职责**：定义"怎么写" — 必须澄清、禁止跳过、TDD 循环、验证证据。

#### Oh-My-Agent - 角色协作系统

**核心定位**："Your Agent Team" — 像真实工程团队一样分工协作。

**架构**：

```
Workflows (/plan /coordinate /orchestrate /review /debug)
         ↓
Orchestration (oma-pm ←→ oma-orchestrator)
         ↓
Domain Agents (frontend / backend / db / mobile / design)
         ↓
Quality (oma-qa / oma-debug)
```

**核心职责**：定义"谁来写" — PM 规划、前端实现、后端实现、QA 验收。

#### 三大系统协作关系

```
┌────────────────────────────────────────────────────────────────┐
│                         Beacon 流程                             │
│                    (唯一用户入口)                               │
└───────────────────────────┬────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            ↓               ↓               ↓
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │   OpenSpec   │ │ Superpowers  │ │ Oh-My-Agent  │
    │   文档规范    │ │   行为纪律    │ │   角色协作    │
    └──────────────┘ └──────────────┘ └──────────────┘
            │               │               │
            ↓               ↓               ↓
      定义"写什么"     定义"怎么写"     定义"谁来写"
```

---

## 架构概览

<table>
  <tr>
    <td align="center" width="25%"><img src="docs/01-overall-architecture.png" alt="整体架构"><br><b>整体架构</b></td>
    <td align="center" width="25%"><img src="docs/02-request-lifecycle.png" alt="请求生命周期"><br><b>请求生命周期</b></td>
    <td align="center" width="25%"><img src="docs/03-tool-system.png" alt="工具系统"><br><b>工具系统</b></td>
    <td align="center" width="25%"><img src="docs/04-multi-agent.png" alt="多 Agent 架构"><br><b>多 Agent 架构</b></td>
  </tr>
  <tr>
    <td align="center" width="25%"><img src="docs/05-terminal-ui.png" alt="终端 UI"><br><b>终端 UI</b></td>
    <td align="center" width="25%"><img src="docs/06-permission-security.png" alt="权限与安全"><br><b>权限与安全</b></td>
    <td align="center" width="25%"><img src="docs/07-services-layer.png" alt="服务层"><br><b>服务层</b></td>
    <td align="center" width="25%"><img src="docs/08-state-data-flow.png" alt="状态与数据流"><br><b>状态与数据流</b></td>
  </tr>
</table>

---

## 快速开始

#### 全局安装（推荐）

运行安装脚本后，可以在任意目录使用 `claude` 命令：

```bash
# 运行安装脚本
./install.sh

# 安装完成后，在任意目录启动
claude

# 查看帮助
claude --help
```

安装脚本会：
1. 检查 Bun 是否安装
2. 安装项目依赖
3. 创建全局 `claude` 命令链接

> **卸载**：运行 `./uninstall.sh` 即可移除全局命令。

#### 项目目录启动方式运行

### 1. 安装 Bun

本项目运行依赖 [Bun](https://bun.sh)。如果你的电脑还没有安装 Bun，可以先执行下面任一方式：

```bash
# macOS / Linux（官方安装脚本）
curl -fsSL https://bun.sh/install | bash
```

如果在精简版 Linux 环境里提示 `unzip is required to install bun`，先安装 `unzip`：

```bash
# Ubuntu / Debian
apt update && apt install -y unzip
```

```bash
# macOS（Homebrew）
brew install bun
```

```powershell
# Windows（PowerShell）
powershell -c "irm bun.sh/install.ps1 | iex"
```

安装完成后，重新打开终端并确认：

```bash
bun --version
```

### 2. 安装项目依赖

```bash
bun install
```

### 3. 配置环境变量

复制示例文件并填入你的 API Key：

```bash
cp .env.example .env
```

编辑 `.env`（以下示例使用 [MiniMax](https://platform.minimaxi.com/subscribe/token-plan?code=1TG2Cseab2&source=link) 作为 API 提供商，也可替换为其他 Anthropic-compatible 服务）：

```env
# API 认证（二选一）
ANTHROPIC_API_KEY=sk-xxx          # 标准 API Key（x-api-key 头）
ANTHROPIC_AUTH_TOKEN=sk-xxx       # Bearer Token（Authorization 头）

# API 端点（可选，默认 Anthropic 官方）
ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic

# 模型配置
ANTHROPIC_MODEL=MiniMax-M2.7-highspeed
ANTHROPIC_DEFAULT_SONNET_MODEL=MiniMax-M2.7-highspeed
ANTHROPIC_DEFAULT_HAIKU_MODEL=MiniMax-M2.7-highspeed
ANTHROPIC_DEFAULT_OPUS_MODEL=MiniMax-M2.7-highspeed

# 超时（毫秒）
API_TIMEOUT_MS=3000000

# 禁用遥测和非必要网络请求
DISABLE_TELEMETRY=1
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
```

> **提示**：除了 `.env` 文件，你也可以通过 `~/.claude/settings.json` 的 `env` 字段配置环境变量。这与官方 Claude Code 的配置方式一致：
>
> ```json
> {
>   "env": {
>     "ANTHROPIC_AUTH_TOKEN": "sk-xxx",
>     "ANTHROPIC_BASE_URL": "https://api.minimaxi.com/anthropic",
>     "ANTHROPIC_MODEL": "MiniMax-M2.7-highspeed"
>   }
> }
> ```
>
> 配置优先级：环境变量 > `.env` 文件 > `~/.claude/settings.json`

> **Ark 提示**：如果你要使用 Ark，请走登录界面的 `Ark` 入口，或者在环境变量里使用 `ARK_*` / `OPENAI_COMPATIBLE_*` / `MODEL_PROVIDER_KIND=openai-compatible`，不要复用 `ANTHROPIC_*`。

### 4. 启动

#### macOS / Linux

```bash
# 交互 TUI 模式（完整界面）
./bin/claude-haha

# 无头模式（单次问答）
./bin/claude-haha -p "your prompt here"

# 管道输入
echo "explain this code" | ./bin/claude-haha -p

# 查看所有选项
./bin/claude-haha --help
```

#### Windows

> **前置要求**：必须安装 [Git for Windows](https://git-scm.com/download/win)（提供 Git Bash，项目内部 Shell 执行依赖它）。

Windows 下启动脚本 `bin/claude-haha` 是 bash 脚本，无法在 cmd / PowerShell 中直接运行。请使用以下方式：

**方式一：PowerShell / cmd 直接调用 Bun（推荐）**

```powershell
# 交互 TUI 模式
bun --env-file=.env ./src/entrypoints/cli.tsx

# 无头模式
bun --env-file=.env ./src/entrypoints/cli.tsx -p "your prompt here"

# 降级 Recovery CLI
bun --env-file=.env ./src/localRecoveryCli.ts
```

**方式二：Git Bash 中运行**

```bash
# 在 Git Bash 终端中，与 macOS/Linux 用法一致
./bin/claude-haha
```

> **注意**：部分功能（语音输入、Computer Use、Sandbox 隔离等）在 Windows 上不可用，不影响核心 TUI 交互。

---

## 环境变量说明

| 变量 | 必填 | 说明 |
|------|------|------|
| `ANTHROPIC_API_KEY` | 二选一 | API Key，通过 `x-api-key` 头发送 |
| `ANTHROPIC_AUTH_TOKEN` | 二选一 | Auth Token，通过 `Authorization: Bearer` 头发送 |
| `ANTHROPIC_BASE_URL` | 否 | 自定义 API 端点，默认 Anthropic 官方 |
| `ANTHROPIC_MODEL` | 否 | 默认模型 |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | 否 | Sonnet 级别模型映射 |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | 否 | Haiku 级别模型映射 |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | 否 | Opus 级别模型映射 |
| `API_TIMEOUT_MS` | 否 | API 请求超时，默认 600000 (10min) |
| `DISABLE_TELEMETRY` | 否 | 设为 `1` 禁用遥测 |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | 否 | 设为 `1` 禁用非必要网络请求 |

---

## 降级模式

如果完整 TUI 出现问题，可以使用简化版 readline 交互模式：

```bash
CLAUDE_CODE_FORCE_RECOVERY_CLI=1 ./bin/claude-haha
```

如果你想在保留核心对话与编码能力的前提下进一步收敛功能面，可以使用精简模式：

```bash
./bin/claude-haha --slim
```

`--slim` 会跳过插件、技能、工作流这类扩展命令发现，同时收窄内置工具与命令暴露面，更适合本地轻量运行和后续做裁剪版发行。

---

## Computer Use 桌面控制

本项目启用并改造了 Claude Code 的 Computer Use 功能（内部代号 "Chicago"），让 AI 模型可以直接控制你的 macOS 桌面——截屏、鼠标点击、键盘输入、应用管理。

**底层改造**：官方实现依赖 Anthropic 私有原生模块（`@ant/computer-use-swift`、`@ant/computer-use-input`），本项目用 Python bridge 完全替代，使用 `pyautogui`（鼠标键盘）、`mss`（截图）、`pyobjc`（macOS API），无需任何闭源二进制。

```bash
# 确保有 Python 3 和 macOS 辅助功能/屏幕录制权限，然后直接使用：
./bin/claude-haha
> 帮我截个屏
> 打开网易云音乐搜索一首歌
```

详细说明、支持的设备列表、技术架构和尝试过的方案请参考：**[Computer Use 功能指南](docs/computer-use.md)**

---

## 相对于原始泄露源码的修复

泄露的源码无法直接运行，主要修复了以下问题：

| 问题 | 根因 | 修复 |
|------|------|------|
| TUI 不启动 | 入口脚本把无参数启动路由到了 recovery CLI | 恢复走 `cli.tsx` 完整入口 |
| 启动卡死 | `verify` skill 导入缺失的 `.md` 文件，Bun text loader 无限挂起 | 创建 stub `.md` 文件 |
| `--print` 卡死 | `filePersistence/types.ts` 缺失 | 创建类型桩文件 |
| `--print` 卡死 | `ultraplan/prompt.txt` 缺失 | 创建资源桩文件 |
| **Enter 键无响应** | `modifiers-napi` native 包缺失，`isModifierPressed()` 抛异常导致 `handleEnter` 中断，`onSubmit` 永远不执行 | 加 try-catch 容错 |
| setup 被跳过 | `preload.ts` 自动设置 `LOCAL_RECOVERY=1` 跳过全部初始化 | 移除默认设置 |

---

## 项目结构

```
bin/claude-haha          # 入口脚本
preload.ts               # Bun preload（设置 MACRO 全局变量）
.env.example             # 环境变量模板
src/
├── entrypoints/cli.tsx  # CLI 主入口
├── main.tsx             # TUI 主逻辑（Commander.js + React/Ink）
├── localRecoveryCli.ts  # 降级 Recovery CLI
├── setup.ts             # 启动初始化
├── screens/REPL.tsx     # 交互 REPL 界面
├── ink/                 # Ink 终端渲染引擎
├── components/          # UI 组件
├── tools/               # Agent 工具（Bash, Edit, Grep 等）
├── commands/            # 斜杠命令（/commit, /review 等）
├── skills/              # Skill 系统
├── services/            # 服务层（API, MCP, OAuth 等）
├── hooks/               # React hooks
└── utils/               # 工具函数
```

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 运行时 | [Bun](https://bun.sh) |
| 语言 | TypeScript |
| 终端 UI | React + [Ink](https://github.com/vadimdemedes/ink) |
| CLI 解析 | Commander.js |
| API | Anthropic SDK / OpenAI-compatible adapter |
| 协议 | MCP, LSP |

---

## 常见问题

### Q: `undefined is not an object (evaluating 'usage.input_tokens')`

**原因**：你把 `ANTHROPIC_BASE_URL` 指向了一个不兼容 Anthropic Messages API 的端点，或者把 OpenAI-compatible 服务误接到了 Anthropic 主路径上。

本项目的主请求路径使用 **Anthropic Messages API 协议**，`ANTHROPIC_BASE_URL` 必须指向一个兼容 Anthropic `/v1/messages` 接口的端点。Anthropic SDK 会自动在 base URL 后面拼接 `/v1/messages`，所以：

- MiniMax：`ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic` ✅
- Ark：使用登录界面的 `Ark` 入口，走 OpenAI-compatible 通道 ✅
- OpenRouter：`ANTHROPIC_BASE_URL=https://openrouter.ai/api` ✅
- OpenRouter 错误写法：`ANTHROPIC_BASE_URL=https://openrouter.ai/anthropic` ❌（返回 HTML）

如果你的模型供应商只支持 OpenAI 协议，需要通过 LiteLLM 等代理做协议转换，详见 [第三方模型使用指南](docs/third-party-models.md)。

### Q: `Cannot find package 'bundle'`

```
error: Cannot find package 'bundle' from '.../claude-code-haha/src/entrypoints/cli.tsx'
```

**原因**：Bun 版本过低，不支持项目所需的 `bun:bundle` 等内置模块。

**解决**：升级 Bun 到最新版本：

```bash
bun upgrade
```

### Q: 怎么接入 OpenAI / DeepSeek / Ollama 等非 Anthropic 模型？

如果供应商原生支持 Anthropic-compatible 协议，可以继续走主路径；如果只支持 OpenAI-compatible，请使用登录界面的 `Ark` 入口或同类 OpenAI-compatible 适配器。

如果你更希望把 OpenAI / DeepSeek / Ollama 等模型统一接到主路径上，也可以用 [LiteLLM](https://github.com/BerriAI/litellm) 等代理做协议转换（OpenAI → Anthropic）。

详细配置步骤请参考：[第三方模型使用指南](docs/third-party-models.md)

---

## Disclaimer

本仓库基于 2026-03-31 从 Anthropic npm registry 泄露的 Claude Code 源码。所有原始源码版权归 [Anthropic](https://www.anthropic.com) 所有。仅供学习和研究用途。
