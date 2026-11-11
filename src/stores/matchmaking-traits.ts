import { computed, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import { useAdminStore } from './admin'
import { matchmakingRoles } from '@/types/matchmaking'
import type { TraitReviewCommand } from '@/types/matchmaking-traits'

/** 未确认的审核命令跨页面保留，同一会话用原键和原请求核实结果。 */
export const useTraitCommands = defineStore('matchmaking-trait-commands', () => {
  const admin = useAdminStore()
  const command = shallowRef<TraitReviewCommand | null>(null)
  const pending = computed(() => command.value)
  function clear() {
    command.value = null
  }
  watch(
    () => [admin.session, admin.forbidden, matchmakingRoles.some((role) => admin.can(role))],
    clear,
    { flush: 'sync' },
  )
  function save(value: TraitReviewCommand) {
    if (command.value || !matchmakingRoles.some((role) => admin.can(role))) return false
    command.value = structuredClone(value)
    return true
  }
  return { pending, clear, save }
})
