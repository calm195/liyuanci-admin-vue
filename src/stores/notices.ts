import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export type NoticeTone = 'success' | 'error' | 'info' | 'warning' | 'uncertain' | 'pending'
interface Notice {
  id: number
  message: string
  tone: NoticeTone
  height: number
}

/** 同时最多展示三条操作提示；重复消息合并，关闭提示不修改业务错误状态。 */
export const useNoticesStore = defineStore('floating-notices', () => {
  const items = ref<Notice[]>([])
  let sequence = 0
  const offsets = computed(() => {
    let top = 20
    const positions = new Map<number, number>()
    for (const item of items.value) {
      positions.set(item.id, top)
      top += item.height + 12
    }
    return positions
  })
  function allocate() {
    return ++sequence
  }
  function remove(id: number) {
    items.value = items.value.filter((item) => item.id !== id)
  }
  function show(id: number, message: string, tone: NoticeTone) {
    items.value = items.value.filter(
      (item) => item.id !== id && !(item.message === message && item.tone === tone),
    )
    if (message.trim()) items.value = [...items.value.slice(-2), { id, message, tone, height: 76 }]
  }
  function measure(id: number, height: number) {
    const item = items.value.find((value) => value.id === id)
    if (item && Math.abs(item.height - height) > 0.5) item.height = height
  }
  return { items, offsets, allocate, show, remove, measure }
})
