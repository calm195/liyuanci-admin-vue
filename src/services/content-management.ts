import { parseContentImages } from './content-images'
import { createContentRequest } from './content-transport'
import { record } from '@/types/admin'

export type ContentKind = 'wishes' | 'whispers'

function invalid(): never {
  throw new Error('内容管理数据不符合契约，请刷新或联系管理员')
}

function object(value: unknown) {
  return record(value) ? value : invalid()
}

function text(value: unknown) {
  return typeof value === 'string' ? value : invalid()
}

function id(value: unknown) {
  const result = text(value)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(result))
    return invalid()
  return result
}

function date(value: unknown) {
  const result = text(value)
  return Number.isFinite(Date.parse(result)) ? result : invalid()
}

function optionalDate(value: unknown) {
  return value === null ? null : date(value)
}

function boolean(value: unknown) {
  return typeof value === 'boolean' ? value : invalid()
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : invalid()
}

function optionalCount(value: unknown) {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return invalid()
  return value
}

function summary(value: unknown) {
  const row = object(value)
  return {
    id: id(row['id']),
    title: text(row['title']),
    state: text(row['state']),
    createdAt: date(row['created_at']),
    publishedAt: optionalDate(row['published_at']),
    requester: text(row['requester']),
    helper: text(row['helper']),
    matchedAt: optionalDate(row['matched_at']),
  }
}

function publication(value: unknown) {
  const row = object(value)
  return {
    body: text(row['body']),
    author: text(row['author']),
    notice: text(row['notice']),
    ...(row['images'] === undefined ? {} : { images: parseContentImages(row['images']) }),
    ...(row['id'] === undefined ? {} : { id: id(row['id']) }),
    ...(row['kind'] === undefined ? {} : { kind: text(row['kind']) }),
    ...(row['root_comment_id'] == null ? {} : { rootId: id(row['root_comment_id']) }),
    ...(row['reply_to_comment_id'] == null ? {} : { replyToId: id(row['reply_to_comment_id']) }),
  }
}

function detail(value: unknown) {
  const row = object(value)
  return {
    ...summary(row),
    applicationCount: optionalCount(row['application_count']),
    commentCount: optionalCount(row['comment_count']),
    viewCount: optionalCount(row['view_count']),
    expiresAt: row['expires_at'] == null ? null : date(row['expires_at']),
    original: row['original'] === null ? null : publication(row['original']),
    story: row['story'] === null ? null : publication(row['story']),
    comments: array(row['comments']).map(publication),
    commentsMore: boolean(row['comments_more']),
    exportable: boolean(row['exportable']),
  }
}

export type ContentSummary = ReturnType<typeof summary>
export type ContentDetail = ReturnType<typeof detail>

export interface ContentFilters {
  keyword: string
  state: string
  requester: string
  helper: string
  from: string
  until: string
}

function listQuery(filters: ContentFilters, cursor: string | null) {
  const query = new URLSearchParams()
  for (const key of ['keyword', 'state', 'requester', 'helper'] as const) {
    const value = filters[key].trim()
    if (value) query.set(key, value)
  }
  // 筛选时间按页面显示的北京时间，将结束日期转换为次日零点的排他边界。
  if (filters.from) query.set('from', `${filters.from}T00:00:00+08:00`)
  if (filters.until) {
    const end = new Date(`${filters.until}T00:00:00+08:00`)
    end.setUTCDate(end.getUTCDate() + 1)
    query.set('until', end.toISOString())
  }
  if (cursor !== null) query.set('cursor', cursor)
  return query.toString()
}

/** 内容管理复用带当前会话校验的后台传输，只接受服务端白名单投影。 */
export function createContentManagementClient(
  token: string,
  allowed: () => boolean,
  transport: typeof fetch = fetch,
) {
  const request = createContentRequest(token, allowed, transport)
  return {
    async list(
      kind: ContentKind,
      filters: ContentFilters,
      cursor: string | null,
      signal: AbortSignal,
    ) {
      const query = listQuery(filters, cursor)
      const data = object(await request(`content/${kind}${query ? '?' + query : ''}`, signal))
      return {
        items: array(data['items']).map(summary),
        next: data['next_cursor'] === null ? null : text(data['next_cursor']),
      }
    },
    async detail(kind: ContentKind, target: string, page: number, signal: AbortSignal) {
      const query = page > 0 ? `?comments_page=${page}` : ''
      const result = detail(await request(`content/${kind}/${id(target)}${query}`, signal))
      if (result.id !== target) return invalid()
      return result
    },
    async export(kind: ContentKind, target: string, signal: AbortSignal) {
      const data = object(
        await request(`content/${kind}/${id(target)}/export`, signal, { method: 'POST' }),
      )
      const markdown = text(data['markdown'])
      return markdown.startsWith('# ') ? markdown : invalid()
    },
  }
}
