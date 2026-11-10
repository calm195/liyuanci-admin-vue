import { ApiError } from './admin'
import { record } from '@/types/admin'

export const dashboardMetrics = {
  registered_users: '注册用户',
  verified_users: '认证用户',
  new_users: '新增用户',
  resources: '资料数目',
  wishes: '心愿数目',
  fulfilled_wishes: '达成愿望数目',
} as const
export type Metric = keyof typeof dashboardMetrics
export type DashboardCounts = Record<Metric, number>
export interface Dashboard {
  range: 'month' | 'year'
  timezone: string
  generated_at: string
  summary: DashboardCounts
  series: (DashboardCounts & { date: string })[]
  history_note: string
}
function counts(value: unknown): DashboardCounts {
  if (!record(value)) throw new Error('统计数据格式不正确')
  const result: DashboardCounts = {
    registered_users: 0,
    verified_users: 0,
    new_users: 0,
    resources: 0,
    wishes: 0,
    fulfilled_wishes: 0,
  }
  for (const key of Object.keys(result) as Metric[]) {
    const count = value[key]
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)
      throw new Error('统计数量格式不正确')
    result[key] = count
  }
  return result
}
export function parseDashboard(value: unknown): Dashboard {
  if (!record(value) || value['code'] !== 0 || !record(value['data']))
    throw new Error('统计响应格式不正确')
  const data = value['data']
  if (
    (data['range'] !== 'month' && data['range'] !== 'year') ||
    data['timezone'] !== 'Asia/Shanghai' ||
    typeof data['generated_at'] !== 'string' ||
    !Number.isFinite(Date.parse(data['generated_at'])) ||
    typeof data['history_note'] !== 'string' ||
    !Array.isArray(data['series'])
  )
    throw new Error('统计响应字段不完整')
  return {
    range: data['range'],
    timezone: data['timezone'],
    generated_at: data['generated_at'],
    history_note: data['history_note'],
    summary: counts(data['summary']),
    series: data['series'].map((point: unknown) => {
      if (
        !record(point) ||
        typeof point['date'] !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(point['date'])
      )
        throw new Error('统计日期格式不正确')
      return { ...counts(point), date: point['date'] }
    }),
  }
}
/** 仅读取后台聚合统计，不在浏览器拼接用户或审核明细。 */
export async function readDashboard(token: string, range: 'month' | 'year', signal: AbortSignal) {
  const response = await fetch(`/api/v1/admin/dashboard?range=${range}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
  })
  if (!response.ok) throw new ApiError(response.status)
  const result = parseDashboard(await response.json())
  if (result.range !== range) throw new Error('统计时间范围不匹配')
  return result
}

export type HotKind = 'wish' | 'whisper'

export interface HotItem {
  id: string
  title: string
  body: string
  heatScore: number
  supportCount?: number
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function parseHotItems(value: unknown, kind: HotKind): HotItem[] {
  if (!record(value) || value['code'] !== 0 || !record(value['data']))
    throw new Error('热点响应格式不正确')
  const items = value['data']['items']
  if (!Array.isArray(items) || items.length > 10) throw new Error('热点条数不正确')
  return items.map((item: unknown) => {
    if (
      !record(item) ||
      typeof item['id'] !== 'string' ||
      typeof item['title'] !== 'string' ||
      typeof item['body'] !== 'string' ||
      !isCount(item['heat_score'])
    )
      throw new Error('热点字段不完整')
    const supportCount = item['support_count']
    if (kind === 'wish' && !isCount(supportCount)) throw new Error('心愿支持数格式不正确')
    return {
      id: item['id'],
      title: item['title'],
      body: item['body'],
      heatScore: item['heat_score'],
      ...(kind === 'wish' && isCount(supportCount) ? { supportCount } : {}),
    }
  })
}

/** 使用有效后台会话读取公开周榜的运营投影。 */
export async function readHotItems(token: string, kind: HotKind, signal: AbortSignal) {
  const response = await fetch(`/api/v1/admin/content/hot?kind=${kind}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
  })
  if (!response.ok) throw new ApiError(response.status)
  return parseHotItems(await response.json(), kind)
}
