import { computed, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import { useAdminStore } from './admin'
import { matchmakingRoles } from '@/types/matchmaking'
import type { AutoPairingCommand } from '@/types/matchmaking-auto'
/** 后台任务提交和应用结果未知时保留原请求；会话退出和撤权立即清除。 */
export const useAutoPairingCommands = defineStore('matchmaking-auto-commands', () => {
  const admin = useAdminStore(),
    command = shallowRef<AutoPairingCommand | null>(null)
  const pending = computed(() => command.value)
  function clear() {
    command.value = null
  }
  watch(
    () => [admin.session, admin.forbidden, matchmakingRoles.some((role) => admin.can(role))],
    clear,
    { flush: 'sync' },
  )
  function save(value: AutoPairingCommand) {
    if (command.value || !matchmakingRoles.some((role) => admin.can(role))) return false
    command.value = structuredClone(value)
    return true
  }
  return { pending, clear, save }
})
