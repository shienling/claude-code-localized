import { access, mkdir, readFile, writeFile } from 'fs/promises'
import { constants as fsConstants } from 'fs'
import os from 'os'
import { basename, dirname, isAbsolute, join, resolve } from 'path'
import { registerBundledSkill } from '../bundledSkills.js'
import {
  buildFinalCloseoutTemplateBlock,
  containsPlaceholder,
  ensureExecutionStatusSection,
  getAcceptanceGuideBlock,
  getExecutionStatusGuideBlock,
  getProposalGuideBlock,
  isAcceptanceComplete,
  isAcceptanceInProgress,
  isProposalComplete,
  isStandardArtifactComplete,
  normalizeBeaconWorkspaceDocs,
  readClarificationGateMarker,
  readExecutionStatusMarker,
  updateClarificationGateMarker,
  updateExecutionStatusMarker,
} from './beaconDocs.js'

export type BeaconPhase = 'clarification' | 'implementation'
export type BeaconExecutionState =
  | 'clarifying'
  | 'awaiting_approval'
  | 'coordinating'
  | 'implementing'
  | 'verifying'
  | 'completed'

export type BeaconSessionState = {
  active: boolean
  changeId: string
  projectRoot: string
  targetPath: string
  overviewPath: string
  proposalPath: string
  designPath: string
  tasksPath: string
  frontendProposalPath: string
  backendProposalPath: string
  qaProposalPath: string
  qaAcceptancePath: string
  mode: 'new' | 'existing'
  phase: BeaconPhase
  stage: BeaconExecutionState
}

function getBeaconStageLabel(stage: BeaconExecutionState): string {
  switch (stage) {
    case 'clarifying':
      return '需求补全'
    case 'awaiting_approval':
      return '等待确认'
    case 'coordinating':
      return '开发协调'
    case 'implementing':
      return '并行开发'
    case 'verifying':
      return '测试验收'
    case 'completed':
      return '完成收口'
  }
}

type BeaconWorkspace =
  | {
      mode: 'existing'
      projectRoot: string
      targetPath: string
      overviewPath: string
      proposalPath: string
      designPath: string
      tasksPath: string
      frontendProposalPath: string
      backendProposalPath: string
      qaProposalPath: string
      qaAcceptancePath: string
      changeId: string
    }
  | {
      mode: 'new'
      projectRoot: string
      targetPath: string
      overviewPath: string
      proposalPath: string
      designPath: string
      tasksPath: string
      frontendProposalPath: string
      backendProposalPath: string
      qaProposalPath: string
      qaAcceptancePath: string
      changeId: string
    }

export const BEACON_EXPLICIT_APPROVAL_PHRASES = [
  '开始开发',
  '确认开始',
  '开始',
  '继续开发',
] as const

const BEACON_REOPEN_PATTERN =
  /(继续修改|继续优化|继续补充|补充需求|新增需求|新增功能|需要调整|再改|返工|重做|reopen|follow-up|more work|need changes)/i

type BeaconRole = 'pm/planner' | 'frontend' | 'backend' | 'qa'

type BeaconTaskTemplate = {
  role: BeaconRole
  filesToRead: string[]
  responsibilities: string[]
  deliverables: string[]
  executionStatusUpdate?: {
    path: string
    marker:
      | 'coordination_brief'
      | 'frontend_handoff'
      | 'backend_handoff'
      | 'qa_status'
    value: 'ready' | 'in_progress' | 'completed'
    when: string
  }
  constraints?: string[]
}

type BeaconExecutionStage = {
  name: string
  mode: 'serial' | 'parallel'
  roles: BeaconRole[]
  goal: string
}

type BeaconExecutionPlan = {
  stages: BeaconExecutionStage[]
  completionRule: string
}

type BeaconOrchestrationStep = {
  role: BeaconRole
  stageName: string
  waitFor: string
  purpose: string
}

type BeaconWorkspaceProgress = {
  clarificationReady: boolean
  standardArtifactsReady: boolean
  proposalsReady: boolean
  coordinationReady: boolean
  frontendReady: boolean
  backendReady: boolean
  implementationReady: boolean
  acceptanceInProgress: boolean
  acceptanceReady: boolean
}

function getBeaconTaskTemplates(
  state: BeaconSessionState,
): BeaconTaskTemplate[] {
  return [
    {
      role: 'pm/planner',
      filesToRead: [
        state.overviewPath,
        state.proposalPath,
        state.designPath,
        state.tasksPath,
        state.frontendProposalPath,
        state.backendProposalPath,
        state.qaProposalPath,
      ],
      responsibilities: [
        'confirm the approved scope',
        'identify dependency order and parallelizable work',
        'produce a concise implementation checklist for frontend, backend, and qa',
        'flag any mismatch across the proposal files',
      ],
      deliverables: ['a concise execution brief for the main thread'],
      executionStatusUpdate: {
        path: state.overviewPath,
        marker: 'coordination_brief',
        value: 'ready',
        when: 'after the execution brief is finalized',
      },
      constraints: [
        'Do not implement product code unless coordination work absolutely requires it.',
      ],
    },
    {
      role: 'frontend',
      filesToRead: [
        state.overviewPath,
        state.designPath,
        state.tasksPath,
        state.frontendProposalPath,
        state.backendProposalPath,
      ],
      responsibilities: [
        'implement the approved UI and client behavior',
        'wire any frontend contract changes needed for the approved backend shape',
        'update frontend-facing notes if the implementation reveals necessary specifics',
        'run relevant frontend tests or checks when possible',
      ],
      deliverables: [
        'files changed',
        'tests/checks run',
        'anything blocked or still dependent on backend work',
      ],
      executionStatusUpdate: {
        path: state.overviewPath,
        marker: 'frontend_handoff',
        value: 'ready',
        when: 'after the frontend handoff is ready for QA and the main thread',
      },
    },
    {
      role: 'backend',
      filesToRead: [
        state.overviewPath,
        state.designPath,
        state.tasksPath,
        state.backendProposalPath,
        state.qaProposalPath,
      ],
      responsibilities: [
        'implement the approved API, validation, and persistence changes',
        'preserve compatibility expectations documented in the proposal',
        'run relevant backend tests or checks when possible',
      ],
      deliverables: [
        'files changed',
        'tests/checks run',
        'follow-up items QA or frontend should know about',
      ],
      executionStatusUpdate: {
        path: state.overviewPath,
        marker: 'backend_handoff',
        value: 'ready',
        when: 'after the backend handoff is ready for QA and the main thread',
      },
    },
    {
      role: 'qa',
      filesToRead: [
        state.overviewPath,
        state.proposalPath,
        state.designPath,
        state.tasksPath,
        state.frontendProposalPath,
        state.backendProposalPath,
        state.qaProposalPath,
        state.qaAcceptancePath,
      ],
      responsibilities: [
        'verify the implemented behavior against the approved proposal set',
        'run relevant tests/checks when possible',
        `update ${state.qaAcceptancePath}`,
      ],
      deliverables: [
        'Tests Run',
        'Verified',
        'Unverified',
        'Acceptance Summary',
      ],
      executionStatusUpdate: {
        path: state.overviewPath,
        marker: 'qa_status',
        value: 'completed',
        when: 'after QA acceptance closeout is finalized',
      },
      constraints: ['Your final response must use the exact deliverable headings.'],
    },
  ]
}

