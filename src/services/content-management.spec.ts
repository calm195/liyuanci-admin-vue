import { describe, expect, it, vi } from 'vitest'
import { createContentManagementClient } from './content-management'
import type { ContentFilters } from './content-management'

const filters: ContentFilters = {
  keyword: '  校园 %_  ',
  state: 'published',
  requester: '许愿人',
  helper: '应愿人',
  from: '2026-11-06',
  until: '2026-11-07',
}
const id = '00000000-0000-4000-8000-000000000001'
const summary = {
  id,
  title: '周末心愿',
  state: 'published',
  created_at: '2026-11-07T08:00:00+08:00',
  published_at: null,
  requester: '许愿人',
  helper: '',
  matched_at: null,
}
const signal = new AbortController().signal
function response(data: unknown) {
  return Response.json({ code: 0, message: '成功', request_id: 'request', data })
}

describe('内容管理传输', () => {
  it('只消费请求的统计投影，缺失统计不以旧字段补值并拒绝非法计数', async () => {
    const base = {
      ...summary,
      original: null,
      story: null,
      comments: [],
      comments_more: false,
      exportable: false,
      comment_count: 2,
    }
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({ ...base, stats: { support_count: 12, comment_count: 3, view_count: 128 } }),
      )
      .mockResolvedValueOnce(response(base))
      .mockResolvedValueOnce(response({ ...base, stats: { view_count: -1 } }))
    const client = createContentManagementClient('session-token', () => true, transport)
    await expect(client.detail('wishes', id, 0, signal)).resolves.toMatchObject({
      supportCount: 12,
      commentCount: 3,
      viewCount: 128,
    })
    await expect(client.detail('wishes', id, 0, signal)).resolves.toMatchObject({
      supportCount: undefined,
      commentCount: undefined,
    })
    await expect(client.detail('wishes', id, 0, signal)).rejects.toThrow('不符合契约')
  })
  it.each([
    {
      kind: 'wishes' as const,
      stats: {
        support_count: 0,
        application_count: 0,
        comment_count: 2,
        view_count: 3,
        hug_count: 9,
      },
      expected: {
        supportCount: 0,
        applicationCount: 0,
        commentCount: 2,
        viewCount: 3,
        hugCount: undefined,
      },
    },
    {
      kind: 'whispers' as const,
      stats: { hug_count: 1, comment_count: 0, view_count: 0 },
      expected: {
        hugCount: 1,
        commentCount: 0,
        viewCount: 0,
        supportCount: undefined,
        applicationCount: undefined,
      },
    },
  ])('$kind只展示该类型适用且实际提供的统计', async ({ kind, stats, expected }) => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        ...summary,
        original: null,
        story: null,
        comments: [],
        comments_more: false,
        exportable: false,
        application_count: 0,
        comment_count: 99,
        view_count: 99,
        stats,
      }),
    )
    const client = createContentManagementClient('session-token', () => true, transport)
    await expect(client.detail(kind, id, 0, signal)).resolves.toMatchObject(expected)
  })
  it('心愿部分统计缺失时不把历史占位零展示为应愿、评论或浏览', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        ...summary,
        original: null,
        story: null,
        comments: [],
        comments_more: false,
        exportable: false,
        stats: { support_count: 1 },
        application_count: 0,
        comment_count: 0,
        view_count: 0,
      }),
    )
    const client = createContentManagementClient('session-token', () => true, transport)
    await expect(client.detail('wishes', id, 0, signal)).resolves.toMatchObject({
      supportCount: 1,
      applicationCount: undefined,
      commentCount: undefined,
      viewCount: undefined,
    })
  })
  it('按北京时间筛选并编码关键词和游标', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response({ items: [{ ...summary, private_body: '原始内容' }], next_cursor: 'a+b=' }),
      )
    const client = createContentManagementClient('session-token', () => true, transport)
    const result = await client.list('wishes', filters, 'a+b=', signal)
    expect(result.items[0]).toMatchObject({ id, title: '周末心愿', requester: '许愿人' })
    expect(result.items[0]).not.toHaveProperty('private_body')
    const call = transport.mock.calls[0]
    expect(call).toBeDefined()
    const endpoint = call?.[0]
    if (typeof endpoint !== 'string') throw new Error('请求地址应为字符串')
    const path = new URL(endpoint, 'http://localhost')
    expect(path.pathname).toBe('/api/v1/admin/content/wishes')
    expect(Object.fromEntries(path.searchParams)).toEqual({
      include: 'stats',
      keyword: '校园 %_',
      state: 'published',
      requester: '许愿人',
      helper: '应愿人',
      from: '2026-11-06T00:00:00+08:00',
      until: '2026-11-07T16:00:00.000Z',
      cursor: 'a+b=',
    })
    expect(call?.[1]).toMatchObject({ cache: 'no-store', credentials: 'omit', signal })
  })

  it('拒绝错配详情，并使用独立的 POST 草稿接口', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          ...summary,
          id: '00000000-0000-4000-8000-000000000002',
          original: null,
          story: null,
          comments: [],
          comments_more: false,
          exportable: false,
        }),
      )
      .mockResolvedValueOnce(response({ markdown: '# 悄悄话\n\n> 正文' }))
    const client = createContentManagementClient('session-token', () => true, transport)
    await expect(client.detail('whispers', id, 1, signal)).rejects.toThrow('不符合契约')
    await expect(client.export('whispers', id, signal)).resolves.toContain('> 正文')
    expect(transport.mock.calls[0]?.[0]).toBe(
      `/api/v1/admin/content/whispers/${id}?include=stats&comments_page=1`,
    )
    expect(transport.mock.calls[1]?.[0]).toBe(`/api/v1/admin/content/whispers/${id}/export`)
    expect(transport.mock.calls[1]?.[1]?.method).toBe('POST')
  })
})
