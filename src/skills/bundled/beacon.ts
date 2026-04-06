import { access, mkdir, readFile, writeFile } from 'fs/promises'
import { constants as fsConstants } from 'fs'
import os from 'os'
import { createHash } from 'crypto'
import { basename, dirname, isAbsolute, join, resolve } from 'path'
import { registerBundledSkill } from '../bundledSkills.js'
import { getCwd } from '../../utils/cwd.js'
import {
  buildFinalCloseoutTemplateBlock,
  containsPlaceholder,
  ensureExecutionStatusSection,
  getAcceptanceGuideBlock,
  getExecutionStatusGuideBlock,
  getProposalTemplateBlock,
  getReviewTemplateBlock,
  getReviewGuideBlock,
  getBackendQuestionBankBlock,
  getSecurityQuestionBankBlock,
  isAcceptanceComplete,
  isAcceptanceInProgress,
  isProposalComplete,
  isStandardArtifactComplete,
  isReviewComplete,
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
  changeTitle: string
  projectRoot: string
  targetPath: string
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
      changeId: string
      changeTitle: string
    }
  | {
      mode: 'new'
      projectRoot: string
      targetPath: string
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
      changeId: string
      changeTitle: string
    }

export const BEACON_EXPLICIT_APPROVAL_PHRASES = [
  '开始开发',
  '确认开始',
  '开始',
  '继续开发',
] as const

const BEACON_REOPEN_PATTERN =
  /(继续修改|继续优化|继续补充|补充需求|新增需求|新增功能|需要调整|再改|返工|重做|reopen|follow-up|more work|need changes)/i

type BeaconRole =
  | 'pm/planner'
  | 'architecture-reviewer'
  | 'backend-auditor'
  | 'security-threat-modeler'
  | 'security-auditor'
  | 'senior-reviewer'
  | 'frontend'
  | 'backend'
  | 'qa'

