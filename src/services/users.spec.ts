import { describe, it, expect, vi } from 'vitest'
import fixtures from './users.contract.spec.json'
import {
  createUsersClient,
  normalizeNickname,
  parseUser,
  parseUserDetail,
  parseUserPage,
  parseUserPenalty,
} from './users'
import type { UserFilters } from '@/types/users'
const filters: UserFilters = {
  user_id: '',
  nickname: '',
  verification: '',
  restriction: '',
  limit: 20,
}
const signal = () => new AbortController().signal
const detail = fixtures.fixtures.find((item) => item.name === 'detail-valid')?.body
const parsers: Record<string, (value: unknown) => unknown> = {
  UserSummary: parseUser,
  UserDetail: parseUserDetail,
  UserPenalty: parseUserPenalty,
  UserPage: (value) => parseUserPage(value, parseUser),
  UserPenaltyPage: (value) => parseUserPage(value, parseUserPenalty),
}
function response(data: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ code: 0, message: '成功', request_id: 'synthetic', data }), {
    headers: { 'X-Request-ID': 'synthetic', 'Cache-Control': 'no-store', ...headers },
  })
}
describe('UM-A01 用户契约与传输', () => {
  it.each(fixtures.fixtures)('$name', (fixture) => {
    const parse = parsers[fixture.schema]
    expect(parse).toBeDefined()
    if (!parse) throw new Error('缺少解析器')
    if (fixture.valid) expect(() => parse(fixture.body)).not.toThrow()
    else expect(() => parse(fixture.body)).toThrow()
  })
  it.each(fixtures.exchanges)('消费 $operation_id 正例', async (exchange) => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(exchange.body), {
        headers: { 'X-Request-ID': exchange.body.request_id, 'Cache-Control': 'no-store' },
      }),
    )
    const client = createUsersClient('synthetic', () => true, transport)
    if (exchange.operation_id === 'adminUsersList') await client.users(filters, null, signal())
    else if (exchange.operation_id === 'adminUserDetail')
      await client.user(exchange.path_params.id ?? '', signal())
    else await client.userPenalties(exchange.path_params.id ?? '', null, signal())
    expect(transport).toHaveBeenCalledOnce()
  })
  it('特殊昵称编码、完整筛选回传且只发服务请求', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(response({ items: [], next_cursor: null })))
    await createUsersClient('synthetic', () => true, transport).users(
      {
        ...filters,
        nickname: " 小鲤%_'\\ ",
        verification: 'verified',
        restriction: 'muted',
        limit: 10,
      },
      'opaque',
      signal(),
    )
    const [url, init] = transport.mock.calls[0] ?? []
    const query = new URL(typeof url === 'string' ? url : '', 'https://local.invalid').searchParams
    expect(query.get('nickname')).toBe("小鲤%_'\\")
    expect(query.get('cursor')).toBe('opaque')
    expect(query.get('verification')).toBe('verified')
    expect(query.get('restriction')).toBe('muted')
    expect(query.get('limit')).toBe('10')
    expect(init).toMatchObject({ cache: 'no-store', credentials: 'omit', redirect: 'error' })
  })
  it('按码点计长且使用准确空白集合', () => {
    expect(normalizeNickname(' \u0085' + '🐟'.repeat(50) + '\u3000')).toBe('🐟'.repeat(50))
    expect(() => normalizeNickname('🐟'.repeat(51))).toThrow('50')
    expect(normalizeNickname('\ufeff小鲤\u200b')).toBe('\ufeff小鲤\u200b')
    expect(normalizeNickname('\t\n ')).toBe('')
  })
  it.each([400, 401, 403, 404, 429, 500, 503])('保留HTTP %s失败', async (status) => {
    const client = createUsersClient(
      'synthetic',
      () => true,
      vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status })),
    )
    await expect(client.users(filters, null, signal())).rejects.toMatchObject({ status })
  })
  it('拒绝请求ID、缓存头和目标不匹配', async () => {
    for (const headers of [{ 'X-Request-ID': 'other' }, { 'Cache-Control': 'public' }]) {
      await expect(
        createUsersClient(
          'synthetic',
          () => true,
          vi.fn<typeof fetch>().mockResolvedValue(response(detail, headers)),
        ).user('ac220000-0000-4000-8000-000000000001', signal()),
      ).rejects.toThrow('契约')
    }
    await expect(
      createUsersClient(
        'synthetic',
        () => true,
        vi.fn<typeof fetch>().mockResolvedValue(response(detail)),
      ).user('ac220000-0000-4000-8000-000000000002', signal()),
    ).rejects.toThrow('契约')
  })
  it('撤权后不发送请求；在途撤权拒绝响应', async () => {
    let allowed = false
    const transport = vi.fn<typeof fetch>().mockImplementation(() => {
      allowed = false
      return Promise.resolve(response(detail))
    })
    const client = createUsersClient('synthetic', () => allowed, transport)
    await expect(client.users(filters, null, signal())).rejects.toMatchObject({ status: 403 })
    expect(transport).not.toHaveBeenCalled()
    allowed = true
    await expect(
      client.user('ac220000-0000-4000-8000-000000000001', signal()),
    ).rejects.toMatchObject({ status: 403 })
  })
})

it.each(['ban', 'unban', 'mute', 'unmute'] as const)(
  '直接操作%s只发送理由和账号版本',
  async (action) => {
    const target = 'ac220000-0000-4000-8000-000000000001'
    const data = {
      user_id: target,
      account_version: 8,
      banned: false,
      muted: false,
      muted_until: null,
      as_of: '2026-10-29T04:00:00Z',
      allowed_actions: ['ban', 'mute'],
    }
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response(data))
    const client = createUsersClient('synthetic', () => true, transport)
    await client.changeRestriction(
      target,
      action,
      { reason: ' 合成理由 ', expected_version: 7 },
      'same-key',
      signal(),
    )
    expect(transport.mock.calls[0]?.[0]).toBe(
      `/api/v1/admin/users/${target}/restrictions/${action}`,
    )
    expect(new Headers(transport.mock.calls[0]?.[1]?.headers).get('Idempotency-Key')).toBe(
      'same-key',
    )
    expect(transport.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ reason: '合成理由', expected_version: 7 }),
    })
  },
)
it('直接操作拒绝错目标与矛盾状态', async () => {
  const target = 'ac220000-0000-4000-8000-000000000001'
  for (const data of [
    {
      user_id: target,
      account_version: 8,
      banned: true,
      muted: false,
      muted_until: null,
      as_of: '2026-10-29T04:00:00Z',
      allowed_actions: ['ban'],
    },
    {
      user_id: 'ac220000-0000-4000-8000-000000000002',
      account_version: 8,
      banned: false,
      muted: false,
      muted_until: null,
      as_of: '2026-10-29T04:00:00Z',
      allowed_actions: ['ban', 'mute'],
    },
  ]) {
    const client = createUsersClient(
      'synthetic',
      () => true,
      vi.fn<typeof fetch>().mockResolvedValue(response(data)),
    )
    await expect(client.restrictions(target, signal())).rejects.toThrow('契约')
  }
})
