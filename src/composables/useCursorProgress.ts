import { ref } from 'vue'
/** 跟踪已消费游标，阻止重复游标导致无限加载；刷新后重新建立进度。 */
export function useCursorProgress() {
  const nextCursor = ref<string | null>(null)
  const listNotice = ref('')
  const consumed = new Set<string | null>()
  function reset() {
    consumed.clear()
    nextCursor.value = null
    listNotice.value = ''
  }
  function accept(current: string | null, next: string | null) {
    consumed.add(current)
    if (next !== null && consumed.has(next)) {
      nextCursor.value = null
      listNotice.value = '分页游标重复，已停止加载，请刷新列表。'
    } else {
      nextCursor.value = next
      listNotice.value = ''
    }
  }
  return { nextCursor, listNotice, reset, accept }
}
