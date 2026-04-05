import { readFile, writeFile } from 'fs/promises'

export type BeaconExecutionStatusKey =
  | 'coordination_brief'
  | 'review_status'
  | 'security_status'
  | 'frontend_handoff'
  | 'backend_handoff'
  | 'qa_status'

export type BeaconExecutionStatusValue =
  | 'pending'
  | 'ready'
  | 'in_progress'
  | 'completed'

export type BeaconClarificationGateValue = 'pending' | 'ready'

type ProposalKind = 'frontend' | 'backend' | 'qa'

export type BeaconWorkspaceDocs = {
  overview: string
  proposal: string
  design: string
  tasks: string
  reviewArchitecture: string
  reviewBackendAudit: string
  reviewRiskRegister: string
  reviewBackendQuestionBank: string
  reviewSecurityThreatModel: string
  reviewSecurityAudit: string
  reviewSecurityQuestionBank: string
  frontendProposal: string
  backendProposal: string
  qaProposal: string
  qaAcceptance: string
}

type BeaconWorkspaceDocPaths = {
  overviewPath: string
  proposalPath: string
  designPath: string
  tasksPath: string
  reviewArchitecturePath: string
  reviewBackendAuditPath: string
  reviewRiskRegisterPath: string
  reviewBackendQuestionBankPath: string
  reviewSecurityThreatModelPath: string
  reviewSecurityAuditPath: string
  reviewSecurityQuestionBankPath: string
  frontendProposalPath: string
  backendProposalPath: string
  qaProposalPath: string
  qaAcceptancePath: string
}