function formatBeaconTaskTemplate(
  state: BeaconSessionState,
  template: BeaconTaskTemplate,
): string {
  const constraints = template.constraints ?? []
  const body = [
    `You are the Beacon ${template.role} worker for change ${state.changeId}.`,
    '',
    'Read:',
    ...template.filesToRead.map(path => `- ${path}`),
    '',
    'Your job:',
    ...template.responsibilities.map(item => `- ${item}`),
    '',
    'At the end, report:',
    ...template.deliverables.map(item => `- ${item}`),
  ]

  if (template.executionStatusUpdate) {
    body.push(
      '',
      'Execution status writeback:',
      `- update ${template.executionStatusUpdate.path}`,
      `- set ${template.executionStatusUpdate.marker}: ${template.executionStatusUpdate.value}`,
      `- do this ${template.executionStatusUpdate.when}`,
    )
  }

  if (constraints.length > 0) {
    body.push('', ...constraints)
  }

  return `### ${template.role} task

\`\`\`
${body.join('\n')}
\`\`\``
}

function getBeaconExecutionPlan(): BeaconExecutionPlan {
  return {
    stages: [
      {
        name: 'coordination',
        mode: 'serial',
        roles: ['pm/planner'],
        goal: 'Confirm scope, dependency order, and the execution brief before coding starts.',
      },
      {
        name: 'implementation',
        mode: 'parallel',
        roles: ['frontend', 'backend'],
        goal: 'Implement the approved UI/client and API/data changes in parallel when dependencies allow.',
      },
      {
        name: 'verification',
        mode: 'serial',
        roles: ['qa'],
        goal: 'Verify implemented behavior, run tests/checks, and update the QA acceptance file.',
      },
    ],
    completionRule:
      'Do not declare the Beacon change complete until the verification stage has finished and the final handoff follows the required acceptance template.',
  }
}

function buildBeaconExecutionPlanPrompt(): string {
  const plan = getBeaconExecutionPlan()
  const stageLines = plan.stages.map(
    (stage, index) =>
      `${index + 1}. ${stage.name} [${stage.mode}] -> ${stage.roles.join(', ')}\n   Goal: ${stage.goal}`,
  )

  return `## Beacon Execution Plan

Follow this default orchestration order unless the approved proposal set clearly requires a different dependency sequence:

${stageLines.join('\n\n')}

Completion rule:
${plan.completionRule}`
}

function getBeaconOrchestrationSteps(): BeaconOrchestrationStep[] {
  return [
    {
      role: 'pm/planner',
      stageName: 'coordination',
      waitFor: 'the execution brief and dependency notes',
      purpose:
        'establish task order, flag proposal mismatches, and confirm what frontend/backend can do in parallel',
    },
    {
      role: 'frontend',
      stageName: 'implementation',
      waitFor: 'frontend implementation summary, changed files, and checks run',
      purpose:
        'implement approved UI/client changes and surface anything blocked on backend work',
    },
    {
      role: 'backend',
      stageName: 'implementation',
      waitFor: 'backend implementation summary, changed files, and checks run',
      purpose:
        'implement approved API/data changes and surface any details QA or frontend need next',
    },
    {
      role: 'qa',
      stageName: 'verification',
      waitFor: 'updated qa/acceptance.md and the structured acceptance summary',
      purpose:
        'verify the completed implementation against the approved proposal set and produce the final acceptance closeout',
    },
  ]
}

function buildBeaconOrchestrationHelperPrompt(): string {
  const lines = getBeaconOrchestrationSteps().map(
    (step, index) =>
      `${index + 1}. Launch ${step.role} in stage "${step.stageName}"\n` +
      `   Purpose: ${step.purpose}\n` +
      `   Wait for: ${step.waitFor}`,
  )

  return `## Beacon Task Orchestration Helper

Use this as the default main-thread control pattern during implementation:

${lines.join('\n\n')}

Main-thread rules:
- run pm/planner first
- after pm/planner returns, launch frontend and backend as the default parallel pair in the same turn unless the execution brief explicitly says one blocks the other
- do not serialize frontend and backend by default; serial execution requires an explicit dependency reason grounded in the approved proposal set
- wait for both frontend and backend results before launching qa
- use qa as the final verification gate before you declare the Beacon change complete`
}

function buildBeaconFileReferenceBlock(state: BeaconSessionState): string {
  return `Core files:
- Overview: \`${state.overviewPath}\`
- Change proposal: \`${state.proposalPath}\`
- Technical design: \`${state.designPath}\`
- Task breakdown: \`${state.tasksPath}\`
- Frontend proposal: \`${state.frontendProposalPath}\`
- Backend proposal: \`${state.backendProposalPath}\`
- QA proposal: \`${state.qaProposalPath}\`
- QA acceptance: \`${state.qaAcceptancePath}\``
}

function buildBeaconTaskPromptTemplates(state: BeaconSessionState): string {
  const sections = getBeaconTaskTemplates(state).map(template =>
    formatBeaconTaskTemplate(state, template),
  )

  return `## Beacon Task Prompt Templates

Use these as the default shape when delegating with the Task tool.

${sections.join('\n\n')}`
}

