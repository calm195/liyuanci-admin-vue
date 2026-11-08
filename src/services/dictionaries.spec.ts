import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { parseDictionaries, readDictionaries, saveDictionary } from './dictionaries'
import { useDictionariesStore } from '@/stores/dictionaries'
const item = {
  type: 'resource_feedback',
  code: 'valid',
  label: '有用',
  sort_order: 0,
  enabled: true,
}
const response = { code: 0, data: { version: 1, items: [item] } }
afterEach(() => vi.unstubAllGlobals())
describe('数据库展示字典', () => {
  it('拒绝损坏、重复和失败响应，保留停用项目的历史名称', () => {
    expect(parseDictionaries(response)).toEqual(response.data)
    expect(
      parseDictionaries({ ...response, data: { version: 1, items: [{ ...item, enabled: false }] } })
        .items[0]?.enabled,
    ).toBe(false)
    for (const value of [
      null,
      { ...response, code: 1 },
      { code: 0, data: { version: 1, items: [item, item] } },
      { code: 0, data: { version: 1, items: [{ ...item, label: '' }] } },
    ])
      expect(() => parseDictionaries(value)).toThrow()
  })
  it('保存使用固定幂等键和读取时版本，返回服务端全量快照', async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }))
    vi.stubGlobal('fetch', transport)
    const signal = new AbortController().signal
    await saveDictionary('admin-token', item, 1, 'same-key', signal)
    const call = transport.mock.calls[0] as [string, RequestInit]
    expect(call[0]).toBe('/api/v1/admin/dictionaries/resource_feedback/valid')
    expect(new Headers(call[1].headers).get('Idempotency-Key')).toBe('same-key')
    if (typeof call[1].body !== 'string') throw new Error('缺少请求正文')
    expect(JSON.parse(call[1].body)).toEqual({
      expected_version: 1,
      label: '有用',
      sort_order: 0,
      enabled: true,
    })
  })
  it('拒绝旧版本覆盖新名称，未知代码仅展示原码', async () => {
    setActivePinia(createPinia())
    const store = useDictionariesStore()
    store.accept({ version: 2, items: [{ ...item, label: '确有帮助' }] })
    store.accept(response.data)
    expect(store.label(item.type, item.code)).toBe('确有帮助')
    expect(store.label(item.type, 'new-code')).toBe('new-code')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('离线')))
    await store.load()
    expect(store.error).toContain('加载失败')
    expect(store.label(item.type, item.code)).toBe('确有帮助')
    await expect(readDictionaries()).rejects.toThrow()
  })
})
