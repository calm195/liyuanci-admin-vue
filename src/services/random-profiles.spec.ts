import { afterEach, describe, expect, it, vi } from 'vitest'
import { drawRandomProfile, readRandomProfiles, submitRandomProfile } from './random-profiles'

const avatarId = '10000000-0000-4000-8000-000000000001'
const assetId = '20000000-0000-4000-8000-000000000002'
const imagePath = `/random-profiles/images/${assetId}`
const avatar = {
  id: avatarId,
  name: '锦鲤',
  version: 3,
  enabled: true,
  updated_at: '2026-11-25T00:00:00Z',
  image_path: imagePath,
}
const signal = new AbortController().signal

function response(data: object) {
  return Response.json({ code: 0, request_id: 'test-request', message: '成功', data })
}

afterEach(() => vi.unstubAllGlobals())

describe('随机资料接口边界', () => {
  it('仅读取同源不可变头像地址，拒绝可改写路径的图片响应', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ avatars: [avatar], adjectives: [], nouns: [] }))
      .mockResolvedValueOnce(
        response({
          avatars: [{ ...avatar, image_path: 'https://example.com/a.png' }],
          adjectives: [],
          nouns: [],
        }),
      )
      .mockResolvedValueOnce(
        response({
          avatars: [{ ...avatar, image_path: '/random-profiles/images/../admin/session' }],
          adjectives: [],
          nouns: [],
        }),
      )
    vi.stubGlobal('fetch', fetch)
    await expect(readRandomProfiles('synthetic', signal)).resolves.toMatchObject({
      avatars: [{ image_path: `/api/v1${imagePath}` }],
    })
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/admin/random-profiles',
      expect.objectContaining({ credentials: 'omit', signal }),
    )
    await expect(readRandomProfiles('synthetic', signal)).rejects.toThrow('随机资料响应格式异常')
    await expect(readRandomProfiles('synthetic', signal)).rejects.toThrow('随机资料响应格式异常')
  })

  it('换图沿用素材版本和幂等键，由浏览器编码表单并校验返回的资源版本', async () => {
    const replacement = { ...avatar, version: 4 }
    const fetch = vi.fn((_url: string, init: RequestInit) => {
      expect(init.headers).toBeInstanceOf(Headers)
      const headers = new Headers(init.headers)
      expect(headers.get('Idempotency-Key')).toBe('fixed-key')
      expect(headers.get('Content-Type')).toBeNull()
      expect(init.body).toBeInstanceOf(FormData)
      if (!(init.body instanceof FormData)) throw new Error('需要上传表单')
      expect(init.body.get('expected_version')).toBe('3')
      expect(init.body.get('file')).toBe(file)
      return Promise.resolve(response(replacement))
    })
    const file = new File(['test'], 'avatar.png', { type: 'image/png' })
    vi.stubGlobal('fetch', fetch)
    await expect(
      submitRandomProfile(
        'synthetic',
        { type: 'replaceImage', item: avatar, file },
        'fixed-key',
        signal,
      ),
    ).resolves.toMatchObject({ id: avatarId, version: 4 })
    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/v1/admin/random-profiles/avatars/${avatarId}/image`)
    replacement.version = 3
    await expect(
      submitRandomProfile(
        'synthetic',
        { type: 'replaceImage', item: avatar, file },
        'fixed-key',
        signal,
      ),
    ).rejects.toThrow('随机资料响应格式异常')
  })

  it('保留明确的配置冲突代码，并传递当前试抽结果', async () => {
    const result = {
      avatar_id: avatarId,
      nickname: '温柔的锦鲤',
      image_path: imagePath,
      can_reroll: true,
    }
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        Response.json({ error_code: 'RANDOM_PROFILE_POOL_EMPTY' }, { status: 409 }),
      )
      .mockResolvedValueOnce(response(result))
    vi.stubGlobal('fetch', fetch)
    await expect(
      submitRandomProfile(
        'synthetic',
        { type: 'editAvatar', item: avatar, name: '锦鲤', enabled: false },
        'fixed-key',
        signal,
      ),
    ).rejects.toMatchObject({ status: 409, code: 'RANDOM_PROFILE_POOL_EMPTY' })
    await expect(drawRandomProfile('synthetic', result, signal)).resolves.toMatchObject({
      ...result,
      image_path: `/api/v1${imagePath}`,
    })
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/v1/admin/random-profiles/draw',
      expect.objectContaining({
        body: JSON.stringify({ previous_avatar_id: avatarId, previous_nickname: '温柔的锦鲤' }),
      }),
    )
  })
})