function buildSuperpowersDisciplineBlock(
  stage: BeaconExecutionState,
  state: BeaconSessionState,
): string {
  const lines =
    stage === 'clarifying'
      ? [
          '- `using-superpowers`: Beacon discipline is mandatory before acting.',
          '- `brainstorming`: ask proactive follow-up questions and resolve ambiguity before approval.',
          `- Keep \`${state.proposalPath}\`, \`${state.designPath}\`, \`${state.tasksPath}\`, and the split role proposals aligned while clarifying.`,
        ]
      : stage === 'awaiting_approval'
        ? [
            '- `using-superpowers`: do not skip directly into coding.',
            '- `writing-plans`: ensure proposal, design, and tasks are implementation-ready before asking to start.',
            '- Summarize assumptions and wait for explicit user confirmation.',
          ]
        : stage === 'coordinating'
          ? [
              '- `writing-plans`: pm/planner turns the approved docs into a concrete execution brief.',
              '- `subagent-driven-development`: plan to execute through focused role workers rather than the main thread doing everything.',
              '- `requesting-code-review`: build review gates into the execution brief.',
            ]
          : stage === 'implementing'
            ? [
                '- `subagent-driven-development`: delegate implementation to focused workers with explicit handoffs.',
                '- `test-driven-development`: feature and bugfix work should be grounded in failing tests/checks before implementation whenever feasible.',
                '- `requesting-code-review`: code landing is not enough; review and QA are mandatory.',
              ]
            : stage === 'verifying'
              ? [
                  '- `verification-before-completion`: do not claim completion without fresh verification evidence.',
                  '- `requesting-code-review`: if QA or verification surfaces issues, route back through review/fix rather than forcing completion.',
                  '- `Tests Run / Verified / Unverified / Acceptance Summary` are mandatory evidence, not optional prose.',
                ]
              : [
                  '- `verification-before-completion`: preserve the final evidence-backed closeout.',
                  '- If more work appears, deliberately reopen Beacon instead of silently extending a completed change.',
                ]

  return `## Superpowers Discipline

Mandatory discipline for this Beacon stage:

${lines.join('\n')}`
}

function buildExecutionStatusHelper(
  state: BeaconSessionState,
  stage: BeaconExecutionState,
): string {
  const lines =
    stage === 'clarifying' || stage === 'awaiting_approval'
      ? [
          '- Keep all execution markers pending while Beacon is still clarifying scope.',
          '- Do not mark implementation progress in overview.md before explicit approval.',
        ]
      : stage === 'coordinating'
        ? [
            `- In \`${state.overviewPath}\`, keep \`coordination_brief: pending\` until pm/planner finalizes the execution brief.`,
            '- Once the execution brief is finalized, set `coordination_brief: ready`.',
            '- Leave `frontend_handoff`, `backend_handoff`, and `qa_status` unchanged until later stages.',
          ]
        : stage === 'implementing'
          ? [
              `- In \`${state.overviewPath}\`, preserve \`coordination_brief: ready\` from the coordination stage.`,
              '- Set `frontend_handoff: ready` only when the frontend handoff is actually ready.',
              '- Set `backend_handoff: ready` only when the backend handoff is actually ready.',
              '- Keep `qa_status: pending` until QA starts verification.',
            ]
          : stage === 'verifying'
            ? [
                `- In \`${state.overviewPath}\`, preserve \`frontend_handoff: ready\` and \`backend_handoff: ready\`.`,
                '- Set `qa_status: in_progress` while QA is actively verifying.',
                '- Set `qa_status: completed` only after qa/acceptance.md and the final closeout are complete.',
              ]
            : [
                `- In \`${state.overviewPath}\`, preserve the final execution markers as the source of truth.`,
                '- Keep `qa_status: completed` unless the change is explicitly reopened.',
              ]

  return `## Beacon Execution Status Helper

Use overview.md as the single execution-state record for this Beacon change.

${lines.join('\n')}`
}

function buildClarifyingStagePrompt(state: BeaconSessionState): string {
  return `Beacon is ACTIVE and still in clarification mode.

${buildBeaconFileReferenceBlock(state)}

Required behavior:
- continue Superpowers-style brainstorming
- proactively clarify ambiguity with at least one round of follow-up questions before asking to start development, unless the user explicitly says the requirement is already complete and no more clarification is needed
- keep the proposal files updated as understanding improves
- keep \`clarification_gate: pending\` in \`${state.overviewPath}\` until those follow-up questions have been asked and resolved, or the user explicitly waives more clarification
- only set \`clarification_gate: ready\` after the proposals and overview reflect the clarified answers
- do NOT start implementation yet unless the user gives an explicit confirmation phrase
- accepted confirmation phrases are: ${BEACON_EXPLICIT_APPROVAL_PHRASES.map(phrase => `"${phrase}"`).join(', ')}

${buildSuperpowersDisciplineBlock('clarifying', state)}

${buildExecutionStatusHelper(state, 'clarifying')}`
}

function buildAwaitingApprovalStagePrompt(state: BeaconSessionState): string {
  return `Beacon is ACTIVE and waiting for explicit approval.

${buildBeaconFileReferenceBlock(state)}

Required behavior:
- summarize the clarified scope and technical approach
- point the user to the proposal files
- ask whether to start development
- preserve \`clarification_gate: ready\` in \`${state.overviewPath}\` unless the user introduces new ambiguity or follow-up work
- do NOT implement anything until the user gives an explicit confirmation phrase

${buildSuperpowersDisciplineBlock('awaiting_approval', state)}

${buildExecutionStatusHelper(state, 'awaiting_approval')}`
}

function buildCoordinatingStagePrompt(state: BeaconSessionState): string {
  return `Beacon is ACTIVE and in coordinating mode.

${buildBeaconFileReferenceBlock(state)}

Required behavior:
- start with pm/planner
- establish the execution brief and dependency order
- after the execution brief is ready, update \`${state.overviewPath}\` so \`coordination_brief: ready\`
- use the Beacon execution plan and orchestration helper as the default control pattern
- do not skip directly to QA

${buildSuperpowersDisciplineBlock('coordinating', state)}

${buildBeaconExecutionPlanPrompt()}

${buildBeaconOrchestrationHelperPrompt()}

${buildExecutionStatusHelper(state, 'coordinating')}

${formatBeaconTaskTemplate(
    state,
    getBeaconTaskTemplates(state).find(t => t.role === 'pm/planner')!,
  )}`
}

