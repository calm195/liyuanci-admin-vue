import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useAdminStore } from './admin'

/** 跨案件页面仅传递内存中的目标约束；会话变动或撤权立即清除。 */
export const useUserNavigation = defineStore('user-navigation', () => {
  const target = ref<string | null>(null)
  const admin = useAdminStore()
  watch(
    () => [admin.session, admin.forbidden, admin.session?.account.roles.join(',')],
    () => {
      target.value = null
    },
    { flush: 'sync' },
  )
  return { target }
})
