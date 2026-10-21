import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  ApiError,
  adminRequest,
  loginAdmin,
  revokeAdmin,
  changeAdminPassword,
} from '@/services/admin'
import type { AdminSession, Role, AdminLoginInput, AdminPasswordInput } from '@/types/admin'

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
  async function login(input: AdminLoginInput, signal?: AbortSignal) {
    const current = ++generation
    const result = await loginAdmin(input, signal)
    signal?.throwIfAborted()
    if (current !== generation) throw new Error('登录操作已失效，请重新登录')
    session.value = result
    notice.value = ''
  }
  let passwordBusy = false
  async function changePassword(input: AdminPasswordInput, key: string, signal?: AbortSignal) {
    if (passwordBusy) throw new Error('改密正在提交，请勿重复操作')
    const owner = session.value
    const currentGeneration = generation
    if (!owner) throw new ApiError(401)
    const current = () => session.value === owner && generation === currentGeneration
    passwordBusy = true
    try {
      await changeAdminPassword(owner.token, input, key, signal)
      signal?.throwIfAborted()
      if (!current()) throw new Error('会话已变更，请重新操作')
      clear('口令已修改，请重新登录')
    } catch (cause) {
      if (current() && cause instanceof ApiError && cause.status === 401) clear(cause.message)
      // 本人旧口令错误不属于角色越权，不触发全局拒绝页。
      throw cause
    } finally {
      passwordBusy = false
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
    const currentGeneration = generation
    if (!current) {
      clear('请先登录后台')
      throw new ApiError(401)
    }
    try {
      const result = await adminRequest(path, current.token, init)
      if (session.value !== current || generation !== currentGeneration)
        throw new Error('会话已变更，请重新操作')
      return result
    } catch (error) {
      if (
        session.value === current &&
        generation === currentGeneration &&
        error instanceof ApiError &&
        error.status === 401
      )
        clear(error.message)
      if (
        session.value === current &&
        generation === currentGeneration &&
        error instanceof ApiError &&
        error.status === 403
      )
        forbidden.value++
      throw error
    }
  }
  async function logout() {
    const token = session.value?.token
    clear()
    const current = generation
    if (token) {
      try {
        await revokeAdmin(token)
      } catch {
        // 旧退出请求的结果不得覆盖后续登录的提示。
        if (current === generation)
          notice.value = '本地会话已清除；服务端撤销未确认，请联系管理员核验。'
      }
    }
  }
  return {
    session,
    notice,
    forbidden,
    authenticated,
    can,
    login,
    changePassword,
    clear,
    request,
    logout,
  }
})
