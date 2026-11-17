import { computed, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import { useAdminStore } from './admin'
import type { ReviewDecision } from '@/types/moderation'

export interface ModerationCommand {
  id: string
  key: string
  body: ReviewDecision
}

/** 已提交但未确认的审核命令只在原会话内保留，关闭展示和路由切换不改变原请求。 */
export const useModerationCommands = defineStore('moderation-commands', () => {
  const admin = useAdminStore()
  const command = shallowRef<ModerationCommand | null>(null)
  const pending = computed(() => command.value)
  function clear() {
    command.value = null
  }
  watch(() => [admin.session, admin.forbidden, admin.can('review_operator')], clear, {
    flush: 'sync',
  })
  function save(value: ModerationCommand) {
    if (command.value || !admin.can('review_operator')) return false
    command.value = structuredClone(value)
    return true
  }
  return { pending, clear, save }
})
