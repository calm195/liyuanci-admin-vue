import type { TraitWord } from '@/types/matchmaking-traits'
export interface CloudWord extends TraitWord {
  x: number
  y: number
  width: number
  height: number
  fontSize: number
}

/** 矩形碰撞检测沿螺旋排布；整组逐级缩小，保证长词也能完整显示。 */
export function layoutTraitCloud(words: readonly TraitWord[]): CloudWord[] {
  const sorted = [...words].sort((a, b) => b.heat - a.heat || a.name.localeCompare(b.name))
  const maximum = Math.max(1, ...sorted.map((word) => word.heat))
  for (let scale = 1; scale >= 0.2; scale -= 0.08) {
    const result: CloudWord[] = []
    for (const word of sorted) {
      const fontSize = (18 + 38 * Math.sqrt(word.heat / maximum)) * scale
      // 每个字符按一个全角字宽预算，避免字体替换造成相邻词语重叠。
      const width = [...word.name].length * fontSize + 12,
        height = fontSize * 1.5 + 8
      let placed = false
      for (let step = 0; step < 6000; step++) {
        const angle = step * 0.22,
          radius = 2.4 * Math.sqrt(step)
        const x = 500 + Math.cos(angle) * radius * 2.8 - width / 2
        const y = 300 + Math.sin(angle) * radius * 1.6 - height / 2
        if (x < 8 || y < 8 || x + width > 992 || y + height > 592) continue
        if (
          result.some(
            (other) =>
              x < other.x + other.width &&
              x + width > other.x &&
              y < other.y + other.height &&
              y + height > other.y,
          )
        )
          continue
        result.push({ ...word, x, y, width, height, fontSize })
        placed = true
        break
      }
      if (!placed) break
    }
    if (result.length === sorted.length) return result
  }
  // 极端长词密集场景仍完整显示，保留热度字号差异并采用规则网格兜底。
  return sorted.map((word, index) => {
    const width = 200,
      height = 600 / Math.ceil(sorted.length / 5)
    return {
      ...word,
      x: (index % 5) * width,
      y: Math.floor(index / 5) * height,
      width,
      height,
      fontSize: Math.min(
        10 + 4 * Math.sqrt(word.heat / maximum),
        180 / Math.max(1, [...word.name].length),
        height / 1.6,
      ),
    }
  })
}
