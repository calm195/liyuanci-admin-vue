import type { ScoreDetails } from './matchmaking'
export const autoPairingStatuses = [
  'pending',
  'running',
  'ready',
  'applied',
  'stale',
  'failed',
] as const
export type AutoPairingStatus = (typeof autoPairingStatuses)[number]
export interface AutoPairingMember {
  enrollment_id: string
  name: string
}
export interface AutoPairingPair {
  first: AutoPairingMember
  second: AutoPairingMember
  score: number
  score_details: ScoreDetails
}
export interface AutoPairingUnmatched extends AutoPairingMember {
  reason: string
}
export interface AutoPairingJob {
  id: string
  activity_id: string
  version: number
  activity_version: number
  status: AutoPairingStatus
  algorithm: string
  participant_count: number
  eligible_count: number
  paired_count: number
  unmatched_count: number
  excluded_count: number
  total_score: number
  created_at: string
  expires_at: string
  error: string
  pairs: AutoPairingPair[]
  unmatched: AutoPairingUnmatched[]
  excluded: AutoPairingUnmatched[]
}
export type AutoPairingCommand =
  | {
      kind: 'generate'
      activityID: string
      key: string
      body: { expected_version: number }
    }
  | {
      kind: 'apply'
      activityID: string
      jobID: string
      key: string
      body: { expected_version: number; activity_version: number }
    }
