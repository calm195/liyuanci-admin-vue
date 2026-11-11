import { describe, expect, it } from 'vitest'
import { layoutTraitCloud } from './trait-cloud'
describe('特质词云布局', () => {
  it('热度字号递增，完整展示且互不重叠', () => {
    const words = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      name: `${i}温柔有耐心`,
      heat: i + 1,
    }))
    const result = layoutTraitCloud(words)
    expect(result).toHaveLength(100)
    expect(result[0]?.fontSize).toBeGreaterThan(result[99]?.fontSize ?? 0)
    for (const word of result) {
      expect(word.x).toBeGreaterThanOrEqual(0)
      expect(word.y).toBeGreaterThanOrEqual(0)
      expect(word.x + word.width).toBeLessThanOrEqual(1000)
      expect(word.y + word.height).toBeLessThanOrEqual(600)
      for (const other of result)
        if (other.id !== word.id)
          expect(
            word.x < other.x + other.width &&
              word.x + word.width > other.x &&
              word.y < other.y + other.height &&
              word.y + word.height > other.y,
          ).toBe(false)
    }
  })
  it('空结果和零热度可安全渲染', () => {
    expect(layoutTraitCloud([])).toEqual([])
    expect(layoutTraitCloud([{ id: 'a', name: '真诚', heat: 0 }])[0]?.fontSize).toBeGreaterThan(0)
  })
})
