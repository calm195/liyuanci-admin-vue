import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  ApiError,
  adminRequest,
  loginAdmin,
  restoreAdmin,
  revokeAdmin,
  changeAdminPassword,
} from '@/services/admin'
import type { AdminSession, Role, AdminLoginInput, AdminPasswordInput } from '@/types/admin'

/** 访问令牌仅保存在内存中，启动时通过服务端 Cookie 恢复有效会话。 */
export const useAdminStore = defineStore('admin-session', () => {
  const session = ref<AdminSession | null>(null)
  const notice = ref('')
  const forbidden = ref(0)
  const initialized = ref(false)
  const restoring = ref(false)
  const restoreError = ref('')
  let restorePending: Promise<void> | null = null
  function restore() {
    if (session.value) {
      restoreError.value = ''
      initialized.value = true
      return Promise.resolve()
    }
    if (initialized.value) return Promise.resolve()
    if (restorePending) return restorePending
    const current = generation
    restoring.value = true
    restoreError.value = ''
    restorePending = (async () => {
      try {
        const result = await restoreAdmin()
        if (generation !== current) return
        session.value = result
        initialized.value = true
      } catch (cause) {
        if (generation !== current) return
        if (cause instanceof ApiError && cause.status === 401) initialized.value = true
        else restoreError.value = '暂时无法恢复登录，请检查网络后重试'
      } finally {
        restoring.value = false
        restorePending = null
      }
    })()
    return restorePending
  }
  let generation = 0
  const authenticated = computed(() => session.value?.account.active === true)
  function clear(message = '') {
    generation++
    initialized.value = true
    restoreError.value = ''
    session.value = null
    notice.value = message
  }
  async function login(input: AdminLoginInput, signal?: AbortSignal) {
    const current = ++generation
    const result = await loginAdmin(input, signal)
    signal?.throwIfAborted()
    if (current !== generation) throw new Error('登录操作已失效，请重新登录')
    session.value = result
    initialized.value = true
    restoreError.value = ''
    notice.value = '登录成功'
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
        if (current === generation) notice.value = '已退出登录'
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
    initialized,
    restoring,
    restoreError,
    restore,
    can,
    login,
    changePassword,
    clear,
    request,
    logout,
  }
})
