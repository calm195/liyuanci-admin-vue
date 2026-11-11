import { describe, expect, it, vi } from 'vitest'
import { createAutoPairingClient, parseAutoPairingJob } from './matchmaking-auto'
import { parseMatchmakingScore } from './matchmaking'
import fixture from './matchmaking-auto.contract.spec.json'
const signal = () => new AbortController().signal
const response = (data: unknown) => Response.json({ code: 0, data })
describe('自动分配协议边界', () => {
  it('接收超过100分的基础与标签评分、双向命中和完整人数', () => {
    const job = parseAutoPairingJob(fixture)
    expect(job.pairs[0]?.score).toBe(120)
    expect(job.pairs[0]?.score_details.personal_to_ideal).toEqual(['温柔', '真诚'])
    expect(job.paired_count * 2 + job.unmatched_count + job.excluded_count).toBe(5)
    expect(
      parseMatchmakingScore({ mbti: 30, age: 20, campus: 25, height: 15, weight: 10 }).traits,
    ).toBe(0)
  })
  it('保留偏好半分和超过原上限的总分', () => {
    const data = structuredClone(fixture)
    const first = data.pairs[0]
    if (!first) throw new Error('缺少合成配对')
    Object.assign(first, {
      score: 212.5,
      score_details: { ...first.score_details, preferred_campus: 2.5, preferred_mbti: 10 },
    })
    data.total_score = 212.5
    const job = parseAutoPairingJob(data)
    expect(job.pairs[0]?.score).toBe(212.5)
    expect(job.total_score).toBe(212.5)
    expect(job.pairs[0]?.score_details.preferred_campus).toBe(2.5)
    first.score = 215.5
    expect(() => parseAutoPairingJob(data)).toThrow()
    first.score = 100.1
    expect(() => parseAutoPairingJob(data)).toThrow()
  })
  it('拒绝人数不一致、重复占用、超限分数和错活动响应', async () => {
    expect(() => parseAutoPairingJob({ ...fixture, participant_count: 6 })).toThrow()
    const duplicate = structuredClone(fixture)
    if (!duplicate.pairs[0]) throw new Error('缺少配对')
    duplicate.pairs[0].second.enrollment_id = duplicate.pairs[0].first.enrollment_id
    expect(() => parseAutoPairingJob(duplicate)).toThrow()
    duplicate.pairs[0].score = 201
    expect(() => parseAutoPairingJob(duplicate)).toThrow()
    const client = createAutoPairingClient(
      'synthetic',
      () => true,
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          response({ ...fixture, activity_id: 'aa110000-0000-4000-8000-000000000009' }),
        ),
    )
    await expect(client.latest(fixture.activity_id, signal())).rejects.toThrow()
  })
  it('生成与应用绑定活动和任务版本，原键重试且不允许路径注入', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(response({ id: fixture.id })))
    const client = createAutoPairingClient('synthetic', () => true, transport)
    const command = {
      kind: 'apply' as const,
      activityID: fixture.activity_id,
      jobID: fixture.id,
      key: 'same',
      body: { expected_version: fixture.version, activity_version: fixture.activity_version },
    }
    await client.execute(command, signal())
    await client.execute(command, signal())
    expect(transport.mock.calls[0]?.[0]).toBe(
      `/api/v1/admin/matchmaking/activities/${fixture.activity_id}/auto-pairing-jobs/${fixture.id}/apply`,
    )
    expect(transport.mock.calls[0]?.[1]?.body).toBe(JSON.stringify(command.body))
    expect(transport.mock.calls[0]?.[1]?.headers).toEqual(transport.mock.calls[1]?.[1]?.headers)
    await expect(client.execute({ ...command, jobID: '../escape' }, signal())).rejects.toThrow()
  })
  it('权限撤回和迟到响应不进入页面', async () => {
    let allowed = true
    const transport = vi.fn<typeof fetch>().mockImplementation(() => {
      allowed = false
      return Promise.resolve(response(fixture))
    })
    await expect(
      createAutoPairingClient('synthetic', () => allowed, transport).latest(
        fixture.activity_id,
        signal(),
      ),
    ).rejects.toMatchObject({ status: 403 })
  })
  it('1000人预览完整解析，配对不丢失', () => {
    const pairs = Array.from({ length: 500 }, (_, index) => {
      const make = (n: number) => ({
        enrollment_id: `cc330000-0000-4000-8000-${String(n).padStart(12, '0')}`,
        name: `合成${n}`,
      })
      return {
        first: make(index * 2 + 1),
        second: make(index * 2 + 2),
        score: 100,
        score_details: {
          mbti: 30,
          age: 20,
          campus: 25,
          height: 15,
          weight: 10,
          traits: 0,
          personal_to_ideal: [],
          ideal_to_personal: [],
        },
      }
    })
    expect(
      parseAutoPairingJob({
        ...fixture,
        participant_count: 1000,
        eligible_count: 1000,
        paired_count: 500,
        unmatched_count: 0,
        excluded_count: 0,
        total_score: 50000,
        pairs,
        unmatched: [],
        excluded: [],
      }).pairs,
    ).toHaveLength(500)
  })
})
