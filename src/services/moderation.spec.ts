import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createModerationClient,
  parseModerationCase,
  parseModerationOutcome,
  parseModerationPage,
} from './moderation'
let factory = createModerationClient
const signal = () => new AbortController().signal
beforeEach(async () => {
  vi.stubEnv('DEV', true)
  vi.stubEnv('VITE_ADMIN_MOCK', 'true')
  vi.resetModules()
  factory = (await import('./moderation')).createModerationClient
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
describe('T017 REQ-015/019 内容审核服务', () => {
  it('分页不包含正文与身份字段，详情按精确版本读取', async () => {
    const client = factory(() => true)
    const page = await client.list(null, signal())
    expect(page.items).toHaveLength(2)
    expect(page.items[0]).not.toHaveProperty('body')
    expect(page.items[0]).not.toHaveProperty('outcome')
    const second = await client.list(page.next_cursor, signal())
    expect(second.items[0]?.id).toBe('synthetic-review-updated')
    expect(await client.detail('synthetic-review-updated', signal())).toMatchObject({
      version: 2,
      content_version: 2,
    })
  })
  it('拒绝畸形边界和未知业务结果，不泄漏额外响应字段', () => {
    expect(() => parseModerationCase({})).toThrow()
    expect(() =>
      parseModerationOutcome({
        content_decision: 'approved',
        business_outcome: 'unknown',
        version: 1,
      }),
    ).toThrow()
    expect(() => parseModerationPage({ items: [], next_cursor: 5 })).toThrow()
    expect(
      parseModerationCase({
        id: 'x',
        version: 1,
        content_version: 2,
        status: 'pending',
        body: '正文',
        secret: 'excluded',
      }),
    ).not.toHaveProperty('secret')
  })
  it.each([
    ['synthetic-review-ordinary', 'ready'],
    ['synthetic-review-school', 'published'],
    ['synthetic-review-cancelled', 'cancelled'],
    ['synthetic-review-privacy', 'privacy_review_required'],
    ['synthetic-review-message', 'delivered'],
  ])('通过 %s 独立返回业务结果 %s', async (id, outcome) => {
    const result = await factory(() => true).decide(
      id,
      { decision: 'approved', expected_version: 1 },
      'key',
      signal(),
    )
    expect(result).toMatchObject({ content_decision: 'approved', business_outcome: outcome })
  })
  it('驳回原因和建议必填，旧版本及已处理案件冲突', async () => {
    const client = factory(() => true)
    await expect(
      client.decide(
        'synthetic-review-ordinary',
        { decision: 'rejected', expected_version: 1, reason: ' ', revision_suggestion: '改写' },
        'bad',
        signal(),
      ),
    ).rejects.toThrow('均不能为空')
    await expect(
      client.decide(
        'synthetic-review-updated',
        { decision: 'approved', expected_version: 1 },
        'old',
        signal(),
      ),
    ).rejects.toMatchObject({ status: 409 })
    const result = await client.decide(
      'synthetic-review-ordinary',
      {
        decision: 'rejected',
        expected_version: 1,
        reason: '合成不合规',
        revision_suggestion: '请改写',
      },
      'reject',
      signal(),
    )
    expect(result.content_decision).toBe('rejected')
    await expect(
      client.decide(
        'synthetic-review-ordinary',
        { decision: 'approved', expected_version: 2 },
        'again',
        signal(),
      ),
    ).rejects.toMatchObject({ status: 409 })
  })
  it('普通下线和解除限制均要求原因和当前版本，解除不自动上架', async () => {
    const client = factory(() => true)
    await expect(
      client.restrict(
        'wish',
        'synthetic-wish',
        'offline',
        { reason: ' ', expected_version: 1 },
        'bad',
        signal(),
      ),
    ).rejects.toThrow()
    expect(
      await client.restrict(
        'wish',
        'synthetic-wish',
        'offline',
        { reason: '合成违规', expected_version: 1 },
        'offline',
        signal(),
      ),
    ).toMatchObject({ status: 'offline', version: 2 })
    await expect(
      client.restrict(
        'wish',
        'synthetic-wish',
        'release-restriction',
        { reason: '复核', expected_version: 1 },
        'old',
        signal(),
      ),
    ).rejects.toMatchObject({ status: 409 })
    expect(
      await client.restrict(
        'wish',
        'synthetic-wish',
        'release-restriction',
        { reason: '复核通过', expected_version: 2 },
        'release',
        signal(),
      ),
    ).toMatchObject({ status: 'withdrawn', version: 3 })
  })
  it('幂等重试复用回执但不暴露可变引用，同键异操作冲突', async () => {
    const client = factory(() => true)
    const input = { decision: 'approved' as const, expected_version: 1 }
    const first = await client.decide('synthetic-review-school', input, 'key', signal())
    first.version = 999
    expect((await client.decide('synthetic-review-school', input, 'key', signal())).version).toBe(2)
    await expect(
      client.decide('synthetic-review-message', input, 'key', signal()),
    ).rejects.toMatchObject({ status: 409 })
  })
  it('每次读取、写入、幂等回放均重验权限，取消及不存在的案件失败', async () => {
    let allowed = true
    const client = factory(() => allowed)
    const input = { decision: 'approved' as const, expected_version: 1 }
    await client.decide('synthetic-review-school', input, 'key', signal())
    allowed = false
    for (const pending of [
      client.list(null, signal()),
      client.detail('synthetic-review-school', signal()),
      client.demoContents(signal()),
      client.decide('synthetic-review-school', input, 'key', signal()),
      client.restrict(
        'wish',
        'synthetic-wish',
        'offline',
        { reason: '合成', expected_version: 1 },
        'offline',
        signal(),
      ),
    ])
      await expect(pending).rejects.toMatchObject({ status: 403 })
    allowed = true
    const controller = new AbortController()
    const pending = client.list(null, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await expect(client.detail('missing', signal())).rejects.toMatchObject({ status: 404 })
  })
  it('模拟无网络调用，生产环境失败关闭', async () => {
    const transport = vi.fn()
    vi.stubGlobal('fetch', transport)
    await factory(() => true).list(null, signal())
    expect(transport).not.toHaveBeenCalled()
    vi.stubEnv('DEV', false)
    vi.resetModules()
    const module = await import('./moderation')
    await expect(
      module.createModerationClient(() => true).list(null, signal()),
    ).rejects.toMatchObject({ status: 503 })
  })
})