function buildImplementingStagePrompt(state: BeaconSessionState): string {
  const templates = getBeaconTaskTemplates(state)
  const frontend = templates.find(t => t.role === 'frontend')!
  const backend = templates.find(t => t.role === 'backend')!
  const qa = templates.find(t => t.role === 'qa')!

  return `Beacon is ACTIVE and in implementing mode.

${buildBeaconFileReferenceBlock(state)}

Required behavior:
- drive frontend and backend execution as the default parallel pair when safe
- use the Task tool instead of keeping all implementation in the main thread
- create both frontend and backend Task delegations in the same turn by default
- only fall back to serial frontend/backend execution if pm/planner already identified a real dependency that makes parallel work unsafe
- capture changed files, checks run, and blockers from both workers
- after each worker handoff lands, update \`${state.overviewPath}\` with \`frontend_handoff: ready\` and/or \`backend_handoff: ready\`
- prepare QA handoff inputs as implementation results come back
- if both frontend and backend handoffs become ready in this same turn, do NOT stop at implementation summary; immediately launch QA verification in the same turn
- treat QA as required before final completion, not as optional follow-up
- if QA starts in this turn, update \`${state.overviewPath}\` to keep \`qa_status: in_progress\`, run relevant verification, and update \`${state.qaAcceptancePath}\`

${buildSuperpowersDisciplineBlock('implementing', state)}

${buildBeaconOrchestrationHelperPrompt()}

${buildExecutionStatusHelper(state, 'implementing')}

## Active worker templates

${formatBeaconTaskTemplate(state, frontend)}

${formatBeaconTaskTemplate(state, backend)}

## Same-turn QA escalation

If implementation reaches a state where both \`frontend_handoff: ready\` and \`backend_handoff: ready\` are true during this turn, immediately use this QA template instead of waiting for another user message:

${formatBeaconTaskTemplate(state, qa)}`
}

function buildVerifyingStagePrompt(state: BeaconSessionState): string {
  const qa = getBeaconTaskTemplates(state).find(t => t.role === 'qa')!

  return `Beacon is ACTIVE and in verifying mode.

${buildBeaconFileReferenceBlock(state)}

Required behavior:
- focus on QA verification and acceptance closeout
- keep \`${state.overviewPath}\` aligned with \`qa_status: in_progress\` during verification and \`qa_status: completed\` once the final acceptance closeout is done
- update \`${state.qaAcceptancePath}\`
- run relevant tests/checks when possible
- final output must follow the required acceptance structure exactly

${buildSuperpowersDisciplineBlock('verifying', state)}

${buildExecutionStatusHelper(state, 'verifying')}

${buildFinalCloseoutTemplateBlock()}

${formatBeaconTaskTemplate(state, qa)}`
}

function buildCompletedStagePrompt(state: BeaconSessionState): string {
  return `Beacon is ACTIVE and currently in completed closeout mode.

${buildBeaconFileReferenceBlock(state)}

Required behavior:
- stay in closeout mode unless the user clearly reopens the change
- preserve the final acceptance summary
- if more work is requested, move back into the appropriate execution stage deliberately

${buildSuperpowersDisciplineBlock('completed', state)}

${buildExecutionStatusHelper(state, 'completed')}

${buildFinalCloseoutTemplateBlock()}`
}

function slugify(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[`'"“”‘’]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized || 'change'
}

function currentDateStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

function looksLikeMarkdownPath(raw: string): boolean {
  return raw.endsWith('.md') || raw.includes('openspec/')
}

function expandHomePath(input: string): string {
  return input.startsWith('~/') ? join(os.homedir(), input.slice(2)) : input
}

function extractPathCandidates(input: string): string[] {
  const matches = input.match(
    /(?:~\/|\/|\.\.?\/)[^\s，。；；、“”"'`()]+/g,
  )

  if (!matches) return []

  return [...new Set(matches.map(candidate => expandHomePath(candidate.trim())))]
}

async function resolveTargetProjectPath(
  args: string,
  cwd: string,
): Promise<string | null> {
  const trimmed = args.trim()

  const directCandidates = [trimmed, ...extractPathCandidates(trimmed)]

  for (const rawCandidate of directCandidates) {
    if (!rawCandidate) continue

    const candidate = isAbsolute(rawCandidate)
      ? rawCandidate
      : resolve(cwd, rawCandidate)

    if (!(await pathExists(candidate))) {
      continue
    }

    const existingChangeRoot = await readChangeRoot(candidate)
    if (existingChangeRoot) {
      return existingChangeRoot
    }

    try {
      const stat = await Bun.file(candidate).stat()
      if (stat.isDirectory()) {
        return candidate
      }
    } catch {
      continue
    }
  }

  return null
}

function getPathsForChange(changeRoot: string, changeId: string) {
  const projectRoot = resolve(changeRoot, '..', '..', '..')
  return {
    projectRoot,
    targetPath: changeRoot,
    overviewPath: join(changeRoot, 'overview.md'),
    proposalPath: join(changeRoot, 'proposal.md'),
    designPath: join(changeRoot, 'design.md'),
    tasksPath: join(changeRoot, 'tasks.md'),
    frontendProposalPath: join(changeRoot, 'frontend', 'proposal.md'),
    backendProposalPath: join(changeRoot, 'backend', 'proposal.md'),
    qaProposalPath: join(changeRoot, 'qa', 'proposal.md'),
    qaAcceptancePath: join(changeRoot, 'qa', 'acceptance.md'),
    changeId,
  }
}

async function scaffoldFile(path: string, content: string): Promise<void> {
  if (await pathExists(path)) return
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
}

async function scaffoldWorkspace(
  args: string,
  cwd: string,
  fallbackProjectRoot?: string,
): Promise<BeaconWorkspace> {
  const trimmed = args.trim()
  const resolvedTargetPath = await resolveTargetProjectPath(trimmed, cwd)

  if (resolvedTargetPath) {
    const existingChangeRoot = await readChangeRoot(resolvedTargetPath)

    if (existingChangeRoot) {
      const changeId = basename(existingChangeRoot)
      const workspace = {
        mode: 'existing' as const,
        ...getPathsForChange(existingChangeRoot, changeId),
      }
      await ensureWorkspaceFiles(workspace, trimmed || changeId)
      return workspace
    }
  }

  const changeId = `${currentDateStamp()}-${slugify(trimmed)}`
  const projectRoot = resolvedTargetPath ?? fallbackProjectRoot ?? cwd
  const changeRoot = join(projectRoot, 'openspec', 'changes', changeId)
  const workspace = {
    mode: 'new' as const,
    ...getPathsForChange(changeRoot, changeId),
  }
  await ensureWorkspaceFiles(workspace, trimmed || 'New change request')
  return workspace
}

