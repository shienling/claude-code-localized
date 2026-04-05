import { readFile, writeFile } from 'fs/promises'

export type BeaconExecutionStatusKey =
  | 'coordination_brief'
  | 'frontend_handoff'
  | 'backend_handoff'
  | 'qa_status'

export type BeaconExecutionStatusValue =
  | 'pending'
  | 'ready'
  | 'in_progress'
  | 'completed'

export type BeaconClarificationGateValue = 'pending' | 'ready'

export type BeaconWorkspaceDocs = {
  overview: string
  proposal: string
  design: string
  tasks: string
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
    `- \`frontend_handoff\`: use \`pending -> ready\`\n` +
    `- \`backend_handoff\`: use \`pending -> ready\`\n` +
    `- \`qa_status\`: use \`pending -> in_progress -> completed\`\n` +
    `- Update these markers in \`overview.md\` as the single source of truth for Beacon execution progress.\n\n`
  )
}

export function getProposalGuideBlock(
  kind: 'frontend' | 'backend' | 'qa',
): string {
  const line =
    kind === 'frontend'
      ? '- Replace placeholders with the approved UI scope, validation behavior, API dependencies, and acceptance notes.'
      : kind === 'backend'
        ? '- Replace placeholders with the approved API shape, persistence plan, compatibility notes, and acceptance notes.'
        : '- Replace placeholders with concrete test coverage, regression risks, and acceptance checklist items.'

  return (
    `## Completion Guide\n` +
    `- A proposal is ready only when every required section below contains concrete implementation details.\n` +
    `${line}\n` +
    `- Remove all placeholder text before Beacon asks for development approval.\n\n`
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

  const statusBlock =
    `## Execution Status\n` +
    `- coordination_brief: pending\n` +
    `- frontend_handoff: pending\n` +
    `- backend_handoff: pending\n` +
    `- qa_status: pending\n\n`

  const guideBlock = getExecutionStatusGuideBlock()

  if (statusHeadingExists && guideHeadingExists) {
    return content
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
  kind: 'frontend' | 'backend' | 'qa',
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

export function isProposalComplete(content: string): boolean {
  if (!content.trim()) return false

  return (
    hasRequiredHeadings(content, ['Objective']) &&
    !containsPlaceholder(content, ['Pending clarification', 'TBD'])
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
    frontendProposal,
    backendProposal,
    qaProposal,
    qaAcceptance,
  }
}
