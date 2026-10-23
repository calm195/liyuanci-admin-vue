import type { CursorPage } from './moderation'
export const crisisRoles = ['crisis_operator', 'super_admin'] as const
export const crisisActions = ['take_over', 'follow_up', 'resolve', 'retry_notification'] as const
export type CrisisAction = (typeof crisisActions)[number]
export type CrisisSource = 'task' | 'report'
export interface CrisisSummary {
  id: string
  version: number
  status: string
}
export interface CrisisReference extends CrisisSummary {
  kind: string
}
export interface CrisisDetail extends CrisisSummary {
  student_number: string
  body: string
  timeline: CrisisReference[]
}
export interface CrisisEvent {
  id: string
  action: string
  actor: string
  at: string
  reason: string
}
export interface CrisisWorkItem {
  id: string
  kind: string
  status: string
  attempts: number
  next_at: string
}
export interface CrisisWork {
  handoff_at: string | null
  items: CrisisWorkItem[]
}
export interface CrisisEvidence extends CrisisSummary {
  case_id: string
  body: string
  student_number: string
}
export interface CrisisReason {
  reason: string
  expected_version: number
}
export interface CrisisCommand extends CrisisReason {
  action: CrisisAction
}
export interface CrisisClient {
  list(cursor: string | null, signal: AbortSignal): Promise<CursorPage<CrisisSummary>>
  detail(id: string, signal: AbortSignal): Promise<CrisisDetail>
  timeline(id: string, signal: AbortSignal): Promise<CrisisEvent[]>
  work(id: string, signal: AbortSignal): Promise<CrisisWork>
  evidence(caseId: string, evidenceId: string, signal: AbortSignal): Promise<CrisisEvidence>
  act(id: string, input: CrisisCommand, key: string, signal: AbortSignal): Promise<CrisisSummary>
  falsePositive(
    id: string,
    input: CrisisReason,
    key: string,
    signal: AbortSignal,
  ): Promise<CrisisSummary>
  escalate(
    source: CrisisSource,
    id: string,
    input: CrisisReason,
    key: string,
    signal: AbortSignal,
  ): Promise<CrisisSummary>
}
