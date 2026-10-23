import { describe, expect, it, vi } from 'vitest'
import { createPrivacyClient, parseDeletionProgress, validDeletionReason } from './privacy'
import { ApiError } from './admin'
const evidenceId = '11111111-1111-4111-8111-111111111111'
const jobId = '22222222-2222-4222-8222-222222222222'
const signal = () => new AbortController().signal
const envelope = (data: unknown, status = 200) =>
  Response.json({ code: 0, message: '测试', request_id: 'trace', data }, { status })
describe('T032 REQ-018/019 删除边界与真实协议', () => {
  it('读取证据只保留元信息，删除使用范围版本并保留同一个幂等键', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        envelope({
          id: evidenceId,
          case_id: 'crisis',
          version: 9,
          status: 'resolved',
          body: '私密正文',
          student_number: '学号',
          url: 'private',
        }),
      )
      .mockImplementation(() =>
        Promise.resolve(
          envelope({ id: jobId, version: 1, status: 'pending', body: '不保存' }, 202),
        ),
      )
    const client = createPrivacyClient('token', () => true, transport)
    expect(await client.evidence(evidenceId, signal())).toEqual({
      id: evidenceId,
      case_id: 'crisis',
      version: 9,
      status: 'resolved',
    })
    const input = { reason: '核对理由', expected_version: 9, account_id: '不发送' }
    for (let i = 0; i < 2; i++)
      expect(await client.remove(evidenceId, input, 'stable', signal())).toEqual({
        id: jobId,
        version: 1,
        status: 'pending',
      })
    for (const [url, init] of transport.mock.calls.slice(1)) {
      expect(url).toBe(`/api/v1/admin/evidence/${evidenceId}`)
      expect(init).toMatchObject({
        method: 'DELETE',
        body: JSON.stringify({ reason: input.reason, expected_version: 9 }),
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      })
      expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('stable')
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token')
    }
  })
  it('进度不保存身份或原始对象，匿名回执不携带后台令牌和查询参数', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(
        envelope({
          status: 'processing',
          retryable_error: 'external_cleanup_unavailable',
          body: '不保存',
          target_ref: '不保存',
        }),
      ),
    )
    const client = createPrivacyClient('token', () => true, transport)
    const receipt = `${jobId}.${'a'.repeat(43)}`
    expect(await client.job(jobId, signal())).toEqual({
      status: 'processing',
      retryable_error: 'external_cleanup_unavailable',
    })
    await client.receipt(receipt, signal())
    expect(transport.mock.calls[0]?.[0]).toBe(`/api/v1/admin/evidence-deletion-jobs/${jobId}`)
    expect(transport.mock.calls[1]?.[0]).toBe(`/api/v1/deletion-receipts/${receipt}`)
    expect(new Headers(transport.mock.calls[1]?.[1]?.headers).has('Authorization')).toBe(false)
    expect(parseDeletionProgress({ status: 'completed', retryable_error: 'stale' })).toEqual({
      status: 'completed',
    })
  })
  it.each([400, 401, 403, 404, 409, 429, 503])('保留HTTP %s且不泄漏错误正文', async (status) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ body: '私密错误' }, { status }))
    await expect(
      createPrivacyClient('token', () => true, transport).job(jobId, signal()),
    ).rejects.toEqual(new ApiError(status))
  })
  it('拒绝错误状态、跨证据回包和缺失版本', async () => {
    expect(
      parseDeletionProgress({ status: 'processing', retryable_error: '原始内部错误' }),
    ).toEqual({ status: 'processing', retryable_error: 'cleanup_unavailable' })
    expect(() => parseDeletionProgress({ status: 'pending' })).toThrow()
    expect(() => parseDeletionProgress({ status: 'processing', retryable_error: {} })).toThrow()
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(envelope({ id: jobId, version: 1, case_id: 'case', status: 'open' }))
    await expect(
      createPrivacyClient('token', () => true, transport).evidence(evidenceId, signal()),
    ).rejects.toThrow('不匹配')
    const bad = vi
      .fn<typeof fetch>()
      .mockResolvedValue(envelope({ id: jobId, status: 'pending' }, 202))
    await expect(
      createPrivacyClient('token', () => true, bad).remove(
        evidenceId,
        { reason: '理由', expected_version: 9 },
        'key',
        signal(),
      ),
    ).rejects.toThrow()
  })
  it('中文理由按字节限制，畸形输入不发送请求', async () => {
    expect(validDeletionReason('中'.repeat(666) + 'ab')).toBe(true)
    expect(validDeletionReason('中'.repeat(667))).toBe(false)
    expect(validDeletionReason(' ')).toBe(false)
    const transport = vi.fn<typeof fetch>()
    const client = createPrivacyClient('token', () => true, transport)
    await expect(
      client.remove(evidenceId, { reason: '中'.repeat(667), expected_version: 1 }, 'key', signal()),
    ).rejects.toThrow()
    await expect(
      client.remove(evidenceId, { reason: '理由', expected_version: 0 }, 'key', signal()),
    ).rejects.toThrow()
    await expect(client.job('../x?token=secret', signal())).rejects.toThrow()
    await expect(client.receipt(`${jobId}.${'a'.repeat(43)}.extra`, signal())).rejects.toThrow()
    expect(transport).not.toHaveBeenCalled()
  })
  it('请求前、响应后、解析后均重新检查权限和取消', async () => {
    let allowed = false
    const transport = vi.fn<typeof fetch>()
    const client = createPrivacyClient('token', () => allowed, transport)
    await expect(client.job(jobId, signal())).rejects.toEqual(new ApiError(403))
    expect(transport).not.toHaveBeenCalled()
    allowed = true
    transport.mockImplementation(() => {
      allowed = false
      return Promise.resolve(envelope({ status: 'completed' }))
    })
    await expect(client.job(jobId, signal())).rejects.toEqual(new ApiError(403))
    allowed = true
    transport.mockImplementation(() => {
      const response = envelope({ status: 'completed' })
      vi.spyOn(response, 'json').mockImplementation(() => {
        allowed = false
        return Promise.resolve({
          code: 0,
          message: '测试',
          request_id: 'trace',
          data: { status: 'completed' },
        })
      })
      return Promise.resolve(response)
    })
    await expect(client.job(jobId, signal())).rejects.toEqual(new ApiError(403))
    const controller = new AbortController()
    controller.abort()
    await expect(client.job(jobId, controller.signal)).rejects.toThrow()
  })
})