async function readChangeRoot(candidate: string): Promise<string | null> {
  if (!(await pathExists(candidate))) return null

  if ((await pathExists(join(candidate, 'frontend', 'proposal.md'))) ||
    (await pathExists(join(candidate, 'backend', 'proposal.md'))) ||
    (await pathExists(join(candidate, 'qa', 'proposal.md')))) {
    return candidate
  }

  if (basename(candidate) === 'overview.md') {
    return resolve(candidate, '..')
  }

  if (basename(candidate) === 'proposal.md') {
    const parentDir = basename(resolve(candidate, '..'))
    if (parentDir === 'frontend' || parentDir === 'backend' || parentDir === 'qa') {
      return resolve(candidate, '..', '..')
    }
    return resolve(candidate, '..')
  }

  if (basename(candidate) === 'design.md' || basename(candidate) === 'tasks.md') {
    return resolve(candidate, '..')
  }

  if (basename(candidate) === 'acceptance.md') {
    return resolve(candidate, '..', '..')
  }

  return null
}

async function ensureWorkspaceFiles(
  workspace: Omit<BeaconWorkspace, 'mode'> | BeaconWorkspace,
  title: string,
): Promise<void> {
  await mkdir(join(workspace.targetPath, 'frontend'), { recursive: true })
  await mkdir(join(workspace.targetPath, 'backend'), { recursive: true })
  await mkdir(join(workspace.targetPath, 'qa'), { recursive: true })

  await scaffoldFile(
    workspace.overviewPath,
    `# Beacon Overview\n\n## Change\n${title}\n\n## Status\n- phase: brainstorming\n- stage: clarifying\n- development_approved: no\n- clarification_gate: pending\n\n## Execution Status\n- coordination_brief: pending\n- frontend_handoff: pending\n- backend_handoff: pending\n- qa_status: pending\n\n${getExecutionStatusGuideBlock()}## User Request\n${title}\n\n## Scope Summary\n- Pending clarification\n\n## Approval\n- Waiting for explicit user confirmation phrase before implementation starts.\n`,
  )
  await scaffoldFile(
    workspace.proposalPath,
    `# Change Proposal\n\n## Summary\nPending clarification\n\n## Scope\n- TBD\n\n## Risks\n- TBD\n\n## Affected Artifacts\n- TBD\n`,
  )
  await scaffoldFile(
    workspace.designPath,
    `# Technical Design\n\n## Architecture\nPending clarification\n\n## Frontend Design\n- TBD\n\n## Backend Design\n- TBD\n\n## QA Strategy\n- TBD\n\n## Open Questions\n- TBD\n`,
  )
  await scaffoldFile(
    workspace.tasksPath,
    `# Implementation Tasks\n\n## Coordination\n- [ ] Pending clarification\n\n## Frontend\n- [ ] Pending clarification\n\n## Backend\n- [ ] Pending clarification\n\n## QA\n- [ ] Pending clarification\n`,
  )
  await scaffoldFile(
    workspace.frontendProposalPath,
    `# Frontend Proposal\n\n## Objective\nPending clarification\n\n## UI Changes\n- TBD\n\n## Validation Rules\n- TBD\n\n## API Dependencies\n- TBD\n\n## Acceptance Notes\n- TBD\n\n${getProposalGuideBlock('frontend')}`,
  )
  await scaffoldFile(
    workspace.backendProposalPath,
    `# Backend Proposal\n\n## Objective\nPending clarification\n\n## API Changes\n- TBD\n\n## Data Model / Persistence\n- TBD\n\n## Compatibility Notes\n- TBD\n\n## Acceptance Notes\n- TBD\n\n${getProposalGuideBlock('backend')}`,
  )
  await scaffoldFile(
    workspace.qaProposalPath,
    `# QA Proposal\n\n## Objective\nPending clarification\n\n## Test Coverage\n- TBD\n\n## Regression Risks\n- TBD\n\n## Acceptance Checklist\n- TBD\n\n${getProposalGuideBlock('qa')}`,
  )
  await scaffoldFile(
    workspace.qaAcceptancePath,
    `# QA Acceptance\n\n## Tests Run\n- Pending implementation\n\n## Verified\n- TBD\n\n## Unverified\n- TBD\n\n## Acceptance Summary\n- Pending verification\n\n${getAcceptanceGuideBlock()}`,
  )
}

async function maybeReadOverview(path: string): Promise<string> {
  if (!(await pathExists(path))) return ''
  return await readFile(path, 'utf8')
}

function nextOverviewStatusContent(
  content: string,
  phase: BeaconPhase,
  stage: BeaconExecutionState,
): string {
  const approved = phase === 'implementation' ? 'yes' : 'no'
  const normalizedPhase = phase === 'implementation' ? 'implementation' : 'brainstorming'

  let next = ensureExecutionStatusSection(content)
  next = updateClarificationGateMarker(
    next,
    stage === 'clarifying' ? 'pending' : 'ready',
  )

  if (/^- phase:\s*.+$/m.test(next)) {
    next = next.replace(/^(- phase:\s*).+$/m, `$1${normalizedPhase}`)
  }

  if (/^- development_approved:\s*.+$/m.test(next)) {
    next = next.replace(/^(- development_approved:\s*).+$/m, `$1${approved}`)
  }

  if (/^- stage:\s*.+$/m.test(next)) {
    next = next.replace(/^(- stage:\s*).+$/m, `$1${stage}`)
  }

  if (stage === 'coordinating') {
    next = updateExecutionStatusMarker(next, 'qa_status', 'pending')
  } else if (stage === 'implementing') {
    next = updateExecutionStatusMarker(next, 'qa_status', 'pending')
  } else if (stage === 'verifying') {
    next = updateExecutionStatusMarker(next, 'qa_status', 'in_progress')
  } else if (stage === 'completed') {
    next = updateExecutionStatusMarker(next, 'qa_status', 'completed')
  }

  return next
}

function inferPhaseFromOverview(content: string): BeaconPhase {
  if (
    /development_approved:\s*yes/i.test(content) ||
    /phase:\s*implementation/i.test(content)
  ) {
    return 'implementation'
  }

  return 'clarification'
}

