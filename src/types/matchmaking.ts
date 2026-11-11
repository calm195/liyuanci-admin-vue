import type { Role } from './admin'

export const matchmakingRoles: readonly Role[] = ['review_operator', 'super_admin']
export const campuses = [
  { code: 'wushan', label: '五山校区' },
  { code: 'university_town', label: '大学城校区' },
  { code: 'international', label: '国际校区' },
] as const
export const activityStatuses = ['draft', 'published', 'cancelled'] as const
export const activityPhases = [
  'draft',
  'cancelled',
  'upcoming',
  'registration',
  'matching',
  'active',
  'ended',
] as const
export const enrollmentStatuses = ['pending', 'approved', 'rejected', 'withdrawn'] as const
export const pairStatuses = ['draft', 'published', 'ended'] as const

export interface ActivityInput {
  expected_version: number
  title: string
  description: string
  registration_opens_at: string
  registration_closes_at: string
  results_at: string
  starts_at: string
  ends_at: string
  days: number
}
export interface Activity extends ActivityInput {
  campuses: string[]
  id: string
  version: number
  status: (typeof activityStatuses)[number]
  phase: (typeof activityPhases)[number]
}
export interface Profile {
  name: string
  gender: 'male' | 'female'
  grade: string
  campus: string
  mbti: string
  age: number
  age_min: number
  age_max: number
  height: number
  height_min: number
  height_max: number
  weight: number
  weight_min: number
  weight_max: number
  wechat: string
  ideal_traits?: string[]
  personal_traits?: string[]
  introduction: string
  consent: boolean
}
export interface Enrollment {
  id: string
  version: number
  status: (typeof enrollmentStatuses)[number]
  reason: string
  eligible: boolean
  profile?: Profile
}
export interface ScoreDetails {
  traits?: number
  personal_to_ideal?: string[]
  ideal_to_personal?: string[]
  mbti: number
  age: number
  campus: number
  height: number
  weight: number
}
export interface Pair {
  id: string
  version: number
  status: (typeof pairStatuses)[number]
  score: number
  score_details: ScoreDetails
  algorithm: string
  enrollments: string[]
  member_names: string[]
  accessible: boolean
  reason: string
}
export interface TaskTemplate {
  kind: 'online' | 'offline'
  body: string
  fixed_day: number
}
export interface LibraryTaskInput {
  expected_version: number
  kind: TaskTemplate['kind']
  body: string
  min_day: number
  enabled: boolean
}
export interface LibraryTask extends Omit<LibraryTaskInput, 'expected_version'> {
  id: string
  version: number
}
export interface LibraryPage {
  items: LibraryTask[]
  total: number
}
export interface TaskPlan {
  first_task_id: string
  first_task_body: string
  missing_day: number
}
export interface Workspace {
  task_plan?: TaskPlan
  activity: Activity
  enrollments: Enrollment[]
  total: number
  pairs: Pair[]
  pair_total: number
  templates: TaskTemplate[]
  templates_locked: boolean
}
export interface Candidate {
  enrollment: Enrollment
  score: number
  score_details: ScoreDetails
}
export interface ActivityPage {
  items: Activity[]
  total: number
}
export type CommandBody =
  | ActivityInput
  | LibraryTaskInput
  | {
      expected_version: number
      first_task_id: string
    }
  | {
      expected_version: number
      reason: string
    }
  | {
      expected_version: number
      decision: 'approved' | 'rejected'
      reason: string
    }
  | {
      expected_version: number
      items: TaskTemplate[]
    }
  | {
      expected_version: number
      first: string
      second: string
    }
export interface PendingCommand {
  path: string
  method: 'POST' | 'PUT'
  body: CommandBody
  key: string
  title: string
  activityID: string
}

export const phaseLabels: Record<Activity['phase'], string> = {
  draft: '草稿',
  cancelled: '已取消',
  upcoming: '即将报名',
  registration: '报名中',
  matching: '配对准备中',
  active: '活动进行中',
  ended: '已结束',
}
export const enrollmentLabels: Record<Enrollment['status'], string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  withdrawn: '已撤回',
}
export const pairLabels: Record<Pair['status'], string> = {
  draft: '待发布',
  published: '已发布',
  ended: '已解除',
}
