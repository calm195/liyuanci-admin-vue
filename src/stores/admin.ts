import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, adminRequest, loginAdmin, revokeAdmin } from '@/services/admin'
import type { AdminSession, Role } from '@/types/admin'

/** 后台会话仅保存在内存中，刷新页面后需重新登录。 */
export const useAdminStore = defineStore('admin-session', () => {
  const session = ref<AdminSession | null>(null)
  const notice = ref('')
  const forbidden = ref(0)
  let generation = 0
  const authenticated = computed(() => session.value?.account.active === true)
  function clear(message = '') {
    generation++
    session.value = null
    notice.value = message
  }
  async function login(role: Role) {
    const current = ++generation
    const result = await Promise.resolve(loginAdmin(role))
    if (current === generation) {
      session.value = result
      notice.value = ''
    }
  }
  function can(role: Role) {
    return (
      authenticated.value &&
      (session.value?.account.roles.includes('super_admin') === true ||
        session.value?.account.roles.includes(role) === true)
    )
  }
  async function request(path: `/admin/${string}`, init?: RequestInit) {
    const current = session.value
    if (!current) {
      clear('请先登录后台')
      throw new ApiError(401)
    }
    try {
      const result = await adminRequest(path, current.token, init)
      if (session.value !== current) throw new Error('会话已变更，请重新操作')
      return result
    } catch (error) {
      if (session.value === current && error instanceof ApiError && error.status === 401)
        clear(error.message)
      if (session.value === current && error instanceof ApiError && error.status === 403)
        forbidden.value++
      throw error
    }
  }
  async function logout() {
    const token = session.value?.token
    clear()
    if (token) {
      try {
        await revokeAdmin(token)
      } catch {
        notice.value = '本地会话已清除；服务端撤销未确认，请联系管理员核验。'
      }
    }
  }
  return { session, notice, forbidden, authenticated, can, login, clear, request, logout }
})
