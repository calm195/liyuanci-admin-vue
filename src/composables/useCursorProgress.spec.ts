import { describe, expect, it } from 'vitest'
import { useCursorProgress } from './useCursorProgress'
describe('游标进度', () => {
  it('拒绝回到已消费的游标，刷新后允许重新查询', () => {
    const progress = useCursorProgress()
    progress.accept(null, 'first')
    progress.accept('first', 'second')
    progress.accept('second', 'first')
    expect(progress.nextCursor.value).toBeNull()
    expect(progress.listNotice.value).toContain('游标重复')
    progress.reset()
    progress.accept(null, 'first')
    expect(progress.nextCursor.value).toBe('first')
    expect(progress.listNotice.value).toBe('')
  })
})
