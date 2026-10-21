import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createIdentityReviewClient,
  parseIdentityCase,
  parseIdentityPage,
  parseIdentityReceipt,
} from './identity'

let clientFactory = createIdentityReviewClient
beforeEach(async () => {
  vi.stubEnv('DEV', true)
  vi.stubEnv('VITE_ADMIN_MOCK', 'true')
  vi.resetModules()
  clientFactory = (await import('./identity')).createIdentityReviewClient
})
afterEach(() => vi.unstubAllEnvs())
const signal = () => new AbortController().signal
describe('T012 REQ-002/018/019 身份审核服务边界', () => {
  it('列表仅保留脱敏字段，分页不重复', async () => {
    const client = clientFactory(() => true)
    const first = await client.list(null, signal())
    expect(first.items).toHaveLength(2)
    expect(Object.keys(first.items[0] ?? {})).toEqual(['id', 'version', 'status'])
    const second = await client.list(first.next_cursor, signal())
    expect(second.items.map((item) => item.id)).not.toContain(first.items[0]?.id)
    const last = await client.list(second.next_cursor, signal())
    expect(last.items).toHaveLength(1)
    expect(last.next_cursor).toBeNull()
  })
  it('拒绝异常边界数据', () => {
    expect(() => parseIdentityPage({ items: [], next_cursor: 1 })).toThrow()
    expect(() => parseIdentityCase({ id: 'x', version: 1, status: 'pending' })).toThrow()
    expect(() => parseIdentityReceipt({ request_id: 'x', version: 1, status: 'unknown' })).toThrow()
  })
  it('驳回原因和建议必填，成功后保留可读回执', async () => {
    const client = clientFactory(() => true)
    await expect(
      client.decide(
        'synthetic-case-1',
        { decision: 'rejected', expected_version: 1, reason: ' ', revision_suggestion: '重新上传' },
        'key',
        signal(),
      ),
    ).rejects.toThrow('均不能为空')
    const receipt = await client.decide(
      'synthetic-case-1',
      {
        decision: 'rejected',
        expected_version: 1,
        reason: '图像不清晰',
        revision_suggestion: '请上传清晰图片',
      },
      'key',
      signal(),
    )
    expect(receipt).toMatchObject({
      status: 'rejected',
      version: 2,
      reason: '图像不清晰',
      revision_suggestion: '请上传清晰图片',
    })
  })
  it('同键同内容返回原回执，异内容或旧版本冲突', async () => {
    const client = clientFactory(() => true)
    const input = { decision: 'approved' as const, expected_version: 1 }
    const first = await client.decide('synthetic-case-1', input, 'same-key', signal())
    expect(await client.decide('synthetic-case-1', input, 'same-key', signal())).toEqual(first)
    await expect(
      client.decide('synthetic-case-2', input, 'same-key', signal()),
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      client.decide('synthetic-case-1', input, 'new-key', signal()),
    ).rejects.toMatchObject({ status: 409 })
  })
  it('角色收回后禁止详情、读卡、审核及回执重放', async () => {
    let allowed = true
    const client = clientFactory(() => allowed)
    const input = { decision: 'approved' as const, expected_version: 1 }
    await client.decide('synthetic-case-1', input, 'key', signal())
    allowed = false
    for (const pending of [
      client.list(null, signal()),
      client.detail('synthetic-case-1', signal()),
      client.card('synthetic-case-1', signal()),
      client.decide('synthetic-case-1', input, 'key', signal()),
    ])
      await expect(pending).rejects.toMatchObject({ status: 403 })
  })
  it('取消请求及未知案件失败，合成模式不发送网络请求', async () => {
    const transport = vi.fn()
    vi.stubGlobal('fetch', transport)
    try {
      const client = clientFactory(() => true)
      const controller = new AbortController()
      const pending = client.detail('synthetic-case-1', controller.signal)
      controller.abort()
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
      await expect(client.detail('missing', signal())).rejects.toMatchObject({ status: 404 })
      expect((await client.card('synthetic-case-1', signal())).type).toBe('image/svg+xml')
      expect(transport).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
  it('生产环境即使设置模拟变量也不可用', async () => {
    vi.stubEnv('DEV', false)
    vi.resetModules()
    clientFactory = (await import('./identity')).createIdentityReviewClient
    const client = clientFactory(() => true)
    await expect(client.list(null, signal())).rejects.toMatchObject({ status: 503 })
  })
})