type BeaconTaskTemplate = {
  role: BeaconRole
  filesToRead: string[]
  writeScope?: string[]
  responsibilities: string[]
  deliverables: string[]
  executionStatusUpdate?: {
    path: string
    marker:
      | 'coordination_brief'
      | 'review_status'
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
  reviewReady: boolean
  securityReady: boolean
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
      writeScope: [state.overviewPath],
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
      role: 'architecture-reviewer',
      filesToRead: [
        state.overviewPath,
        state.proposalPath,
        state.designPath,
        state.tasksPath,
        state.reviewArchitecturePath,
        state.reviewRiskRegisterPath,
        state.frontendProposalPath,
        state.backendProposalPath,
        state.qaProposalPath,
      ],
      writeScope: [state.reviewArchitecturePath],
      responsibilities: [
        'audit the proposed solution for feasibility, hidden coupling, and missed edge cases',
        'audit the architecture, scope boundaries, and data-flow shape',
        'write the architecture review and surface blockers before approval',
        'keep the architecture review aligned with the latest clarified scope',
      ],
      deliverables: [
        'an architecture review',
        'architecture-specific blocker / warning / note findings',
        'open questions that still need backend or PM follow-up',
      ],
      constraints: [
        'Review the proposal; do not quietly rewrite the product scope.',
        'Escalate blockers explicitly so the user can decide before implementation starts.',
      ],
    },
    {
      role: 'backend-auditor',
      filesToRead: [
        state.overviewPath,
        state.proposalPath,
        state.designPath,
        state.tasksPath,
        state.reviewBackendAuditPath,
        state.reviewBackendQuestionBankPath,
        state.reviewRiskRegisterPath,
        state.backendProposalPath,
        state.qaProposalPath,
      ],
      writeScope: [state.reviewBackendAuditPath, state.reviewBackendQuestionBankPath],
      responsibilities: [
        'audit the backend stack choice for compatibility, runtime, and dependency risks',
        'pressure-test counters, idempotency, concurrency, cache/queue usage, migration, recovery, and observability',
        'write the backend audit and expand backend-specific risk notes when assumptions are weak',
        'use the backend question bank whenever a backend path looks fragile or underspecified',
      ],
      deliverables: [
        'a backend audit',
        'backend-specific risk findings and question-bank pressure tests',
        'any follow-up questions needed before the senior reviewer can finalize the verdict',
      ],
      constraints: [
        'Do not approve the change on behalf of the senior reviewer.',
        'Call out attack surface, performance traps, and runtime assumptions explicitly.',
      ],
    },
    {
      role: 'security-threat-modeler',
      filesToRead: [
        state.overviewPath,
        state.proposalPath,
        state.designPath,
        state.tasksPath,
        state.reviewSecurityThreatModelPath,
        state.reviewSecurityQuestionBankPath,
        state.reviewRiskRegisterPath,
        state.frontendProposalPath,
        state.backendProposalPath,
        state.qaProposalPath,
      ],
      writeScope: [state.reviewSecurityThreatModelPath, state.reviewSecurityQuestionBankPath],
      responsibilities: [
        'model the threat surface from an attacker-first point of view',
        'document assets, trust boundaries, entry points, abuse cases, and mitigations',
        'call out security assumptions that look unsafe, vague, or untested',
        'use the security question bank to pressure-test login, session, and abuse resistance flows',
      ],
      deliverables: [
        'a security threat model',
        'attack surface / abuse-case findings',
        'security follow-up questions for the auditor or senior reviewer',
      ],
      constraints: [
        'Think like a malicious user or automated attacker, not a normal user.',
        'Do not approve the change; only map and explain the threat surface.',
      ],
    },
    {
      role: 'security-auditor',
      filesToRead: [
        state.overviewPath,
        state.proposalPath,
        state.designPath,
        state.tasksPath,
        state.reviewSecurityThreatModelPath,
        state.reviewSecurityAuditPath,
        state.reviewSecurityQuestionBankPath,
        state.reviewRiskRegisterPath,
        state.frontendProposalPath,
        state.backendProposalPath,
        state.qaProposalPath,
      ],
      writeScope: [state.reviewSecurityAuditPath],
      responsibilities: [
        'audit authentication, authorization, session handling, and abuse resistance',
        'verify frontend trust assumptions, logging hygiene, and secret handling',
        'pressure-test brute force, enumeration, replay, tampering, and rate limiting',
        'write the security audit and surface blockers or weak mitigations explicitly',
      ],
      deliverables: [
        'a security audit',
        'security blocker / warning / note findings',
        'any extra mitigations needed before approval',
      ],
      constraints: [
        'Do not approve the change on behalf of the senior reviewer.',
        'Treat the browser as hostile and the server as the final authority.',
      ],
    },
    {
      role: 'senior-reviewer',
      filesToRead: [
        state.overviewPath,
        state.proposalPath,
        state.designPath,
        state.tasksPath,
        state.reviewArchitecturePath,
        state.reviewBackendAuditPath,
        state.reviewSecurityThreatModelPath,
        state.reviewSecurityAuditPath,
        state.reviewSecurityQuestionBankPath,
        state.reviewRiskRegisterPath,
        state.reviewBackendQuestionBankPath,
        state.frontendProposalPath,
        state.backendProposalPath,
        state.qaProposalPath,
      ],
      writeScope: [state.reviewRiskRegisterPath, state.overviewPath],
      responsibilities: [
        'synthesize the architecture review, backend audit, and security findings into a final go/no-go verdict',
        'write a prioritized risk register with blocker / warning / note callouts',
        'make the review docs internally consistent before approval',
        'set the review gate only after the review findings are complete',
      ],
      deliverables: [
        'a consolidated review verdict',
        'a risk register with blocker / warning / note callouts',
        'the final go/no-go recommendation for the change',
      ],
      executionStatusUpdate: {
        path: state.overviewPath,
        marker: 'review_status',
        value: 'completed',
        when: 'after the consolidated review verdict and risk register are finalized',
      },
      constraints: [
        'Do not erase specialist findings; synthesize them.',
        'Escalate blockers explicitly so the user can decide before implementation starts.',
      ],
    },
    {
      role: 'frontend',
      filesToRead: [
        state.overviewPath,
        state.designPath,
        state.tasksPath,
        state.reviewArchitecturePath,
        state.reviewBackendAuditPath,
        state.reviewSecurityThreatModelPath,
        state.reviewSecurityAuditPath,
        state.reviewSecurityQuestionBankPath,
        state.reviewRiskRegisterPath,
        state.reviewBackendQuestionBankPath,
        state.frontendProposalPath,
        state.backendProposalPath,
      ],
      writeScope: [state.frontendProposalPath],
      responsibilities: [
        'implement the approved UI and client behavior',
        'wire any frontend contract changes needed for the approved backend shape',
        'keep the UI resilient against tampering, redirect abuse, and client-trust assumptions',
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
        state.reviewArchitecturePath,
        state.reviewBackendAuditPath,
        state.reviewSecurityThreatModelPath,
        state.reviewSecurityAuditPath,
        state.reviewSecurityQuestionBankPath,
        state.reviewRiskRegisterPath,
        state.reviewBackendQuestionBankPath,
        state.backendProposalPath,
        state.qaProposalPath,
      ],
      writeScope: [state.backendProposalPath],
      responsibilities: [
        'implement the approved API, validation, and persistence changes',
        'preserve compatibility expectations documented in the proposal',
        'treat authentication, authorization, replay, brute force, and tampering as first-class constraints',
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
        state.reviewArchitecturePath,
        state.reviewBackendAuditPath,
        state.reviewSecurityThreatModelPath,
        state.reviewSecurityAuditPath,
        state.reviewSecurityQuestionBankPath,
        state.reviewRiskRegisterPath,
        state.reviewBackendQuestionBankPath,
        state.frontendProposalPath,
        state.backendProposalPath,
        state.qaProposalPath,
        state.qaAcceptancePath,
      ],
      writeScope: [state.qaProposalPath, state.qaAcceptancePath],
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
    `You are the Beacon ${template.role} worker for change ${state.changeTitle} (${state.changeId}).`,
    '',
    'Read:',
    ...template.filesToRead.map(path => `- ${path}`),
    ...(template.writeScope
      ? ['', 'Write only:', ...template.writeScope.map(path => `- ${path}`)]
      : []),
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
        mode: 'parallel',
        roles: [
          'pm/planner',
          'architecture-reviewer',
          'backend-auditor',
          'security-threat-modeler',
          'security-auditor',
          'senior-reviewer',
        ],
        goal: 'Confirm scope, dependency order, and the execution brief while specialist reviewers audit architecture, backend, and security risks before coding starts, then let the senior reviewer synthesize the verdict.',
      },
      {
        name: 'implementation',
        mode: 'parallel',
        roles: ['frontend', 'backend'],
        goal: 'Dispatch frontend and backend together in the same turn, then implement the approved UI/client and API/data changes in parallel when dependencies allow.',
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
      role: 'architecture-reviewer',
      stageName: 'coordination',
      waitFor: 'the architecture review findings',
      purpose:
        'audit the proposed architecture for feasibility, hidden coupling, and scope boundary risks before approval',
    },
    {
      role: 'backend-auditor',
      stageName: 'coordination',
      waitFor: 'the backend audit and backend question-bank pressure test',
      purpose:
        'audit the backend stack, data contract, and runtime behavior for compatibility, security, and recovery risks before approval',
    },
    {
      role: 'security-threat-modeler',
      stageName: 'coordination',
      waitFor: 'the security threat model and attack-surface map',
      purpose:
        'map the attacker-first threat surface, trust boundaries, and abuse cases before approval',
    },
    {
      role: 'security-auditor',
      stageName: 'coordination',
      waitFor: 'the security audit and abuse-resistance verdict',
      purpose:
        'audit authentication, authorization, session handling, tampering resistance, and abuse controls before approval',
    },
    {
      role: 'senior-reviewer',
      stageName: 'coordination',
      waitFor: 'the architecture review, backend audit, security audit, and risk register',
      purpose:
        'synthesize specialist findings into a final blocker / warning / note verdict before approval',
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
- launch architecture-reviewer, backend-auditor, security-threat-modeler, and security-auditor in the same coordination window so specialist audits happen in parallel with planning
- launch senior-reviewer after the specialist findings are ready so the verdict is synthesized explicitly
- assign a single owner to each writable file path; never have two workers write the same proposal/review/acceptance file in parallel
- when a worker needs to influence another file, return the finding instead of editing a non-owned file
- after pm/planner returns, launch frontend and backend as the default parallel pair in the same turn unless the execution brief explicitly says one blocks the other
- dispatch both frontend and backend Task delegations before waiting on either one; do not let the first result delay launching the second
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
- Architecture review: \`${state.reviewArchitecturePath}\`
- Backend audit: \`${state.reviewBackendAuditPath}\`
- Security threat model: \`${state.reviewSecurityThreatModelPath}\`
- Security audit: \`${state.reviewSecurityAuditPath}\`
- Risk register: \`${state.reviewRiskRegisterPath}\`
- Backend question bank: \`${state.reviewBackendQuestionBankPath}\`
- Security question bank: \`${state.reviewSecurityQuestionBankPath}\`
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

function buildBeaconReviewTrackPrompt(state: BeaconSessionState): string {
  const architectureReviewer = getBeaconTaskTemplates(state).find(
    t => t.role === 'architecture-reviewer',
  )!
  const backendAuditor = getBeaconTaskTemplates(state).find(
    t => t.role === 'backend-auditor',
  )!
  const securityThreatModeler = getBeaconTaskTemplates(state).find(
    t => t.role === 'security-threat-modeler',
  )!
  const securityAuditor = getBeaconTaskTemplates(state).find(
    t => t.role === 'security-auditor',
  )!
  const seniorReviewer = getBeaconTaskTemplates(state).find(
    t => t.role === 'senior-reviewer',
  )!

  return `## Beacon Review Track

Use this parallel audit track to catch architecture, backend, and security problems before approval:

- architecture reviewer: audit the architecture fit, implementation feasibility, and hidden coupling
- backend auditor: audit the backend/data contract shape, dependency plan, runtime compatibility, and question-bank pressure tests
- security threat modeler: map the attacker-first threat surface, trust boundaries, and abuse cases
- security auditor: audit authentication, authorization, session handling, tampering resistance, and abuse controls
- senior reviewer: synthesize the specialist findings, write the risk register, and decide the final blocker / warning / note verdict
- reuse the backend question bank when a backend proposal is vague, risky, or likely to rely on hidden assumptions
- reuse the security question bank when a flow touches login, session, identity, secrets, redirects, rate limits, or hostile client behavior
- update \`${state.reviewArchitecturePath}\`, \`${state.reviewBackendAuditPath}\`, and \`${state.reviewRiskRegisterPath}\`
- update \`${state.reviewSecurityThreatModelPath}\`, \`${state.reviewSecurityAuditPath}\`, and \`${state.reviewSecurityQuestionBankPath}\`
- keep \`review_status\` and \`security_status\` in \`${state.overviewPath}\` moving from \`pending\` to \`in_progress\` and then \`completed\` as the audit progresses

${formatBeaconTaskTemplate(state, architectureReviewer)}

${formatBeaconTaskTemplate(state, backendAuditor)}

${formatBeaconTaskTemplate(state, securityThreatModeler)}

${formatBeaconTaskTemplate(state, securityAuditor)}

${formatBeaconTaskTemplate(state, seniorReviewer)}`
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
    stage === 'clarifying'
      ? [
          '- Keep all execution markers pending while Beacon is still clarifying scope.',
          '- Keep `review_status` pending until the review track has actually audited the architecture and backend stack.',
          '- Keep `security_status` pending until the security track has actually modeled threats and audited abuse resistance.',
          '- Do not mark implementation progress in overview.md before explicit approval.',
        ]
      : stage === 'awaiting_approval'
        ? [
            '- Keep `coordination_brief`, `frontend_handoff`, `backend_handoff`, and `qa_status` pending until development starts.',
            '- Keep `review_status: completed` as the review gate that already ran before approval.',
            '- Keep `security_status: completed` as the security gate that already ran before approval.',
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
            '- Keep `review_status: completed` in place as the pre-implementation audit gate; if the review track reveals new blockers, return to clarification instead of forcing implementation.',
            '- Keep `security_status: completed` in place as the security audit gate; if the security track reveals new blockers, return to clarification instead of forcing implementation.',
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
- keep the review docs updated in parallel so the architecture review, backend audit, security threat model, and security audit are available before approval
- keep \`clarification_gate: pending\` in \`${state.overviewPath}\` until those follow-up questions have been asked and resolved, or the user explicitly waives more clarification
- only set \`clarification_gate: ready\` after the proposals and overview reflect the clarified answers
- do NOT start implementation yet unless the user gives an explicit confirmation phrase
- accepted confirmation phrases are: ${BEACON_EXPLICIT_APPROVAL_PHRASES.map(phrase => `"${phrase}"`).join(', ')}

${buildSuperpowersDisciplineBlock('clarifying', state)}

${buildBeaconReviewTrackPrompt(state)}

${buildExecutionStatusHelper(state, 'clarifying')}`
}

function buildAwaitingApprovalStagePrompt(state: BeaconSessionState): string {
  return `Beacon is ACTIVE and waiting for explicit approval.

${buildBeaconFileReferenceBlock(state)}

Required behavior:
- summarize the clarified scope and technical approach
- summarize the review verdict, backend audit, security audit, and any blockers or warnings that should be visible to the user
- point the user to the proposal files and security docs
- ask whether to start development
- preserve \`clarification_gate: ready\` in \`${state.overviewPath}\` unless the user introduces new ambiguity or follow-up work
- do NOT implement anything until the user gives an explicit confirmation phrase

${buildSuperpowersDisciplineBlock('awaiting_approval', state)}

${buildBeaconReviewTrackPrompt(state)}

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
- dispatch both frontend and backend Task delegations before you inspect either worker's output
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
- the closeout must prove three gates: build must pass, API smoke test must pass, and page-level contract checks must pass
- build and execute a test matrix that covers happy paths, negative paths, regression risks, and security/abuse checks when applicable
- run relevant tests/checks when possible, and record the exact commands/results for the three gates
- compare observed behavior against the approved proposal set, not just the implementation summary
- escalate any mismatch immediately instead of smoothing it over in the final closeout
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

function extractChangeTitle(input: string): string {
  const lines = input
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return 'change'

  const firstHeading = lines.find(line => /^#{1,6}\s+/.test(line))
  if (firstHeading) {
    return firstHeading.replace(/^#{1,6}\s+/, '').trim() || 'change'
  }

  const firstLine = lines[0]
  return firstLine.replace(/^[\s>*-]+/, '').trim() || 'change'
}

function currentDateStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 8)
}

function buildChangeId(input: string): string {
  const hash = shortHash(input)
  return `${currentDateStamp()}-c-${hash}`
}

function buildChangeTitle(input: string): string {
  const title = extractChangeTitle(input)
  return title || 'New change request'
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
    reviewArchitecturePath: join(changeRoot, 'review', 'architecture-review.md'),
    reviewBackendAuditPath: join(changeRoot, 'review', 'backend-audit.md'),
    reviewRiskRegisterPath: join(changeRoot, 'review', 'risk-register.md'),
    reviewBackendQuestionBankPath: join(
      changeRoot,
      'review',
      'backend-question-bank.md',
    ),
    reviewSecurityThreatModelPath: join(
      changeRoot,
      'review',
      'security-threat-model.md',
    ),
    reviewSecurityAuditPath: join(changeRoot, 'review', 'security-audit.md'),
    reviewSecurityQuestionBankPath: join(
      changeRoot,
      'review',
      'security-question-bank.md',
    ),
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
      const changeTitle = buildChangeTitle(trimmed || changeId)
      const workspace = {
        mode: 'existing' as const,
        ...getPathsForChange(existingChangeRoot, changeId),
        changeTitle,
      }
      await ensureWorkspaceFiles(workspace, trimmed || changeId)
      return workspace
    }
  }

  const changeId = buildChangeId(trimmed)
  const changeTitle = buildChangeTitle(trimmed)
  const projectRoot = resolvedTargetPath ?? fallbackProjectRoot ?? cwd
  const changeRoot = join(projectRoot, 'openspec', 'changes', changeId)
  const workspace = {
    mode: 'new' as const,
    ...getPathsForChange(changeRoot, changeId),
    changeTitle,
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

  if (
    basename(candidate) === 'architecture-review.md' ||
    basename(candidate) === 'backend-audit.md' ||
    basename(candidate) === 'security-threat-model.md' ||
    basename(candidate) === 'security-audit.md' ||
    basename(candidate) === 'tech-solution-review.md' ||
    basename(candidate) === 'stack-audit.md' ||
    basename(candidate) === 'risk-register.md' ||
    basename(candidate) === 'backend-question-bank.md' ||
    basename(candidate) === 'security-question-bank.md'
  ) {
    return resolve(candidate, '..', '..')
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
  await mkdir(join(workspace.targetPath, 'review'), { recursive: true })

  await scaffoldFile(
    workspace.overviewPath,
    `# Beacon Overview\n\n## Change\n${title}\n\n## Status\n- phase: brainstorming\n- stage: clarifying\n- development_approved: no\n- clarification_gate: pending\n\n## Execution Status\n- coordination_brief: pending\n- review_status: pending\n- security_status: pending\n- frontend_handoff: pending\n- backend_handoff: pending\n- qa_status: pending\n\n${getExecutionStatusGuideBlock()}## User Request\n${title}\n\n## Scope Summary\n- Pending clarification\n\n## Approval\n- Waiting for explicit user confirmation phrase before implementation starts.\n`,
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
    workspace.reviewArchitecturePath,
    getReviewTemplateBlock('architecture-review'),
  )
  await scaffoldFile(
    workspace.reviewBackendAuditPath,
    getReviewTemplateBlock('backend-audit'),
  )
  await scaffoldFile(
    workspace.reviewSecurityThreatModelPath,
    getReviewTemplateBlock('security-threat-model'),
  )
  await scaffoldFile(
    workspace.reviewSecurityAuditPath,
    getReviewTemplateBlock('security-audit'),
  )
  await scaffoldFile(
    workspace.reviewRiskRegisterPath,
    `# Risk Register\n\n## Executive Summary\nPending clarification\n\n## Findings\n- TBD\n\n## Decision\n- TBD\n\n## Follow-ups\n- TBD\n\n${getReviewGuideBlock('risk-register')}`,
  )
  await scaffoldFile(
    workspace.reviewBackendQuestionBankPath,
    `# Backend Question Bank\n\n${getBackendQuestionBankBlock()}\n`,
  )
  await scaffoldFile(
    workspace.reviewSecurityQuestionBankPath,
    `# Security Question Bank\n\n${getSecurityQuestionBankBlock()}\n`,
  )
  await scaffoldFile(
    workspace.frontendProposalPath,
    getProposalTemplateBlock('frontend'),
  )
  await scaffoldFile(
    workspace.backendProposalPath,
    getProposalTemplateBlock('backend'),
  )
  await scaffoldFile(
    workspace.qaProposalPath,
    getProposalTemplateBlock('qa'),
  )
  await scaffoldFile(
    workspace.qaAcceptancePath,
    `# QA Acceptance\n\n## Build Check\n- Pending implementation\n\n## API Smoke Test\n- Pending implementation\n\n## Page Contract Check\n- Pending implementation\n\n## Tests Run\n- Pending implementation\n\n## Verified\n- TBD\n\n## Unverified\n- TBD\n\n## Acceptance Summary\n- Pending verification\n\n${getAcceptanceGuideBlock()}`,
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
  const reviewReady =
    isReviewComplete(docs.reviewArchitecture, 'architecture-review') &&
    isReviewComplete(docs.reviewBackendAudit, 'backend-audit') &&
    isReviewComplete(docs.reviewRiskRegister, 'risk-register')
  const securityReady =
    isReviewComplete(docs.reviewSecurityThreatModel, 'security-threat-model') &&
    isReviewComplete(docs.reviewSecurityAudit, 'security-audit') &&
    !containsPlaceholder(docs.reviewSecurityQuestionBank, ['TBD', 'Pending clarification'])

  if (
    reviewReady &&
    securityReady &&
    readExecutionStatusMarker(docs.overview, 'review_status') !== 'completed'
  ) {
    const reviewedOverview = updateExecutionStatusMarker(
      docs.overview,
      'review_status',
      'completed',
    )
    await writeFile(workspace.overviewPath, reviewedOverview, 'utf8')
  }

  if (securityReady && readExecutionStatusMarker(docs.overview, 'security_status') !== 'completed') {
    const securedOverview = updateExecutionStatusMarker(
      docs.overview,
      'security_status',
      'completed',
    )
    await writeFile(workspace.overviewPath, securedOverview, 'utf8')
  }

  return {
    active: true,
    changeId: workspace.changeId,
    changeTitle: workspace.changeTitle,
    projectRoot: workspace.projectRoot,
    targetPath: workspace.targetPath,
    overviewPath: workspace.overviewPath,
    proposalPath: workspace.proposalPath,
    designPath: workspace.designPath,
    tasksPath: workspace.tasksPath,
    reviewArchitecturePath: workspace.reviewArchitecturePath,
    reviewBackendAuditPath: workspace.reviewBackendAuditPath,
    reviewRiskRegisterPath: workspace.reviewRiskRegisterPath,
    reviewBackendQuestionBankPath: workspace.reviewBackendQuestionBankPath,
    reviewSecurityThreatModelPath: workspace.reviewSecurityThreatModelPath,
    reviewSecurityAuditPath: workspace.reviewSecurityAuditPath,
    reviewSecurityQuestionBankPath: workspace.reviewSecurityQuestionBankPath,
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
  const reviewArchitecture = docs.reviewArchitecture
  const reviewBackendAudit = docs.reviewBackendAudit
  const reviewRiskRegister = docs.reviewRiskRegister
  const reviewSecurityThreatModel = docs.reviewSecurityThreatModel
  const reviewSecurityAudit = docs.reviewSecurityAudit
  const reviewSecurityQuestionBank = docs.reviewSecurityQuestionBank
  const frontend = docs.frontendProposal
  const backend = docs.backendProposal
  const qa = docs.qaProposal
  const acceptance = docs.qaAcceptance

  const proposalsReady =
    !containsPlaceholder(overview, ['Pending clarification']) &&
    isProposalComplete(frontend, 'frontend') &&
    isProposalComplete(backend, 'backend') &&
    isProposalComplete(qa, 'qa')
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
  const reviewReady =
    isReviewComplete(reviewArchitecture, 'architecture-review') &&
    isReviewComplete(reviewBackendAudit, 'backend-audit') &&
    isReviewComplete(reviewRiskRegister, 'risk-register')
  const securityReady =
    isReviewComplete(reviewSecurityThreatModel, 'security-threat-model') &&
    isReviewComplete(reviewSecurityAudit, 'security-audit') &&
    !containsPlaceholder(reviewSecurityQuestionBank, ['TBD', 'Pending clarification'])
  const clarificationReady = readClarificationGateMarker(overview) === 'ready'
  const coordinationReady = readExecutionStatusMarker(overview, 'coordination_brief') === 'ready'
  const frontendReady = readExecutionStatusMarker(overview, 'frontend_handoff') === 'ready'
  const backendReady = readExecutionStatusMarker(overview, 'backend_handoff') === 'ready'
  const implementationReady = frontendReady && backendReady

  return {
    clarificationReady,
    standardArtifactsReady,
    proposalsReady,
    reviewReady,
    securityReady,
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
        progress.reviewReady &&
        progress.securityReady &&
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
  previousState: Pick<BeaconSessionState, 'changeId' | 'changeTitle' | 'stage'>,
  nextState: Pick<BeaconSessionState, 'stage'>,
): string | null {
  if (previousState.stage === nextState.stage) {
    return null
  }

  const nextLabel = getBeaconStageLabel(nextState.stage)

  switch (nextState.stage) {
    case 'awaiting_approval':
      return `Beacon 已进入“${nextLabel}”阶段。需求、方案、审查和安全文档已基本补齐，接下来会先给用户做最终确认。`
    case 'coordinating':
      return `Beacon 已进入“${nextLabel}”阶段。用户已明确同意开始开发，接下来先由 pm/planner 协调任务并保持审查结论一致。`
    case 'implementing':
      return `Beacon 已进入“${nextLabel}”阶段。现在可以推进 frontend / backend 的实现与交接，并保留安全约束。`
    case 'verifying':
      return `Beacon 已进入“${nextLabel}”阶段。前后端实现已基本就绪，接下来由 QA 做验收收口并复核安全风险。`
    case 'completed':
      return `Beacon 已进入“${nextLabel}”阶段。当前 change 已完成验收收口，可以输出最终总结。`
    case 'clarifying':
      return previousState.stage === 'completed'
        ? `Beacon 已重新回到“${nextLabel}”阶段。检测到用户追加了新改动，请先补全需求、方案和安全约束再继续。`
        : `Beacon 已进入“${nextLabel}”阶段。请继续补全需求、方案和安全约束。`
  }
}

export function buildBeaconStartFeedback(
  state: Pick<BeaconSessionState, 'stage' | 'changeTitle'>,
): string {
  return state.stage === 'awaiting_approval'
    ? `Beacon 已启动，当前 change「${state.changeTitle}」的需求、审查和安全文档已经基本补齐，接下来会先向用户做最终确认。`
    : `Beacon 已启动，当前先进入 change「${state.changeTitle}」的需求补全阶段，接下来会主动梳理需求、风险和安全约束并完善 openspec 文档。`
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

Change title: ${state.changeTitle}
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
      'Start or continue the Beacon delivery flow: clarify requirements, write openspec proposals, run specialist reviews, ask for explicit approval, then coordinate frontend/backend/qa implementation.',
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

Beacon is a multi-role delivery loop:

1. Clarify the user's request with proactive follow-up questions.
2. Keep OpenSpec-style documents updated in the current change directory.
3. Run the review track in parallel so architecture, backend, security, and senior-review risks surface before approval.
4. Summarize the final scope and ask for explicit approval to start development.
5. After approval, coordinate pm/planner, frontend expert, backend expert, and senior QA work.

Never skip the approval gate.
`,
      'workflow/REVIEW_PLAYBOOK.md': `# Beacon Review Playbook

The review track runs in parallel with clarification and planning.

It must:
- use a senior reviewer to synthesize the final go/no-go verdict
- let an architecture reviewer audit feasibility, hidden coupling, and scope boundaries
- let a backend auditor audit compatibility, runtime, dependency, and recovery risks
- let a security threat modeler map attacker-first abuse cases and trust boundaries
- let a security auditor verify authentication, authorization, session handling, and abuse resistance
- write a risk register with blocker / warning / note callouts
- update the review docs before Beacon asks for approval
- use the backend question bank whenever the backend path touches counters, caching, idempotency, concurrency, migrations, recovery, or observability
- use the security question bank whenever a flow touches login, session, identity, secrets, redirects, rate limits, or hostile client behavior

The review track should block approval if it finds a blocker that the user has not explicitly accepted.
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

1. Read overview.md, proposal.md, design.md, tasks.md, review/architecture-review.md, review/backend-audit.md, review/security-threat-model.md, review/security-audit.md, review/risk-register.md, frontend/proposal.md, backend/proposal.md, qa/proposal.md.
2. Produce a short implementation plan.
3. Delegate role-specific work with the Task tool.
4. Prefer frontend and backend tasks in parallel when dependencies allow.
5. Bring QA in after implementation is ready for verification.
6. Update qa/acceptance.md before the final handoff.
7. Keep overview.md execution markers aligned with the current stage.

Minimum execution shape:
- senior-reviewer: synthesize specialist findings, finalize the risk register, and set the review gate
- architecture-reviewer: audit architecture fit, feasibility, scope boundaries, and hidden coupling
- backend-auditor: audit backend stack, contracts, runtime behavior, and the question-bank pressure tests
- security-threat-modeler: map attacker-first abuse cases, trust boundaries, and threat scenarios
- security-auditor: audit authentication, authorization, session handling, tampering resistance, and abuse controls
- pm/planner: confirm task order, dependency edges, and what "done" means
- pm/planner: confirm task order, dependency edges, and explicitly mark frontend/backend as a parallel pair unless a real dependency blocks it
- frontend: implement UI and client-side contract integration, and keep screen states, validation, error handling, and edge cases aligned with the approved proposal
- backend: implement API/data changes and validation logic, and validate counters, idempotency, concurrency, cache/queue choices, recovery behavior, and security assumptions against the proposal and question banks
- qa: verify implemented behavior, run tests, and record verified/unverified areas

Execution markers in overview.md:
- coordination_brief: pending -> ready
- review_status: pending -> in_progress -> completed
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
- set review_status: completed after the review verdict is finalized
- set coordination_brief: ready after PM/planner finalizes the execution brief
- set frontend_handoff: ready after frontend handoff is ready
- set backend_handoff: ready after backend handoff is ready
- set qa_status: completed after QA acceptance closeout is complete
`,
      'workflow/ROLE_TASK_TEMPLATES.md': `# Beacon Role Task Templates

These are the default task shapes Beacon should use in implementation mode.

## architecture-reviewer
- read overview + proposal + design + tasks + architecture review + risk register + all role proposals
- audit architecture fit, feasibility, hidden coupling, and scope boundaries
- write the architecture review and surface blockers / warnings / notes early

## backend-auditor
- read overview + proposal + design + tasks + backend audit + backend question bank + risk register + backend proposal + qa proposal
- audit backend stack choice, contract shape, runtime behavior, and recovery risks
- pressure-test counters, idempotency, concurrency, cache/queue usage, migration, recovery, and observability

## security-threat-modeler
- read overview + proposal + design + tasks + security threat model + security question bank + risk register + frontend proposal + backend proposal + qa proposal
- model the threat surface from an attacker-first point of view
- document assets, trust boundaries, entry points, abuse cases, and mitigations

## security-auditor
- read overview + proposal + design + tasks + security threat model + security audit + security question bank + risk register + all role proposals
- audit authentication, authorization, session handling, tampering resistance, and abuse controls
- pressure-test brute force, enumeration, replay, redirect abuse, CSRF/XSS, and logging/secret handling

## senior-reviewer
- read overview + proposal + design + tasks + all review docs + all role proposals
- synthesize specialist findings into a final blocker / warning / note verdict
- write the prioritized risk register
- update overview.md and set review_status: completed once the review verdict is finalized

## pm/planner
- read overview + proposal + design + tasks + all role proposals
- confirm dependency order and parallelism
- return an execution brief
- update overview.md and set coordination_brief: ready once the brief is finalized

## frontend
- read overview + design + tasks + frontend proposal + backend proposal + security docs when the flow handles identity or hostile input
- implement approved UI/client behavior
- keep the implementation aligned with screen states, validation, empty/loading/error handling, accessibility, tampering resistance, and edge cases spelled out in frontend/proposal.md
- report changed files and checks run
- update overview.md and set frontend_handoff: ready once the frontend handoff is ready

## backend
- read overview + design + tasks + backend proposal + qa proposal + security docs when the flow handles identity or hostile input
- implement approved API/data changes
- pressure-test counters, idempotency, concurrency, cache/queue usage, migration, recovery, observability, and security assumptions against backend/proposal.md and the question banks
- report changed files and checks run
- update overview.md and set backend_handoff: ready once the backend handoff is ready

## qa
- read overview + proposal + design + tasks + all role proposals + qa/acceptance.md + security docs when applicable
- verify behavior and update acceptance.md
- prove the three gates: build pass, API smoke pass, page-level contract pass
- return Tests Run / Verified / Unverified / Acceptance Summary
- build a test matrix and verify abuse cases, negative paths, and security regressions when the feature is attackable
- make explicit what was not tested and why
- keep qa_status: in_progress during verification and set qa_status: completed at final closeout
`,
      'roles/PM_PLANNER.md': `# Senior Project Manager / Planner

Responsibilities:
- turn clarified requirements into an implementation-ready plan
- keep frontend, backend, and QA scopes aligned
- identify parallelizable work
- make the proposal set internally consistent before implementation starts
`,
      'roles/ARCHITECTURE_REVIEWER.md': `# Architecture Reviewer

Responsibilities:
- audit the architecture for feasibility and hidden coupling
- audit scope boundaries, data flow, and hidden coupling
- maintain the architecture review
- escalate blockers before approval
`,
      'roles/BACKEND_AUDITOR.md': `# Backend Auditor

Responsibilities:
- audit the backend stack for compatibility, runtime, and dependency risks
- maintain the backend audit and pressure-test it against the backend question bank
- escalate blockers before approval
`,
      'roles/SECURITY_THREAT_MODELER.md': `# Security Threat Modeler

Responsibilities:
- model the threat surface from an attacker-first point of view
- document assets, trust boundaries, entry points, abuse cases, and mitigations
- keep the security threat model aligned with the latest scope
`,
      'roles/SECURITY_AUDITOR.md': `# Security Auditor

Responsibilities:
- audit authentication, authorization, session handling, tampering resistance, and abuse controls
- pressure-test brute force, enumeration, replay, redirect abuse, CSRF/XSS, and logging/secret handling
- maintain the security audit and escalate blockers before approval
`,
      'roles/SENIOR_REVIEWER.md': `# Senior Reviewer

Responsibilities:
- synthesize the architecture review, backend audit, and security findings into a final verdict
- maintain the risk register
- escalate blockers before approval
`,
      'roles/FRONTEND.md': `# Frontend Expert

Responsibilities:
- UI fields, form behavior, validation, and user flows
- map backend contract changes into the front-end experience
- document any frontend acceptance points in frontend/proposal.md
- spell out screen states, loading/error/empty behavior, accessibility, tampering resistance, and edge cases
`,
      'roles/BACKEND.md': `# Backend Expert

Responsibilities:
- API and persistence changes
- data compatibility, validation logic, and rollout concerns
- document contract updates in backend/proposal.md
- pressure-test counters, idempotency, concurrency, cache/queue usage, observability, and security risks
`,
      'roles/QA.md': `# Senior QA

Responsibilities:
- define test scope and acceptance checks
- verify implemented behavior against the approved proposals
- prove the three gates: build pass, API smoke pass, page-level contract pass
- verify negative paths, abuse cases, and security regressions when applicable
- confirm the final closeout evidence is complete
- report both verified and unverified areas before completion
`,
    },
    async getPromptForCommand(args, context) {
      const cwd = getCwd()
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
Change title: ${workspace.changeTitle}
Change id: ${workspace.changeId}
Current phase: ${currentPhase}
Current stage: ${currentStage}

Beacon is the ONLY user-facing entrypoint for this flow. The user should not be asked to install or invoke OpenSpec, Superpowers, or Oh My Agent manually.

## Source of truth files

- Overview: \`${workspace.overviewPath}\`
- Proposal: \`${workspace.proposalPath}\`
- Design: \`${workspace.designPath}\`
- Tasks: \`${workspace.tasksPath}\`
- Architecture review: \`${workspace.reviewArchitecturePath}\`
- Backend audit: \`${workspace.reviewBackendAuditPath}\`
- Risk register: \`${workspace.reviewRiskRegisterPath}\`
- Backend question bank: \`${workspace.reviewBackendQuestionBankPath}\`
- Frontend proposal: \`${workspace.frontendProposalPath}\`
- Backend proposal: \`${workspace.backendProposalPath}\`
- QA proposal: \`${workspace.qaProposalPath}\`
- QA acceptance: \`${workspace.qaAcceptancePath}\`

## Operating model

Beacon internally follows these principles:
- Superpowers-style brainstorming for proactive multi-round requirement clarification
- OpenSpec-style documentation under \`openspec/changes/<change-id>/...\`
- Parallel review track for architecture and backend audits before approval
- Oh-My-Agent-style role handoff for implementation
- Backend-heavy changes must be challenged with \`${workspace.reviewBackendQuestionBankPath}\` before approval so counters, caching, idempotency, concurrency, migration, recovery, and observability assumptions are explicit

Use them as internal behavior rules. Do not burden the user with those names unless they ask.

## Required phases

### Phase 1: Brainstorming and clarification

You MUST actively clarify the request before implementation.
- Ask focused follow-up questions when anything is ambiguous
- Keep the standard OpenSpec artifacts updated:
  - \`${workspace.proposalPath}\`
  - \`${workspace.designPath}\`
  - \`${workspace.tasksPath}\`
- Keep the review docs updated in parallel:
  - \`${workspace.reviewArchitecturePath}\`
  - \`${workspace.reviewBackendAuditPath}\`
  - \`${workspace.reviewRiskRegisterPath}\`
  - \`${workspace.reviewBackendQuestionBankPath}\`
- Use \`${workspace.reviewBackendQuestionBankPath}\` to pressure-test backend assumptions whenever the backend path involves counters, hot writes, caching, idempotency, async work, or recovery behavior
- Separate frontend, backend, and QA concerns
- Make the frontend/backend/QA proposal files detailed enough that each worker can execute without inventing core technical decisions
- Update the proposal files as understanding improves
- Keep \`${workspace.overviewPath}\` as the high-level summary

### Phase 2: Proposal completion

Before asking to start development, make sure these files are meaningfully filled in:
- \`${workspace.proposalPath}\`
- \`${workspace.designPath}\`
- \`${workspace.tasksPath}\`
- \`${workspace.reviewArchitecturePath}\`
- \`${workspace.reviewBackendAuditPath}\`
- \`${workspace.reviewRiskRegisterPath}\`
- \`${workspace.frontendProposalPath}\`
- \`${workspace.backendProposalPath}\`
- \`${workspace.qaProposalPath}\`

The proposals should reflect the final clarified scope, not placeholders.
They must be detailed enough that frontend, backend, and QA workers can act on them without inventing core technical decisions.
Backend-heavy paths should explicitly answer the question-bank prompts for idempotency, concurrency, caching, migration, recovery, observability, and API compatibility.
They must be detailed enough that frontend, backend, and QA workers can act on them without inventing core technical decisions.
Backend-heavy paths should explicitly answer the question-bank prompts for idempotency, concurrency, caching, migration, recovery, observability, and API compatibility.

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