function inferStageFromOverview(content: string): BeaconExecutionState {
  const match = content.match(/^- stage:\s*(.+)$/m)
  const raw = match?.[1]?.trim()

  switch (raw) {
    case 'clarifying':
    case 'awaiting_approval':
    case 'coordinating':
    case 'implementing':
    case 'verifying':
    case 'completed':
      return raw
    default:
      return inferPhaseFromOverview(content) === 'implementation'
        ? 'coordinating'
        : 'clarifying'
  }
}

export function isBeaconExplicitApproval(input: string): boolean {
  const normalized = input.trim().replace(/[。.!！?？]+$/g, '')
  return BEACON_EXPLICIT_APPROVAL_PHRASES.includes(
    normalized as (typeof BEACON_EXPLICIT_APPROVAL_PHRASES)[number],
  )
}

export async function prepareBeaconSessionState(
  args: string,
  cwd: string,
  fallbackProjectRoot?: string,
): Promise<BeaconSessionState> {
  const workspace = await scaffoldWorkspace(args, cwd, fallbackProjectRoot)
  const docs = await normalizeBeaconWorkspaceDocs(workspace)

  return {
    active: true,
    changeId: workspace.changeId,
    projectRoot: workspace.projectRoot,
    targetPath: workspace.targetPath,
    overviewPath: workspace.overviewPath,
    proposalPath: workspace.proposalPath,
    designPath: workspace.designPath,
    tasksPath: workspace.tasksPath,
    frontendProposalPath: workspace.frontendProposalPath,
    backendProposalPath: workspace.backendProposalPath,
    qaProposalPath: workspace.qaProposalPath,
    qaAcceptancePath: workspace.qaAcceptancePath,
    mode: workspace.mode,
    phase: inferPhaseFromOverview(docs.overview),
    stage: inferStageFromOverview(docs.overview),
  }
}

export async function syncBeaconOverviewPhase(
  state: Pick<BeaconSessionState, 'overviewPath' | 'phase' | 'stage'>,
): Promise<void> {
  const current = await maybeReadOverview(state.overviewPath)
  if (!current) return

  const next = nextOverviewStatusContent(current, state.phase, state.stage)
  if (next === current) return

  await writeFile(state.overviewPath, next, 'utf8')
}

export function advanceBeaconStage(
  state: BeaconSessionState,
  userInput: string,
): BeaconSessionState {
  const trimmed = userInput.trim()

  if (isBeaconExplicitApproval(trimmed)) {
    return {
      ...state,
      phase: 'implementation',
      stage: 'coordinating',
    }
  }

  if (state.stage === 'completed' && BEACON_REOPEN_PATTERN.test(trimmed)) {
    return {
      ...state,
      phase: 'clarification',
      stage: 'clarifying',
    }
  }

  if (state.phase === 'clarification') {
    return {
      ...state,
      stage: state.stage === 'awaiting_approval' ? state.stage : 'clarifying',
    }
  }

  if (state.stage === 'coordinating' && trimmed.length > 0) {
    return {
      ...state,
      stage: 'implementing',
    }
  }

  if (
    state.stage === 'implementing' &&
    /(qa|test|tests|verify|verification|验收|测试|联调)/i.test(trimmed)
  ) {
    return {
      ...state,
      stage: 'verifying',
    }
  }

  if (
    state.stage === 'verifying' &&
    /(完成|结束|done|complete|completed|验收通过)/i.test(trimmed)
  ) {
    return {
      ...state,
      stage: 'completed',
    }
  }

  return state
}

async function getBeaconWorkspaceProgress(
  state: BeaconSessionState,
): Promise<BeaconWorkspaceProgress> {
  const docs = await normalizeBeaconWorkspaceDocs(state)
  const overview = docs.overview
  const proposal = docs.proposal
  const design = docs.design
  const tasks = docs.tasks
  const frontend = docs.frontendProposal
  const backend = docs.backendProposal
  const qa = docs.qaProposal
  const acceptance = docs.qaAcceptance

  const proposalsReady =
    !containsPlaceholder(overview, ['Pending clarification']) &&
    [frontend, backend, qa].every(isProposalComplete)
  const standardArtifactsReady =
    isStandardArtifactComplete(proposal, [
      'Summary',
      'Scope',
      'Risks',
      'Affected Artifacts',
    ]) &&
    isStandardArtifactComplete(design, [
      'Architecture',
      'Frontend Design',
      'Backend Design',
      'QA Strategy',
      'Open Questions',
    ]) &&
    isStandardArtifactComplete(tasks, [
      'Coordination',
      'Frontend',
      'Backend',
      'QA',
    ])
  const clarificationReady = readClarificationGateMarker(overview) === 'ready'
  const coordinationReady = readExecutionStatusMarker(overview, 'coordination_brief') === 'ready'
  const frontendReady = readExecutionStatusMarker(overview, 'frontend_handoff') === 'ready'
  const backendReady = readExecutionStatusMarker(overview, 'backend_handoff') === 'ready'
  const implementationReady = frontendReady && backendReady

  return {
    clarificationReady,
    standardArtifactsReady,
    proposalsReady,
    coordinationReady,
    frontendReady,
    backendReady,
    implementationReady,
    acceptanceInProgress: isAcceptanceInProgress(acceptance),
    acceptanceReady: isAcceptanceComplete(acceptance),
  }
}

export async function advanceBeaconStageFromWorkspace(
  state: BeaconSessionState,
  userInput: string,
): Promise<BeaconSessionState> {
  const heuristicState = advanceBeaconStage(state, userInput)
  const progress = await getBeaconWorkspaceProgress(heuristicState)

  if (isBeaconExplicitApproval(userInput.trim())) {
    return heuristicState
  }

  if (heuristicState.phase === 'clarification') {
    return {
      ...heuristicState,
      stage:
        progress.standardArtifactsReady &&
        progress.proposalsReady &&
        progress.clarificationReady
          ? 'awaiting_approval'
          : 'clarifying',
    }
  }

  if (heuristicState.stage === 'coordinating' && progress.coordinationReady) {
    return {
      ...heuristicState,
      stage: 'implementing',
    }
  }

  if (
    heuristicState.stage === 'implementing' &&
    (progress.implementationReady || progress.acceptanceInProgress)
  ) {
    return {
      ...heuristicState,
      stage: 'verifying',
    }
  }

  if (heuristicState.stage === 'verifying' && progress.acceptanceReady) {
    return {
      ...heuristicState,
      stage: 'completed',
    }
  }

  return heuristicState
}

