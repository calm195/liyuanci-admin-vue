import { describe, expect, it, vi } from 'vitest'
import fixture from './matchmaking.contract.spec.json'
import {
  createMatchmakingClient,
  parseActivityPage,
  parseCandidates,
  parseMatchmakingWorkspace,
} from './matchmaking'
import type { PendingCommand } from '@/types/matchmaking'

const id = fixture.workspace.data.activity.id
describe('包分配后台协议边界', () => {
  it('读取活动、审核资料、分项评分和模板锁定状态', () => {
    expect(parseActivityPage(fixture.list).items[0]?.title).toBe('冬日相遇')
    expect(parseMatchmakingWorkspace(fixture.workspace).enrollments[0]?.profile?.weight).toBe(130)
    expect(parseMatchmakingWorkspace(fixture.workspace).pairs[0]?.member_names).toHaveLength(2)
    expect(parseCandidates(fixture.candidates)[0]?.score_details.campus).toBe(25)
  })
  it('报名资料保留个人与理想标签，旧快照缺省为空', () => {
    const data = structuredClone(fixture.workspace)
    const first = data.data.enrollments[0]
    if (!first) throw new Error('缺少合成报名')
    Object.assign(first.profile, { personal_traits: ['温柔'], ideal_traits: ['真诚'] })
    const profile = parseMatchmakingWorkspace(data).enrollments[0]?.profile
    expect(profile?.personal_traits).toEqual(['温柔'])
    expect(profile?.ideal_traits).toEqual(['真诚'])
    expect(
      parseMatchmakingWorkspace(fixture.workspace).enrollments[0]?.profile?.personal_traits,
    ).toEqual([])
  })
  it('拒绝畸形状态、无时区时间、超限模板和反向区间', () => {
    const changed = structuredClone(fixture.workspace)
    changed.data.activity.phase = 'unknown'
    expect(() => parseMatchmakingWorkspace(changed)).toThrow()
    changed.data.activity.phase = 'draft'
    changed.data.activity.starts_at = '2026-12-07 09:00:00'
    expect(() => parseMatchmakingWorkspace(changed)).toThrow()
    const reversed = structuredClone(fixture.workspace)
    const profile = reversed.data.enrollments[0]?.profile
    if (!profile) throw new Error('合成资料缺失')
    profile.age_min = 30
    expect(() => parseMatchmakingWorkspace(reversed)).toThrow()
    expect(() =>
      parseMatchmakingWorkspace({
        ...fixture.workspace,
        data: {
          ...fixture.workspace.data,
          templates: Array.from({ length: 31 }, () => fixture.workspace.data.templates[0]),
        },
      }),
    ).toThrow()
  })
  it('分页走受控同源URL，写入保留原键原请求，不接受路径注入', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(fixture.list), { status: 200 }))
    const client = createMatchmakingClient('synthetic', () => true, transport)
    const signal = new AbortController().signal
    await client.activities(2, signal)
    expect(transport).toHaveBeenCalledWith(
      '/api/v1/admin/matchmaking/activities?page=2&limit=20',
      expect.objectContaining({ credentials: 'omit', redirect: 'error', cache: 'no-store' }),
    )
    const command: PendingCommand = {
      path: `/admin/matchmaking/activities/${id}/publish`,
      method: 'POST',
      body: { expected_version: 3, reason: '' },
      key: 'same-key',
      title: '发布活动',
      activityID: id,
    }
    transport.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(fixture.receipt), { status: 200 })),
    )
    await client.execute(command, signal)
    await client.execute(command, signal)
    expect(transport.mock.calls[1]?.[1]?.body).toEqual(transport.mock.calls[2]?.[1]?.body)
    expect(transport.mock.calls[1]?.[1]?.headers).toEqual(transport.mock.calls[2]?.[1]?.headers)
    await expect(
      client.execute({ ...command, path: '/admin/matchmaking/activities/../../users' }, signal),
    ).rejects.toThrow()
  })
  it('换号后丢弃已经返回的响应', async () => {
    let allowed = true
    const transport = vi.fn<typeof fetch>().mockImplementation(() => {
      allowed = false
      return Promise.resolve(new Response(JSON.stringify(fixture.list)))
    })
    await expect(
      createMatchmakingClient('synthetic', () => allowed, transport).activities(
        1,
        new AbortController().signal,
      ),
    ).rejects.toThrow()
  })
  it('拒绝与请求活动不符的工作台，防止资料回填到另一活动', async () => {
    const client = createMatchmakingClient(
      'synthetic',
      () => true,
      vi.fn<typeof fetch>().mockResolvedValue(Response.json(fixture.workspace)),
    )
    await expect(
      client.workspace('bb220000-0000-4000-8000-000000000001', 1, new AbortController().signal),
    ).rejects.toThrow('当前选择不一致')
  })
  it('重复记录、总数倒置、重复固定日期和超量候选不进入工作台', () => {
    expect(() =>
      parseActivityPage({
        ...fixture.list,
        data: { items: [fixture.list.data.items[0], fixture.list.data.items[0]], total: 2 },
      }),
    ).toThrow()
    expect(() =>
      parseMatchmakingWorkspace({
        ...fixture.workspace,
        data: { ...fixture.workspace.data, total: 0 },
      }),
    ).toThrow()
    const template = { kind: 'online', body: '合成固定任务', fixed_day: 1 }
    expect(() =>
      parseMatchmakingWorkspace({
        ...fixture.workspace,
        data: { ...fixture.workspace.data, templates: [template, template] },
      }),
    ).toThrow()
    expect(() =>
      parseCandidates({
        ...fixture.candidates,
        data: { items: Array.from({ length: 51 }, () => fixture.candidates.data.items[0]) },
      }),
    ).toThrow()
  })
  it('读取响应正文期间撤权同样丢弃内容', async () => {
    let allowed = true
    const result = Response.json(fixture.list)
    vi.spyOn(result, 'json').mockImplementation(() => {
      allowed = false
      return Promise.resolve(fixture.list)
    })
    const client = createMatchmakingClient(
      'synthetic',
      () => allowed,
      vi.fn<typeof fetch>().mockResolvedValue(result),
    )
    await expect(client.activities(1, new AbortController().signal)).rejects.toThrow()
  })
})
