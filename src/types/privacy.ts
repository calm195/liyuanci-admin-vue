export interface EvidenceTarget {
  id: string
  case_id: string
  version: number
  status: string
}
export interface DeletionJob {
  id: string
  version: number
  status: 'pending'
}
export interface DeletionProgress {
  status: 'processing' | 'completed'
  retryable_error?:
    'external_cleanup_unavailable' | 'database_cleanup_unavailable' | 'cleanup_unavailable'
}
export interface EvidenceDeletionInput {
  reason: string
  expected_version: number
}
