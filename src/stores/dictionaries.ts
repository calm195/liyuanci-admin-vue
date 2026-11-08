import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { readDictionaries } from '@/services/dictionaries'
import type { DictionarySnapshot } from '@/services/dictionaries'
/** 展示字典只有数据库一个来源；未知代码显示原码，不影响后端权限判断。 */
export const useDictionariesStore = defineStore('dictionaries', () => {
  const snapshot = ref<DictionarySnapshot>({ version: 0, items: [] })
  const error = ref('')
  const busy = ref(false)
  const index = computed(
    () => new Map(snapshot.value.items.map((item) => [`${item.type}/${item.code}`, item.label])),
  )
  function label(type: string, code: string) {
    return index.value.get(`${type}/${code}`) ?? code
  }
  function accept(value: DictionarySnapshot) {
    if (value.version >= snapshot.value.version) snapshot.value = value
    error.value = ''
  }
  async function load() {
    if (busy.value) return
    busy.value = true
    try {
      accept(await readDictionaries())
    } catch {
      error.value = '展示字典加载失败，当前显示原始代码，请重试'
    } finally {
      busy.value = false
    }
  }
  return { snapshot, error, busy, label, accept, load }
})
