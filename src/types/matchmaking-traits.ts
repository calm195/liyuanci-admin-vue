export type TraitStatus = 'approved' | 'pending' | 'rejected'
export interface TraitWord {
  id: string
  name: string
  heat: number
}
export interface Trait extends TraitWord {
  status: TraitStatus
  version: number
  male_count: number
  female_count: number
  undisclosed_count: number
  created_at: string
  reason: string
}
export interface TraitDetail extends Trait {
  evidence: {
    matches: {
      word: string
      source: string
      kind: string
      label?: string
      disposition: string
      start: number
      end: number
      field?: string
    }[]
    routes: string[]
    truncated?: boolean
  }
  reviewed_at?: string
  reviewed_by?: string
}
export interface TraitFilters {
  purpose: 'personal' | 'ideal' | 'all'
  q: string
  gender: '' | 'male' | 'female' | 'undisclosed'
  status: TraitStatus
  min_heat: string
  max_heat: string
  sort: 'heat_desc' | 'heat_asc'
}
export interface TraitReviewCommand {
  id: string
  key: string
  body: { expected_version: number; decision: 'approved' | 'rejected'; reason: string }
}
export const traitStatusLabels: Record<TraitStatus, string> = {
  approved: '已通过',
  pending: '待审核',
  rejected: '已驳回',
}
