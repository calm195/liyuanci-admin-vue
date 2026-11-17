export const traitCategories = ['personality', 'interest', 'lifestyle', 'uncategorized'] as const
export type TraitCategory = (typeof traitCategories)[number]
export const traitCategoryLabels: Record<TraitCategory, string> = {
  personality: '性格',
  interest: '兴趣',
  lifestyle: '生活方式',
  uncategorized: '待分类',
}
export type TraitStatus = 'approved' | 'pending' | 'rejected'
export interface TraitWord {
  id: string
  name: string
  heat: number
}
export interface Trait extends TraitWord {
  category?: TraitCategory
  enabled?: boolean
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
  category?: TraitCategory | ''
  enabled?: '' | 'true' | 'false'
  purpose: 'personal' | 'ideal' | 'all'
  q: string
  gender: '' | 'male' | 'female' | 'undisclosed'
  status: TraitStatus
  min_heat: string
  max_heat: string
  sort: 'heat_desc' | 'heat_asc'
}
export interface TraitReviewCommand {
  action?: 'review'
  id: string
  key: string
  body: { expected_version: number; decision: 'approved' | 'rejected'; reason: string }
}
export const traitStatusLabels: Record<TraitStatus, string> = {
  approved: '已通过',
  pending: '待审核',
  rejected: '已驳回',
}

export interface TraitCreateCommand {
  action: 'create'
  key: string
  body: { name: string; category: TraitCategory; reason: string }
}
export interface TraitUpdateCommand {
  action: 'update'
  id: string
  key: string
  body: { expected_version: number; category: TraitCategory; enabled: boolean; reason: string }
}
export type TraitCommand = TraitReviewCommand | TraitCreateCommand | TraitUpdateCommand
