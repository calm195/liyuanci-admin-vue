import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'

/** 完整快照列表在本地分页；筛选或快照变化时回到首页。 */
export function useLocalPagination<T>(rows: Readonly<Ref<readonly T[]>>) {
  const pageSize = ref(10)
  const page = ref(1)
  const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / pageSize.value)))
  const pageRows = computed(() =>
    rows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value),
  )
  watch(
    [rows, pageSize],
    () => {
      page.value = 1
    },
    { flush: 'sync' },
  )
  return { pageSize, page, pages, pageRows }
}