export function buildBeaconStageTransitionFeedback(
  previousState: Pick<BeaconSessionState, 'changeId' | 'stage'>,
  nextState: Pick<BeaconSessionState, 'stage'>,
): string | null {
  if (previousState.stage === nextState.stage) {
    return null
  }

  const nextLabel = getBeaconStageLabel(nextState.stage)

  switch (nextState.stage) {
    case 'awaiting_approval':
      return `Beacon 已进入“${nextLabel}”阶段。需求和 proposal 已基本补齐，接下来会先给用户做最终确认。`
    case 'coordinating':
      return `Beacon 已进入“${nextLabel}”阶段。用户已明确同意开始开发，接下来先由 pm/planner 协调任务。`
    case 'implementing':
      return `Beacon 已进入“${nextLabel}”阶段。现在可以推进 frontend / backend 的实现与交接。`
    case 'verifying':
      return `Beacon 已进入“${nextLabel}”阶段。前后端实现已基本就绪，接下来由 QA 做验收收口。`
    case 'completed':
      return `Beacon 已进入“${nextLabel}”阶段。当前 change 已完成验收收口，可以输出最终总结。`
    case 'clarifying':
      return previousState.stage === 'completed'
        ? `Beacon 已重新回到“${nextLabel}”阶段。检测到用户追加了新改动，请先补全需求再继续。`
        : `Beacon 已进入“${nextLabel}”阶段。请继续补全需求和方案细节。`
  }
}

export function buildBeaconStartFeedback(
  state: Pick<BeaconSessionState, 'stage'>,
): string {
  return state.stage === 'awaiting_approval'
    ? 'Beacon 已启动，当前需求已经基本补齐，接下来会先向用户做最终确认。'
    : 'Beacon 已启动，当前先进入“需求补全”阶段，接下来会主动梳理需求并完善 openspec 文档。'
}

export function buildBeaconActiveMetaPrompt(
  state: BeaconSessionState,
  userInput: string,
): string {
  const approvalMatched = isBeaconExplicitApproval(userInput)
  const effectiveStage =
    approvalMatched && state.stage !== 'completed' ? 'coordinating' : state.stage
  const phase: BeaconPhase =
    effectiveStage === 'clarifying' || effectiveStage === 'awaiting_approval'
      ? 'clarification'
      : 'implementation'

  const stagePrompt =
    effectiveStage === 'clarifying'
      ? buildClarifyingStagePrompt(state)
      : effectiveStage === 'awaiting_approval'
        ? buildAwaitingApprovalStagePrompt(state)
        : effectiveStage === 'coordinating'
          ? buildCoordinatingStagePrompt(state)
          : effectiveStage === 'implementing'
            ? buildImplementingStagePrompt(state)
            : effectiveStage === 'verifying'
              ? buildVerifyingStagePrompt(state)
              : buildCompletedStagePrompt(state)

  return `# Beacon Session Context

Change id: ${state.changeId}
Mode: ${state.mode}
Current phase: ${phase}
Current stage: ${effectiveStage}
User input this turn: ${userInput}
Explicit approval detected this turn: ${approvalMatched ? 'yes' : 'no'}

${stagePrompt}
`
}

