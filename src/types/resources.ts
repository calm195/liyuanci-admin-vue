import type { Role } from './admin'
export const resourceRoles: readonly Role[] = ['review_operator', 'super_admin']
export const resourceStatuses = ['draft', 'published', 'offline'] as const
export const resourceStatusLabels = { draft: '草稿', published: '已上架', offline: '已下架' }
export const feedbackLabels = {
  valid: '有效',
  link_invalid: '链接失效',
  outdated: '年代久远',
  incomplete: '不全',
}
export type ResourceStatus = (typeof resourceStatuses)[number]
export interface ResourceCategory {
  id: string
  name: string
}

export interface AdminResourceCategory extends ResourceCategory {
  sort_order: number
  enabled: boolean
  version: number
  created_at: string
  updated_at: string
}
export interface FeedbackSummary {
  content_version: number
  valid: number
  link_invalid: number
  outdated: number
  incomplete: number
  total: number
}
export interface ResourceBase {
  id: string
  title: string
  category: ResourceCategory
  version: number
  content_version: number
  status: ResourceStatus
  created_at: string
  updated_at: string
  published_at: string | null
  visibility_blocked: boolean
  feedback_summary: FeedbackSummary
  allowed_actions: ('update' | 'publish' | 'offline')[]
}
export interface ResourceSummary extends ResourceBase {
  description_excerpt: string
}
export interface ResourceDetail extends ResourceBase {
  description: string
  download_url: string
  extraction_code: string | null
}
export interface ResourceInput {
  title: string
  category_id: string
  description: string
  download_url: string
  extraction_code: string | null
}
export interface CategoryInput {
  name: string
  sort_order: number
  enabled: boolean
}
export interface ResourceFilters {
  q: string
  category_id: string
  status: '' | ResourceStatus
  limit: number
}
export interface ResourcePage<T> {
  items: T[]
  next_cursor: string | null
}
export interface ResourcesClient {
  list(
    filters: ResourceFilters,
    cursor: string | null,
    signal: AbortSignal,
  ): Promise<ResourcePage<ResourceSummary>>
  detail(id: string, signal: AbortSignal): Promise<ResourceDetail>
  create(input: ResourceInput, key: string, signal: AbortSignal): Promise<ResourceDetail>
  update(
    id: string,
    input: ResourceInput & { expected_version: number },
    key: string,
    signal: AbortSignal,
  ): Promise<ResourceDetail>
  publish(id: string, version: number, key: string, signal: AbortSignal): Promise<ResourceDetail>
  offline(
    id: string,
    version: number,
    reason: string,
    key: string,
    signal: AbortSignal,
  ): Promise<ResourceDetail>
  categories(
    enabled: boolean | null,
    cursor: string | null,
    signal: AbortSignal,
  ): Promise<ResourcePage<AdminResourceCategory>>
  category(id: string, signal: AbortSignal): Promise<AdminResourceCategory>
  createCategory(
    input: Pick<CategoryInput, 'name' | 'sort_order'>,
    key: string,
    signal: AbortSignal,
  ): Promise<AdminResourceCategory>
  updateCategory(
    id: string,
    input: CategoryInput & { expected_version: number },
    key: string,
    signal: AbortSignal,
  ): Promise<AdminResourceCategory>
}
