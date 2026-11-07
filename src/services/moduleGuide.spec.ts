import { describe, expect, it } from 'vitest'
import { parseModuleGuide } from './moduleGuide'
const entry = { module: 'wishes', title: '许愿池', body: '说出你的心愿。' }
const wrap = (data: unknown) => ({ code: 0, message: '成功', request_id: 'synthetic', data })
describe('模块说明边界', () => {
  it('允许未发布空快照，拒绝重复模块和畸形版本', () => {
    expect(
      parseModuleGuide(
        wrap({ version: 1, published_version: 0, modules: [], published_modules: [] }),
      ).version,
    ).toBe(1)
    expect(() =>
      parseModuleGuide(
        wrap({ version: 2, published_version: 0, modules: [entry, entry], published_modules: [] }),
      ),
    ).toThrow()
    expect(() =>
      parseModuleGuide(
        wrap({ version: 1, published_version: 1, modules: [entry], published_modules: [entry] }),
      ),
    ).toThrow()
  })
  it('字数按Unicode字符计算，拒绝空白说明', () => {
    expect(
      parseModuleGuide(
        wrap({
          version: 2,
          published_version: 0,
          modules: [{ ...entry, title: '🌞'.repeat(40) }],
          published_modules: [],
        }),
      ).modules[0]?.title,
    ).toHaveLength(80)
    expect(() =>
      parseModuleGuide(
        wrap({
          version: 2,
          published_version: 0,
          modules: [{ ...entry, body: ' ' }],
          published_modules: [],
        }),
      ),
    ).toThrow()
  })
})