export function registerBeaconSkill(): void {
  registerBundledSkill({
    name: 'beacon',
    description:
      'Start or continue the Beacon delivery flow: clarify requirements, write openspec proposals, ask for explicit approval, then coordinate frontend/backend/qa implementation.',
    argumentHint: '<feature request or openspec markdown path>',
    whenToUse:
      'Use when the user wants to start a strong, guided delivery flow from a feature request or continue from an existing openspec markdown file.',
    allowedTools: [
      'Read',
      'Write',
      'Edit',
      'Glob',
      'Grep',
      'Task',
      'TodoWrite',
      'Bash',
    ],
    disableModelInvocation: true,
    userInvocable: true,
    files: {
      'workflow/BEACON_FLOW.md': `# Beacon Flow

Beacon is a four-step delivery loop:

1. Clarify the user's request with proactive follow-up questions.
2. Keep OpenSpec-style documents updated in the current change directory.
3. Summarize the final scope and ask for explicit approval to start development.
4. After approval, coordinate pm/planner, frontend, backend, and qa work.

Never skip the approval gate.
`,
      'workflow/APPROVAL_RULES.md': `# Explicit Approval Rules

Implementation may begin only after a clear user confirmation phrase.

Accepted examples:
- 开始开发
- 确认开始
- 开始
- 继续开发

If the user says anything less explicit, remain in clarification/proposal mode.
`,
      'workflow/IMPLEMENTATION_PLAYBOOK.md': `# Beacon Implementation Playbook

When Beacon enters implementation mode:

1. Read overview.md, proposal.md, design.md, tasks.md, frontend/proposal.md, backend/proposal.md, qa/proposal.md.
2. Produce a short implementation plan.
3. Delegate role-specific work with the Task tool.
4. Prefer frontend and backend tasks in parallel when dependencies allow.
5. Bring QA in after implementation is ready for verification.
6. Update qa/acceptance.md before the final handoff.
7. Keep overview.md execution markers aligned with the current stage.

Minimum execution shape:
- pm/planner: confirm task order, dependency edges, and what "done" means
- frontend: implement UI and client-side contract integration
- backend: implement API/data changes and validation logic
- qa: verify implemented behavior, run tests, and record verified/unverified areas

Execution markers in overview.md:
- coordination_brief: pending -> ready
- frontend_handoff: pending -> ready
- backend_handoff: pending -> ready
- qa_status: pending -> in_progress -> completed
`,
      'workflow/HANDOFF_TEMPLATE.md': `# Beacon Final Handoff Template

Use this exact section structure in the final closeout:

## Tests Run
- list commands or checks that actually ran

## Verified
- list behaviors that were verified

## Unverified
- list anything not verified, skipped, or still risky

## Acceptance Summary
- one concise summary of readiness and remaining caveats

Execution status writeback:
- set coordination_brief: ready after PM/planner finalizes the execution brief
- set frontend_handoff: ready after frontend handoff is ready
- set backend_handoff: ready after backend handoff is ready
- set qa_status: completed after QA acceptance closeout is complete
`,
      'workflow/ROLE_TASK_TEMPLATES.md': `# Beacon Role Task Templates

These are the default task shapes Beacon should use in implementation mode.

## pm/planner
- read overview + proposal + design + tasks + all role proposals
- confirm dependency order and parallelism
- return an execution brief
- update overview.md and set coordination_brief: ready once the brief is finalized

## frontend
- read overview + design + tasks + frontend proposal + backend proposal
- implement approved UI/client behavior
- report changed files and checks run
- update overview.md and set frontend_handoff: ready once the frontend handoff is ready

## backend
- read overview + design + tasks + backend proposal + qa proposal
- implement approved API/data changes
- report changed files and checks run
- update overview.md and set backend_handoff: ready once the backend handoff is ready

## qa
- read overview + proposal + design + tasks + all role proposals + qa/acceptance.md
- verify behavior and update acceptance.md
- return Tests Run / Verified / Unverified / Acceptance Summary
- keep qa_status: in_progress during verification and set qa_status: completed at final closeout
`,
      'roles/PM_PLANNER.md': `# PM / Planner Role

Responsibilities:
- turn clarified requirements into an implementation-ready plan
- keep frontend, backend, and QA scopes aligned
- identify parallelizable work
- make the proposal set internally consistent before implementation starts
`,
      'roles/FRONTEND.md': `# Frontend Role

Responsibilities:
- UI fields, form behavior, validation, and user flows
- mapping backend contract changes into the front-end experience
- documenting any frontend acceptance points in frontend/proposal.md
`,
      'roles/BACKEND.md': `# Backend Role

Responsibilities:
- API and persistence changes
- data compatibility and validation logic
- documenting contract updates in backend/proposal.md
`,
      'roles/QA.md': `# QA Role

Responsibilities:
- define test scope and acceptance checks
- verify implemented behavior against the approved proposals
- report both verified and unverified areas before completion
`,
    },
    async getPromptForCommand(args, context) {
      const cwd = process.cwd()
      const fallbackProjectRoot =
        context?.getAppState?.().beacon?.projectRoot
      const workspace = await scaffoldWorkspace(args, cwd, fallbackProjectRoot)
      const docs = await normalizeBeaconWorkspaceDocs(workspace)
      const currentPhase = inferPhaseFromOverview(docs.overview)
      const currentStage = inferStageFromOverview(docs.overview)

      const modeText =
        workspace.mode === 'existing'
          ? `You are CONTINUING an existing Beacon change from files under ${workspace.targetPath}.`
          : `You are STARTING a new Beacon change and the initial files have already been scaffolded under ${workspace.targetPath}.`

      const prompt = `# Beacon Flow

${modeText}

Working directory: ${cwd}
Change id: ${workspace.changeId}
Current phase: ${currentPhase}
Current stage: ${currentStage}

Beacon is the ONLY user-facing entrypoint for this flow. The user should not be asked to install or invoke OpenSpec, Superpowers, or Oh My Agent manually.

## Source of truth files

- Overview: \`${workspace.overviewPath}\`
- Proposal: \`${workspace.proposalPath}\`
- Design: \`${workspace.designPath}\`
- Tasks: \`${workspace.tasksPath}\`
- Frontend proposal: \`${workspace.frontendProposalPath}\`
- Backend proposal: \`${workspace.backendProposalPath}\`
- QA proposal: \`${workspace.qaProposalPath}\`
- QA acceptance: \`${workspace.qaAcceptancePath}\`

## Operating model

Beacon internally follows these principles:
- Superpowers-style brainstorming for proactive multi-round requirement clarification
- OpenSpec-style documentation under \`openspec/changes/<change-id>/...\`
- Oh-My-Agent-style role handoff for implementation

Use them as internal behavior rules. Do not burden the user with those names unless they ask.

## Required phases

### Phase 1: Brainstorming and clarification

You MUST actively clarify the request before implementation.
- Ask focused follow-up questions when anything is ambiguous
- Keep the standard OpenSpec artifacts updated:
  - \`${workspace.proposalPath}\`
  - \`${workspace.designPath}\`
  - \`${workspace.tasksPath}\`
- Separate frontend, backend, and QA concerns
- Update the proposal files as understanding improves
- Keep \`${workspace.overviewPath}\` as the high-level summary

### Phase 2: Proposal completion

Before asking to start development, make sure these files are meaningfully filled in:
- \`${workspace.proposalPath}\`
- \`${workspace.designPath}\`
- \`${workspace.tasksPath}\`
- \`${workspace.frontendProposalPath}\`
- \`${workspace.backendProposalPath}\`
- \`${workspace.qaProposalPath}\`

The proposals should reflect the final clarified scope, not placeholders.

### Phase 3: Explicit approval gate

When you believe the scope is complete:
1. Summarize the final implementation scope for the user
2. Point them to the proposal files
3. Ask whether to start development

Do NOT start implementation unless the user gives an explicit confirmation phrase such as:
- "开始开发"
- "确认开始"
- "开始"
- "继续开发"

If the user has not clearly approved, stay in clarification/proposal mode.

### Phase 4: Implementation

After explicit approval:
- Treat the overview + proposal/design/tasks + role proposals as the implementation contract
- Produce a concise execution plan
- Coordinate these roles:
  - pm/planner
  - frontend
  - backend
  - qa
- Prefer frontend and backend work in parallel when safe
- QA comes after implementation work is ready for verification

Use these internal workflow files during implementation:
- \`workflow/IMPLEMENTATION_PLAYBOOK.md\`
- \`workflow/HANDOFF_TEMPLATE.md\`
- \`workflow/ROLE_TASK_TEMPLATES.md\`

During implementation, strongly follow these disciplines:
- plan before coding
- test-driven-development mindset for behavior changes
- code review before declaring success
- verification-before-completion before final handoff
- final output should follow the Beacon handoff template structure exactly

### Phase 5: Verification and acceptance

Before completion you MUST:
- update \`${workspace.qaAcceptancePath}\`
- run relevant tests when possible
- report what was verified
- report what was NOT verified
- provide a clear acceptance summary

## Existing overview snapshot

${docs.overview || '(No overview content yet beyond the scaffold.)'}

## Response style for this flow

- Be proactive and structured
- Keep the user experience simple
- The user should feel that "/beacon <request>" is enough to get moving
- Prefer updating the openspec files as you learn more rather than holding the whole plan only in chat

## Immediate instruction

Start Phase 1 now.
- If the input points to existing Beacon/OpenSpec markdown, first read the relevant files and summarize the current state.
- Otherwise, treat the raw args as the initial feature request and begin clarifying it.
- Update the standard OpenSpec files and role proposal files during the conversation as understanding improves.
`

      return [{ type: 'text', text: prompt }]
    },
  })
}
