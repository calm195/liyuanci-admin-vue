import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useLocalPagination } from './useLocalPagination'
describe('完整列表分页', () => {
  it('默认10条，改变大小或筛选数据回到首页', () => {
    const rows = ref(Array.from({ length: 35 }, (_, index) => index))
    const state = useLocalPagination(rows)
    expect(state.pageRows.value).toEqual(rows.value.slice(0, 10))
    state.page.value = 3
    expect(state.pageRows.value[0]).toBe(20)
    state.pageSize.value = 20
    expect(state.page.value).toBe(1)
    expect(state.pages.value).toBe(2)
    state.page.value = 2
    rows.value = [1, 2]
    expect(state.page.value).toBe(1)
    expect(state.pageRows.value).toEqual([1, 2])
  })
})