export function hasRequiredHeadings(
  content: string,
  headings: string[],
): boolean {
  return headings.every(heading =>
    new RegExp(
      `^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
      'm',
    ).test(content),
  )
}

export function containsPlaceholder(
  content: string,
  placeholders: string[],
): boolean {
  return placeholders.some(placeholder => content.includes(placeholder))
}

export function getExecutionStatusGuideBlock(): string {
  return (
    `## Execution Status Guide\n` +
    `- \`clarification_gate\`: use \`pending -> ready\` after Beacon has proactively asked follow-up questions and the user has answered or explicitly waived more clarification.\n` +
    `- \`coordination_brief\`: use \`pending -> ready\`\n` +
    `- \`review_status\`: use \`pending -> in_progress -> completed\` while the review track audits the architecture and backend stack before approval.\n` +
    `- \`security_status\`: use \`pending -> in_progress -> completed\` while the security track models threats and audits abuse resistance before approval.\n` +
    `- \`frontend_handoff\`: use \`pending -> ready\`\n` +
    `- \`backend_handoff\`: use \`pending -> ready\`\n` +
    `- \`qa_status\`: use \`pending -> in_progress -> completed\`\n` +
    `- Update these markers in \`overview.md\` as the single source of truth for Beacon execution progress.\n\n`
  )
}

export function getProposalGuideBlock(
  kind: ProposalKind,
): string {
  const line =
    kind === 'frontend'
      ? '- Replace placeholders with the approved user flow, screen/state coverage, validation behavior, API dependencies, edge cases, and acceptance notes.'
      : kind === 'backend'
        ? '- Replace placeholders with the approved API surface, request/response schemas, persistence plan, idempotency strategy, failure handling, observability notes, and rollout plan.'
        : '- Replace placeholders with concrete test scope, critical paths, regression risks, fixtures, automation coverage, and acceptance checklist items.'

  return (
    `## Completion Guide\n` +
    `- A proposal is ready only when every required section below contains concrete implementation details and no section is still a placeholder.\n` +
    `${line}\n` +
    `- Remove all placeholder text before Beacon asks for development approval.\n\n`
  )
}

function getProposalRequiredHeadings(kind: ProposalKind): string[] {
  if (kind === 'frontend') {
    return [
      'Objective',
      'User Flow',
      'Screens / States',
      'Validation Rules',
      'Data Mapping',
      'API Dependencies',
      'Edge Cases / Error States',
      'Accessibility / Performance',
      'Acceptance Notes',
      'Open Questions',
    ]
  }

  if (kind === 'backend') {
    return [
      'Objective',
      'API Surface',
      'Request Schema',
      'Response Schema',
      'Validation Rules',
      'Data Model / Persistence',
      'Migration / Compatibility',
      'Idempotency / Concurrency',
      'Cache / Queue / Async',
      'Error Codes / Failure Handling',
      'Logging / Metrics / Observability',
      'Rollout / Recovery',
      'Acceptance Notes',
      'Open Questions',
    ]
  }

  return [
    'Objective',
    'Test Scope',
    'Critical Paths',
    'Regression Risks',
    'Test Matrix',
    'Edge Cases',
    'Negative Paths',
    'Security Checks',
    'Test Data / Fixtures',
    'Automation Coverage',
    'Manual Verification',
    'Acceptance Checklist',
    'Open Questions',
  ]
}

export function getProposalTemplateBlock(kind: ProposalKind): string {
  if (kind === 'frontend') {
    return (
      `# Frontend Proposal\n\n` +
      `## Objective\nPending clarification\n\n` +
      `## User Flow\n- TBD\n\n` +
      `## Screens / States\n- TBD\n\n` +
      `## Validation Rules\n- TBD\n\n` +
      `## Data Mapping\n- TBD\n\n` +
      `## API Dependencies\n- TBD\n\n` +
      `## Edge Cases / Error States\n- TBD\n\n` +
      `## Accessibility / Performance\n- TBD\n\n` +
      `## Acceptance Notes\n- TBD\n\n` +
      `## Open Questions\n- TBD\n\n` +
      `${getProposalGuideBlock('frontend')}`
    )
  }

  if (kind === 'backend') {
    return (
      `# Backend Proposal\n\n` +
      `## Objective\nPending clarification\n\n` +
      `## API Surface\n- TBD\n\n` +
      `## Request Schema\n- TBD\n\n` +
      `## Response Schema\n- TBD\n\n` +
      `## Validation Rules\n- TBD\n\n` +
      `## Data Model / Persistence\n- TBD\n\n` +
      `## Migration / Compatibility\n- TBD\n\n` +
      `## Idempotency / Concurrency\n- TBD\n\n` +
      `## Cache / Queue / Async\n- TBD\n\n` +
      `## Error Codes / Failure Handling\n- TBD\n\n` +
      `## Logging / Metrics / Observability\n- TBD\n\n` +
      `## Rollout / Recovery\n- TBD\n\n` +
      `## Acceptance Notes\n- TBD\n\n` +
      `## Open Questions\n- TBD\n\n` +
      `${getProposalGuideBlock('backend')}`
    )
  }

  return (
    `# QA Proposal\n\n` +
    `## Objective\nPending clarification\n\n` +
    `## Test Scope\n- TBD\n\n` +
    `## Critical Paths\n- TBD\n\n` +
    `## Regression Risks\n- TBD\n\n` +
    `## Test Matrix\n- TBD\n\n` +
    `## Edge Cases\n- TBD\n\n` +
    `## Negative Paths\n- TBD\n\n` +
    `## Security Checks\n- TBD\n\n` +
    `## Test Data / Fixtures\n- TBD\n\n` +
    `## Automation Coverage\n- TBD\n\n` +
    `## Manual Verification\n- TBD\n\n` +
    `## Acceptance Checklist\n- TBD\n\n` +
    `## Open Questions\n- TBD\n\n` +
    `${getProposalGuideBlock('qa')}`
  )
}

export function getAcceptanceGuideBlock(): string {
  return (
    `## Closeout Guide\n` +
    `- Record only commands or checks that actually ran in \`Tests Run\`.\n` +
    `- Record only verified behavior in \`Verified\`.\n` +
    `- Record skipped, blocked, or risky areas in \`Unverified\`.\n` +
    `- Replace all placeholder text before Beacon marks QA closeout as complete.\n\n`
  )
}

export function getStandardArtifactGuideBlock(
  kind: 'proposal' | 'design' | 'tasks',
): string {
  if (kind === 'proposal') {
    return (
      `## Completion Guide\n` +
      `- Replace placeholders with the approved change summary, scope boundaries, risks, and affected artifacts.\n` +
      `- Keep this file aligned with the role-specific frontend/backend/qa proposals.\n` +
      `- Remove all placeholder text before Beacon asks for development approval.\n\n`
    )
  }

  if (kind === 'design') {
    return (
      `## Completion Guide\n` +
      `- Replace placeholders with the agreed technical approach for frontend, backend, QA, and any notable risks or open questions.\n` +
      `- Design is ready only when it is implementation-specific enough to guide pm/planner and workers.\n` +
      `- Remove all placeholder text before Beacon asks for development approval.\n\n`
    )
  }

  return (
    `## Completion Guide\n` +
    `- Replace placeholders with concrete implementation tasks and ownership notes.\n` +
    `- Keep task items actionable; do not leave placeholder checklist entries.\n` +
    `- Remove all placeholder text before Beacon asks for development approval.\n\n`
  )
}

export function getReviewGuideBlock(
  kind:
    | 'architecture-review'
    | 'backend-audit'
    | 'security-threat-model'
    | 'security-audit'
    | 'risk-register',
): string {
  const line =
    kind === 'architecture-review'
      ? '- Replace placeholders with a concrete architecture fit check, scope boundary review, implementation feasibility verdict, and edge-case callouts.'
      : kind === 'backend-audit'
        ? '- Replace placeholders with the proposed backend audit, contract sanity check, data-flow concerns, and runtime risks.'
        : kind === 'security-threat-model'
          ? '- Replace placeholders with the attack surface map, trust boundaries, abuse cases, mitigations, and detection notes.'
          : kind === 'security-audit'
            ? '- Replace placeholders with the security audit, auth/session review, abuse resistance checks, and blocker / warning / note callouts.'
        : '- Replace placeholders with a prioritized risk register, blockers, and required follow-ups.'

  return (
    `## Review Guide\n` +
    `- The review is ready only when the audit is concrete enough to support a go/no-go decision.\n` +
    `${line}\n` +
    `- To add more checks later, append a new section above \`Extensibility Notes\` rather than replacing the checklist.\n` +
    `- Remove all placeholder text before Beacon asks for development approval.\n\n`
  )
}

function getReviewRequiredHeadings(
  kind:
    | 'architecture-review'
    | 'backend-audit'
    | 'security-threat-model'
    | 'security-audit'
    | 'risk-register',
): string[] {
  if (kind === 'architecture-review') {
    return [
      'Executive Summary',
      'Requirements & Boundaries',
      'Architecture & Feasibility',
      'Data & State',
      'Interface & Contract',
      'Testability & Acceptance',
      'Maintainability & Product Consistency',
      'Decision',
      'Follow-ups',
      'Extensibility Notes',
    ]
  }

  if (kind === 'backend-audit') {
    return [
      'Executive Summary',
      'Security & Permissions',
      'Performance & Resources',
      'Reliability & Recovery',
      'Delivery & Operations',
      'Observability & Test Readiness',
      'Data Contract & Hot Path Risks',
      'Decision',
      'Follow-ups',
      'Extensibility Notes',
    ]
  }

  if (kind === 'security-threat-model') {
    return [
      'Executive Summary',
      'Assets & Trust Boundaries',
      'Attack Surface & Entry Points',
      'Abuse Cases',
      'Mitigations & Controls',
      'Detection & Response',
      'Open Questions',
      'Extensibility Notes',
    ]
  }

  if (kind === 'security-audit') {
    return [
      'Executive Summary',
      'Authentication & Session',
      'Authorization & Tenant Boundaries',
      'Input & Output Safety',
      'Abuse Resistance',
      'Frontend Tampering & Client Trust',
      'Logging & Secrets',
      'Rate Limiting & Bot Resistance',
      'Failure / Recovery / Monitoring',
      'Decision',
      'Follow-ups',
      'Extensibility Notes',
    ]
  }

  return ['Executive Summary', 'Findings', 'Decision', 'Follow-ups']
}

export function getReviewTemplateBlock(
  kind:
    | 'architecture-review'
    | 'backend-audit'
    | 'security-threat-model'
    | 'security-audit'
    | 'risk-register',
): string {
  if (kind === 'architecture-review') {
    return (
      `# Architecture Review\n\n` +
      `## Executive Summary\nPending clarification\n\n` +
      `## Requirements & Boundaries\n- 需求是否自洽\n- 有没有隐含前提没说明\n- 是否存在歧义字段、歧义流程、歧义状态\n- 是否明确“不做什么”\n- 是否有越界需求或顺手扩需求\n\n` +
      `## Architecture & Feasibility\n- 方案是否能在当前项目真实跑通\n- 是否过度设计\n- 是否拆得太细或太粗\n- 前后端/服务层/存储层职责是否清楚\n- 是否依赖当前项目里不存在的能力\n\n` +
      `## Data & State\n- 数据模型是否完整\n- 状态流转是否闭环\n- 是否有幂等性问题\n- 是否有并发写入、重复提交、脏数据风险\n- 是否有历史数据兼容和迁移方案\n\n` +
      `## Interface & Contract\n- 前后端接口是否对齐\n- 入参/出参/错误码是否定义清楚\n- 是否有版本兼容问题\n- 是否有分页、排序、过滤、空值、边界值约定\n- 是否有同步/异步接口混用风险\n\n` +
      `## Testability & Acceptance\n- 是否容易写测试\n- 是否有清晰的验收点\n- 是否有 mock / fixture / 测试数据策略\n- 哪些逻辑应该单测，哪些需要集成测\n- 哪些风险必须手工验收\n\n` +
      `## Maintainability & Product Consistency\n- 是否会引入难维护的抽象\n- 是否会把逻辑散到太多地方\n- 是否影响后续扩展\n- 是否会造成“改一个点，四五处都要改”\n- 页面表现、接口返回、文档描述是否一致\n\n` +
      `## Decision\n- TBD\n\n` +
      `## Follow-ups\n- TBD\n\n` +
      `## Extensibility Notes\nAdd new checklist sections above this block when the scope needs more review dimensions.\n\n` +
      `${getReviewGuideBlock('architecture-review')}`
    )
  }

  if (kind === 'backend-audit') {
    return (
      `# Backend Audit\n\n` +
      `## Executive Summary\nPending clarification\n\n` +
      `## Security & Permissions\n- 鉴权是否完整\n- 是否有越权读写\n- 是否存在敏感信息泄露\n- 输入校验是否充分\n- 是否有注入、CSRF、XSS、文件上传等常见风险\n- 日志里会不会打出敏感数据\n\n` +
      `## Performance & Resources\n- 是否有 N+1、全表扫、重复请求、过大 payload\n- 是否有长任务阻塞主流程\n- 是否有大文件、大列表、慢查询风险\n- 是否会造成前端渲染卡顿或内存压力\n- 是否需要缓存、分页、批处理、懒加载\n\n` +
      `## Reliability & Recovery\n- 失败时怎么降级\n- 有没有重试/回滚/补偿\n- 部分成功怎么处理\n- 网络抖动、超时、第三方服务挂了怎么办\n- 是否有超时、熔断、隔离的考虑\n\n` +
      `## Delivery & Operations\n- 是否需要配置、环境变量、feature flag\n- 是否需要 migration、回滚脚本\n- 是否需要文档更新\n- 是否需要监控、告警、日志埋点\n- 是否有部署顺序或依赖顺序\n\n` +
      `## Observability & Test Readiness\n- 是否能在日志/trace/指标里看出失败点\n- 是否足够定位是前端、后端还是数据层\n- 是否有单测 / 集成测 / 手工验收的清晰边界\n- 是否有 mock / fixture / 测试数据策略\n- 哪些失败路径必须被验证\n\n` +
      `## Data Contract & Hot Path Risks\n- 计数/热点/配额/速率限制是否需要 Redis 或其他缓存\n- 源数据是否明确，幂等与并发写入是否安全\n- API 字段、错误码、分页、版本兼容是否完整\n- 是否需要队列、事务、唯一约束、锁、补偿或 outbox\n- 是否有需要提前压测或灰度的路径\n\n` +
      `## Decision\n- TBD\n\n` +
      `## Follow-ups\n- TBD\n\n` +
      `## Extensibility Notes\nAdd new backend-specific checks above this block when the stack needs more scrutiny.\n\n` +
      `${getReviewGuideBlock('backend-audit')}`
    )
  }

  if (kind === 'security-threat-model') {
    return (
      `# Security Threat Model\n\n` +
      `## Executive Summary\nPending clarification\n\n` +
      `## Assets & Trust Boundaries\n- 用户数据、会话、token、管理能力、敏感操作\n- 哪些组件是可信的，哪些输入来自不可信来源\n- 哪些跨边界流量会改变权限、状态或资金/身份数据\n\n` +
      `## Attack Surface & Entry Points\n- 登录、注册、找回密码、退出登录、刷新会话\n- 前端路由、隐藏字段、URL 参数、API 直调、重复提交\n- 文件上传、回调地址、第三方跳转、Webhook、管理接口\n\n` +
      `## Abuse Cases\n- 暴力破解、撞库、验证码轰炸、账号枚举\n- CSRF、重放请求、会话劫持、固定会话\n- 参数篡改、绕过前端校验、越权读写、批量爬取\n\n` +
      `## Mitigations & Controls\n- 限流、锁定、验证码、统一错误提示\n- httpOnly / sameSite / secure cookie 策略\n- 后端校验、幂等、防重放、权限校验、最小权限\n\n` +
      `## Detection & Response\n- 日志、告警、审计记录、失败模式\n- 可疑行为检测、封禁策略、人工介入点\n- 发现攻击时怎么回滚 / 熔断 / 降级\n\n` +
      `## Open Questions\n- TBD\n\n` +
      `## Extensibility Notes\nAdd new threat categories above this block when the threat surface grows.\n\n` +
      `${getReviewGuideBlock('security-threat-model')}`
    )
  }

  if (kind === 'security-audit') {
    return (
      `# Security Audit\n\n` +
      `## Executive Summary\nPending clarification\n\n` +
      `## Authentication & Session\n- 登录凭证如何生成、传输、存储、过期、撤销\n- 是否能防暴力破解、账号枚举、会话固定、会话劫持\n- 是否能正确处理登录失败、退出登录、重放请求\n\n` +
      `## Authorization & Tenant Boundaries\n- 是否每个读写路径都做了授权\n- 是否存在越权读写、跨用户数据访问、跨租户访问\n- 是否存在管理接口被普通用户调用的风险\n\n` +
      `## Input & Output Safety\n- 输入校验是否后端兜底\n- 输出是否会泄露敏感信息、内部错误、栈、token、session\n- 是否有注入、XSS、CSRF、开放重定向、SSRF 等风险\n\n` +
      `## Abuse Resistance\n- 是否有频率限制、验证码、冷却时间、锁定策略\n- 是否能阻止机器人、批量注册、撞库、重复提交\n- 是否对可预测 ID、枚举接口、滥用接口做了防护\n\n` +
      `## Frontend Tampering & Client Trust\n- 前端校验是否只是体验层，后端是否独立校验\n- 是否能抵抗隐藏字段篡改、URL 篡改、localStorage 篡改\n- 是否有依赖前端“不会作恶”的隐含假设\n\n` +
      `## Logging & Secrets\n- 日志里是否会写出密码、token、session、验证码、敏感标识\n- secret、cookie 策略、第三方凭据是否安全管理\n- 错误响应是否会暴露内部实现细节\n\n` +
      `## Rate Limiting & Bot Resistance\n- 是否需要限流、IP/账号维度封禁、device fingerprint、验证码\n- 是否需要对登录、注册、找回密码做更强的滥用约束\n- 是否存在高频调用导致的资源耗尽风险\n\n` +
      `## Failure / Recovery / Monitoring\n- 安全控制失效时怎么发现、怎么响应、怎么恢复\n- 是否有审计日志、监控、告警和人工接管路径\n- 是否能在攻击期间保持最小可用性\n\n` +
      `## Decision\n- TBD\n\n` +
      `## Follow-ups\n- TBD\n\n` +
      `## Extensibility Notes\nAdd new security checks above this block when the threat model expands.\n\n` +
      `${getReviewGuideBlock('security-audit')}`
    )
  }

  return (
    `# Risk Register\n\n` +
    `## Executive Summary\nPending clarification\n\n` +
    `## Findings\n- TBD\n\n` +
    `## Decision\n- TBD\n\n` +
    `## Follow-ups\n- TBD\n\n` +
    `${getReviewGuideBlock('risk-register')}`
  )
}

export function getBackendQuestionBankBlock(): string {
  return (
    `## Backend Question Bank\n` +
    `Use these as reusable prompts when auditing backend-heavy work:\n\n` +
    `### Data, state, and idempotency\n` +
    `- What is the source of truth for this data?\n` +
    `- Is the operation idempotent if the request is retried?\n` +
    `- Can two requests race and create duplicate or corrupted state?\n` +
    `- Do we need a transaction, unique constraint, lock, or queue to keep state consistent?\n\n` +
    `### Counters, caching, and hot paths\n` +
    `- Is this a hot-path counter, quota, rate limit, or aggregated metric?\n` +
    `- If the design skips Redis or another cache, why is direct database write still safe?\n` +
    `- Will the chosen approach survive bursts without lock contention or write amplification?\n` +
    `- Are reads and writes separated enough to avoid slow user-visible requests?\n\n` +
    `### API contract and compatibility\n` +
    `- Are request/response fields, error codes, and pagination rules fully defined?\n` +
    `- Does the API remain backward compatible for old clients?\n` +
    `- Are nullable fields, defaults, and edge cases explicit?\n` +
    `- Does this change require versioning or migration handling?\n\n` +
    `### Security and permissions\n` +
    `- Is authorization enforced on every read and write path?\n` +
    `- Could this leak sensitive data through errors, logs, or debug output?\n` +
    `- Are inputs validated before they hit persistence or third-party systems?\n` +
    `- Does the change introduce injection, file upload, or SSRF risk?\n\n` +
    `### Reliability and failure handling\n` +
    `- What happens on timeout, partial failure, or third-party outage?\n` +
    `- Is there a retry, rollback, or compensation strategy?\n` +
    `- Do we need a queue, outbox, circuit breaker, or fallback path?\n` +
    `- Can the system recover cleanly after a crash mid-operation?\n\n` +
    `### Performance and scale\n` +
    `- Will this cause N+1 queries, full table scans, or large payloads?\n` +
    `- Is pagination, batching, or background processing needed?\n` +
    `- Are there slow-query, memory, or storage growth risks?\n` +
    `- Does the design keep long-running work off the request path?\n\n` +
    `### Observability and operations\n` +
    `- Can we see which step failed in logs or traces?\n` +
    `- Are metrics or alerts needed for the new backend path?\n` +
    `- Does deployment need a migration, feature flag, or rollback script?\n` +
    `- What manual ops step would an on-call engineer need if this breaks?\n\n` +
    `### Security abuse cases\n` +
    `- Can this path be brute-forced, replayed, enumerated, or mass-automated?\n` +
    `- What happens if a client tampers with hidden fields, cookies, or redirect URLs?\n` +
    `- Do we trust anything from the browser that the server should not trust?\n` +
    `- Which actions need rate limiting, captcha, or step-up verification?\n\n` +
    `### Testing and rollout\n` +
    `- Which behavior needs unit tests versus integration tests?\n` +
    `- What failure paths must be verified manually?\n` +
    `- Is there a safe rollout path for existing data?\n` +
    `- What is the minimum evidence required before Beacon can approve the change?`
  )
}

export function getSecurityQuestionBankBlock(): string {
  return (
    `## Security Question Bank\n` +
    `Use these as reusable prompts when auditing security-heavy work:\n\n` +
    `### Threat model and trust boundaries\n` +
    `- What are the assets, trust boundaries, and attacker goals?\n` +
    `- Which inputs come from untrusted clients, and which actions cross privilege boundaries?\n` +
    `- What assumptions are we making about the browser, network, or third-party identity provider?\n\n` +
    `### Authentication and sessions\n` +
    `- Can the login flow be brute-forced, enumerated, replayed, or session-fixed?\n` +
    `- Are cookies, tokens, expiration, and logout semantics all explicit?\n` +
    `- Can an attacker keep a stale session alive or escalate by reusing a token?\n\n` +
    `### Authorization and abuse resistance\n` +
    `- Is authorization enforced on every read and write path?\n` +
    `- Can a user access another user’s data, another tenant, or an admin-only action?\n` +
    `- What rate limiting, lockout, captcha, or step-up checks stop abuse spikes?\n\n` +
    `### Frontend tampering and client trust\n` +
    `- What happens if the client changes hidden fields, query params, or localStorage?\n` +
    `- Are all important checks repeated on the server?\n` +
    `- Could the frontend leak secrets or guide an attacker toward sensitive data?\n\n` +
    `### Logging, secrets, and detection\n` +
    `- Are logs, traces, and error responses free of passwords, tokens, and internal details?\n` +
    `- What audit trail shows suspicious behavior or blocked attacks?\n` +
    `- Do we need alerts for brute force, enumeration, or CSRF-like patterns?\n\n` +
    `### Recovery and response\n` +
    `- How do we respond if abuse starts happening in production?\n` +
    `- Can we revoke sessions, rotate secrets, or temporarily disable risky flows?\n` +
    `- What manual step would an operator need during an incident?`
  )
}

export function buildFinalCloseoutTemplateBlock(): string {
  return `## Beacon Final Closeout Template

Use this exact section structure in the final closeout response:

## Tests Run
- list commands or checks that actually ran

## Verified
- list behaviors that were verified

## Unverified
- list anything not verified, skipped, or still risky

## Acceptance Summary
- one concise summary of readiness and remaining caveats`
}

export function ensureExecutionStatusSection(content: string): string {
  const statusHeadingExists = /^## Execution Status$/m.test(content)
  const guideHeadingExists = /^## Execution Status Guide$/m.test(content)
  const reviewStatusExists = /^- review_status:\s*(pending|ready|in_progress|completed)$/m.test(content)
  const securityStatusExists = /^- security_status:\s*(pending|ready|in_progress|completed)$/m.test(content)

  const statusBlock =
    `## Execution Status\n` +
    `- coordination_brief: pending\n` +
    `- review_status: pending\n` +
    `- security_status: pending\n` +
    `- frontend_handoff: pending\n` +
    `- backend_handoff: pending\n` +
    `- qa_status: pending\n\n`

  const guideBlock = getExecutionStatusGuideBlock()

  if (statusHeadingExists && guideHeadingExists) {
    if (reviewStatusExists && securityStatusExists) {
      return content
    }

    let next = content
    if (!reviewStatusExists) {
      next = next.replace(
        /^- coordination_brief:\s*pending$/m,
        `- coordination_brief: pending\n- review_status: pending`,
      )
    }

    if (!securityStatusExists) {
      next = next.replace(
        /^- review_status:\s*(pending|ready|in_progress|completed)$/m,
        match => `${match}\n- security_status: pending`,
      )
    }

    return next
  }

  if (statusHeadingExists && !guideHeadingExists) {
    if (/^## User Request$/m.test(content)) {
      return content.replace(/^## User Request$/m, `${guideBlock}## User Request`)
    }

    return `${content.trimEnd()}\n\n${guideBlock}`
  }

  if (/^## User Request$/m.test(content)) {
    return content.replace(
      /^## User Request$/m,
      `${statusBlock}${guideBlock}## User Request`,
    )
  }

  return `${content.trimEnd()}\n\n${statusBlock}${guideBlock}`
}

export function ensureClarificationGateMarker(content: string): string {
  if (/^- clarification_gate:\s*(pending|ready)$/m.test(content)) {
    return content
  }

  if (/^- development_approved:\s*.+$/m.test(content)) {
    return content.replace(
      /^(- development_approved:\s*.+)$/m,
      `$1\n- clarification_gate: pending`,
    )
  }

  if (/^## Status$/m.test(content)) {
    return content.replace(/^## Status$/m, '## Status\n- clarification_gate: pending')
  }

  return `## Status\n- clarification_gate: pending\n\n${content.trimStart()}`
}

export function updateClarificationGateMarker(
  content: string,
  value: BeaconClarificationGateValue,
): string {
  const withMarker = ensureClarificationGateMarker(content)
  const pattern = /^(- clarification_gate:\s*).+$/m

  if (pattern.test(withMarker)) {
    return withMarker.replace(pattern, `$1${value}`)
  }

  return withMarker
}

export function readClarificationGateMarker(
  content: string,
): BeaconClarificationGateValue | null {
  const match = content.match(/^- clarification_gate:\s*(pending|ready)$/m)

  return (match?.[1] as BeaconClarificationGateValue | undefined) ?? null
}

export function updateExecutionStatusMarker(
  content: string,
  key: BeaconExecutionStatusKey,
  value: BeaconExecutionStatusValue,
): string {
  const withSection = ensureExecutionStatusSection(content)
  const pattern = new RegExp(`^(- ${key}:\\s*).+$`, 'm')

  if (pattern.test(withSection)) {
    return withSection.replace(pattern, `$1${value}`)
  }

  return withSection.replace(
    /^## Execution Status$/m,
    `## Execution Status\n- ${key}: ${value}`,
  )
}

export function readExecutionStatusMarker(
  content: string,
  key: BeaconExecutionStatusKey,
): string | null {
  const match = content.match(
    new RegExp(`^- ${key}:\\s*(pending|ready|in_progress|completed)$`, 'm'),
  )

  return match?.[1] ?? null
}

export function ensureProposalGuideSection(
  content: string,
  kind: ProposalKind,
): string {
  if (/^## Completion Guide$/m.test(content)) {
    return content
  }

  return `${content.trimEnd()}\n\n${getProposalGuideBlock(kind)}`
}

export function ensureStandardArtifactGuideSection(
  content: string,
  kind: 'proposal' | 'design' | 'tasks',
): string {
  if (/^## Completion Guide$/m.test(content)) {
    return content
  }

  return `${content.trimEnd()}\n\n${getStandardArtifactGuideBlock(kind)}`
}

export function ensureAcceptanceGuideSection(content: string): string {
  if (/^## Closeout Guide$/m.test(content)) {
    return content
  }

  return `${content.trimEnd()}\n\n${getAcceptanceGuideBlock()}`
}

export function ensureReviewGuideSection(
  content: string,
  kind:
    | 'architecture-review'
    | 'backend-audit'
    | 'security-threat-model'
    | 'security-audit'
    | 'risk-register',
): string {
  if (/^## Review Guide$/m.test(content)) {
    return content
  }

  return `${content.trimEnd()}\n\n${getReviewGuideBlock(kind)}`
}

export function ensureBackendQuestionBankSection(content: string): string {
  if (/^## Backend Question Bank$/m.test(content)) {
    return content
  }

  return `${content.trimEnd()}\n\n${getBackendQuestionBankBlock()}`
}

export function ensureSecurityQuestionBankSection(content: string): string {
  if (/^## Security Question Bank$/m.test(content)) {
    return content
  }

  return `${content.trimEnd()}\n\n${getSecurityQuestionBankBlock()}`
}

export function isProposalComplete(
  content: string,
  kind: ProposalKind,
): boolean {
  if (!content.trim()) return false

  return (
    hasRequiredHeadings(content, getProposalRequiredHeadings(kind)) &&
    !containsPlaceholder(content, [
      'Pending clarification',
      'Pending implementation',
      'Pending verification',
      'TBD',
      '[ ] Pending',
    ])
  )
}

export function isStandardArtifactComplete(
  content: string,
  requiredHeadings: string[],
): boolean {
  if (!content.trim()) return false

  return (
    hasRequiredHeadings(content, requiredHeadings) &&
    !containsPlaceholder(content, ['Pending clarification', 'TBD', '[ ] Pending'])
  )
}

export function isAcceptanceInProgress(content: string): boolean {
  if (!content.trim()) return false

  if (
    !hasRequiredHeadings(content, [
      'Tests Run',
      'Verified',
      'Unverified',
      'Acceptance Summary',
    ])
  ) {
    return false
  }

  return !containsPlaceholder(content, ['Pending implementation'])
}

export function isAcceptanceComplete(content: string): boolean {
  if (!isAcceptanceInProgress(content)) return false

  return !containsPlaceholder(content, ['Pending verification', 'TBD'])
}

export function isReviewComplete(
  content: string,
  kind:
    | 'architecture-review'
    | 'backend-audit'
    | 'security-threat-model'
    | 'security-audit'
    | 'risk-register',
): boolean {
  if (!content.trim()) return false

  return (
    hasRequiredHeadings(content, getReviewRequiredHeadings(kind)) &&
    !containsPlaceholder(content, ['Pending clarification', 'TBD', '[ ] Pending'])
  )
}

async function rewriteFileIfChanged(
  path: string,
  current: string,
  next: string,
): Promise<string> {
  if (next !== current) {
    await writeFile(path, next, 'utf8')
    return next
  }

  return current
}

async function readWorkspaceFile(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

export async function normalizeBeaconWorkspaceDocs(
  state: BeaconWorkspaceDocPaths,
): Promise<BeaconWorkspaceDocs> {
  let [
    overview,
    proposal,
    design,
    tasks,
    reviewArchitecture,
    reviewBackendAudit,
    reviewRiskRegister,
    reviewBackendQuestionBank,
    reviewSecurityThreatModel,
    reviewSecurityAudit,
    reviewSecurityQuestionBank,
    frontendProposal,
    backendProposal,
    qaProposal,
    qaAcceptance,
  ] =
    await Promise.all([
      readWorkspaceFile(state.overviewPath),
      readWorkspaceFile(state.proposalPath),
      readWorkspaceFile(state.designPath),
      readWorkspaceFile(state.tasksPath),
      readWorkspaceFile(state.reviewArchitecturePath),
      readWorkspaceFile(state.reviewBackendAuditPath),
      readWorkspaceFile(state.reviewRiskRegisterPath),
      readWorkspaceFile(state.reviewBackendQuestionBankPath),
      readWorkspaceFile(state.reviewSecurityThreatModelPath),
      readWorkspaceFile(state.reviewSecurityAuditPath),
      readWorkspaceFile(state.reviewSecurityQuestionBankPath),
      readWorkspaceFile(state.frontendProposalPath),
      readWorkspaceFile(state.backendProposalPath),
      readWorkspaceFile(state.qaProposalPath),
      readWorkspaceFile(state.qaAcceptancePath),
    ])

  const normalizedOverview = ensureExecutionStatusSection(
    ensureClarificationGateMarker(overview),
  )
  const normalizedProposal = ensureStandardArtifactGuideSection(
    proposal,
    'proposal',
  )
  const normalizedDesign = ensureStandardArtifactGuideSection(design, 'design')
  const normalizedTasks = ensureStandardArtifactGuideSection(tasks, 'tasks')
  const normalizedReviewArchitecture = ensureReviewGuideSection(
    reviewArchitecture,
    'architecture-review',
  )
  const normalizedReviewBackendAudit = ensureReviewGuideSection(
    reviewBackendAudit,
    'backend-audit',
  )
  const normalizedReviewRiskRegister = ensureReviewGuideSection(
    reviewRiskRegister,
    'risk-register',
  )
  const normalizedReviewBackendQuestionBank = ensureBackendQuestionBankSection(
    reviewBackendQuestionBank,
  )
  const normalizedReviewSecurityThreatModel = ensureReviewGuideSection(
    reviewSecurityThreatModel,
    'security-threat-model',
  )
  const normalizedReviewSecurityAudit = ensureReviewGuideSection(
    reviewSecurityAudit,
    'security-audit',
  )
  const normalizedReviewSecurityQuestionBank =
    ensureSecurityQuestionBankSection(
    reviewSecurityQuestionBank,
  )
  const normalizedFrontend = ensureProposalGuideSection(
    frontendProposal,
    'frontend',
  )
  const normalizedBackend = ensureProposalGuideSection(
    backendProposal,
    'backend',
  )
  const normalizedQa = ensureProposalGuideSection(qaProposal, 'qa')
  const normalizedAcceptance = ensureAcceptanceGuideSection(qaAcceptance)

  ;[
    overview,
    proposal,
    design,
    tasks,
    reviewArchitecture,
    reviewBackendAudit,
    reviewRiskRegister,
    reviewBackendQuestionBank,
    reviewSecurityThreatModel,
    reviewSecurityAudit,
    reviewSecurityQuestionBank,
    frontendProposal,
    backendProposal,
    qaProposal,
    qaAcceptance,
  ] = await Promise.all([
    rewriteFileIfChanged(state.overviewPath, overview, normalizedOverview),
    rewriteFileIfChanged(state.proposalPath, proposal, normalizedProposal),
    rewriteFileIfChanged(state.designPath, design, normalizedDesign),
    rewriteFileIfChanged(state.tasksPath, tasks, normalizedTasks),
    rewriteFileIfChanged(
      state.reviewArchitecturePath,
      reviewArchitecture,
      normalizedReviewArchitecture,
    ),
    rewriteFileIfChanged(
      state.reviewBackendAuditPath,
      reviewBackendAudit,
      normalizedReviewBackendAudit,
    ),
    rewriteFileIfChanged(
      state.reviewRiskRegisterPath,
      reviewRiskRegister,
      normalizedReviewRiskRegister,
    ),
    rewriteFileIfChanged(
      state.reviewBackendQuestionBankPath,
      reviewBackendQuestionBank,
      normalizedReviewBackendQuestionBank,
    ),
    rewriteFileIfChanged(
      state.reviewSecurityThreatModelPath,
      reviewSecurityThreatModel,
      normalizedReviewSecurityThreatModel,
    ),
    rewriteFileIfChanged(
      state.reviewSecurityAuditPath,
      reviewSecurityAudit,
      normalizedReviewSecurityAudit,
    ),
    rewriteFileIfChanged(
      state.reviewSecurityQuestionBankPath,
      reviewSecurityQuestionBank,
      normalizedReviewSecurityQuestionBank,
    ),
    rewriteFileIfChanged(
      state.frontendProposalPath,
      frontendProposal,
      normalizedFrontend,
    ),
    rewriteFileIfChanged(
      state.backendProposalPath,
      backendProposal,
      normalizedBackend,
    ),
    rewriteFileIfChanged(state.qaProposalPath, qaProposal, normalizedQa),
    rewriteFileIfChanged(
      state.qaAcceptancePath,
      qaAcceptance,
      normalizedAcceptance,
    ),
  ])

  return {
    overview,
    proposal,
    design,
    tasks,
    reviewArchitecture,
    reviewBackendAudit,
    reviewRiskRegister,
    reviewBackendQuestionBank,
    reviewSecurityThreatModel,
    reviewSecurityAudit,
    reviewSecurityQuestionBank,
    frontendProposal,
    backendProposal,
    qaProposal,
    qaAcceptance,
  }
}
