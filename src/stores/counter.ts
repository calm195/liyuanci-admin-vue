import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

/** A small setup store illustrating typed shared state and derived values. */
export const useCounterStore = defineStore('counter', () => {
  const count = ref(0)
  const doubled = computed(() => count.value * 2)
  function increment(): void {
    count.value += 1
  }
  function reset(): void {
    count.value = 0
  }
  return { count, doubled, increment, reset }
})
