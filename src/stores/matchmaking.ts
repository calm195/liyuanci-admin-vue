import { computed, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import { useAdminStore } from './admin'
import { matchmakingRoles } from '@/types/matchmaking'
import type { PendingCommand } from '@/types/matchmaking'

/** 未确认命令只留在当前管理会话内存；离页后仍以原键核实，换号或撤权立即销毁。 */
export const useMatchmakingCommands = defineStore('matchmaking-commands', () => {
  const admin = useAdminStore()
  const command = shallowRef<PendingCommand | null>(null)
  const pending = computed(() => command.value)
  function clear() {
    command.value = null
  }
  watch(
    () => [admin.session, admin.forbidden, matchmakingRoles.some((role) => admin.can(role))],
    clear,
    { flush: 'sync' },
  )
  function save(value: PendingCommand) {
    if (command.value || !matchmakingRoles.some((role) => admin.can(role))) return false
    // 提交前形成独立快照，后续表单编辑不能改变原请求。
    command.value = structuredClone(value)
    return true
  }
  return { pending, save, clear }
})
