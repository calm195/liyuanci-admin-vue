import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAdminStore } from '@/stores/admin'
import { useUserNavigation } from '@/stores/userNavigation'
import { createUsersClient, normalizeUserFilters } from '@/services/users'
import { ApiError } from '@/services/admin'
import { useAdminWorkspace, reviewErrorMessage } from './useAdminWorkspace'
import { userRoles } from '@/types/users'
import type { UserDetail, UserFilters, UserPenalty, UserSummary } from '@/types/users'

const defaults = (): UserFilters => ({
  user_id: '',
  nickname: '',
  verification: '',
  restriction: '',
  limit: 20,
})
export function useUsers() {
  const draft = reactive(defaults())
  const submitted = ref<UserFilters>(defaults())
  const items = ref<UserSummary[]>([])
  const cursor = ref<string | null>(null)
  const next = ref<string | null>(null)
  const history = ref<(string | null)[]>([])
  const busy = ref(false)
  const error = ref('')
  const selected = ref('')
  const detail = ref<UserDetail | null>(null)
  const loading = ref(false)
  const detailError = ref('')
  const penalties = ref<UserPenalty[]>([])
  const penaltyCursor = ref<string | null>(null)
  const penaltyNext = ref<string | null>(null)
  const penaltyHistory = ref<(string | null)[]>([])
  const penaltyBusy = ref(false)
  const penaltyError = ref('')
  let listRequest = new AbortController()
  let detailRequest = new AbortController()
  let penaltyRequest = new AbortController()
  const router = useRouter()
  const navigation = useUserNavigation()
  const returnTarget = navigation.target
  navigation.target = null
  const workspace = useAdminWorkspace(clear, userRoles)
  const client = createUsersClient(useAdminStore().session?.token ?? '', workspace.allowed)
  const dirty = computed(() => JSON.stringify(draft) !== JSON.stringify(submitted.value))
  function message(cause: unknown) {
    if (cause instanceof ApiError && cause.status === 400)
      return '查询条件或分页已失效，请修改条件或从首页重查'
    return cause instanceof ApiError
      ? reviewErrorMessage(cause)
      : '用户查询失败，请检查条件后重试；数据格式异常时请联系管理员'
  }
  function close() {
    detailRequest.abort()
    penaltyRequest.abort()
    selected.value = ''
    detail.value = null
    penalties.value = []
    detailError.value = ''
    penaltyError.value = ''
    loading.value = false
    penaltyBusy.value = false
    penaltyCursor.value = null
    penaltyNext.value = null
    penaltyHistory.value = []
  }
  function clear() {
    listRequest.abort()
    close()
    items.value = []
    cursor.value = null
    next.value = null
    history.value = []
    busy.value = false
    Object.assign(draft, defaults())
    submitted.value = defaults()
    error.value = ''
  }
  async function load(preserveSelection = false) {
    listRequest.abort()
    const current = new AbortController()
    listRequest = current
    if (!preserveSelection) close()
    items.value = []
    next.value = null
    busy.value = true
    error.value = ''
    await workspace.run(
      (signal) =>
        client.users(submitted.value, cursor.value, AbortSignal.any([signal, current.signal])),
      (result) => {
        if (!current.signal.aborted) {
          items.value = result.items
          next.value = result.next_cursor
        }
      },
      (cause) => {
        if (!current.signal.aborted) error.value = message(cause)
      },
      () => {
        if (!current.signal.aborted) busy.value = false
      },
    )
  }
  async function search() {
    try {
      submitted.value = normalizeUserFilters(draft)
      Object.assign(draft, submitted.value)
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '查询条件无效'
      return
    }
    cursor.value = null
    history.value = []
    await load()
  }
  async function page(forward: boolean) {
    if (busy.value || dirty.value) return
    if (forward) {
      if (!next.value) return
      history.value.push(cursor.value)
      cursor.value = next.value
    } else {
      if (!history.value.length) return
      cursor.value = history.value.pop() ?? null
    }
    await load()
  }
  async function missing() {
    close()
    await load()
    error.value = '该用户已不可访问，列表已刷新'
  }
  async function loadPenalties() {
    if (!detail.value?.allowed_actions.includes('view_penalties')) return
    penaltyRequest.abort()
    const current = new AbortController()
    penaltyRequest = current
    const id = selected.value
    penalties.value = []
    penaltyNext.value = null
    penaltyBusy.value = true
    penaltyError.value = ''
    await workspace.run(
      (signal) =>
        client.userPenalties(id, penaltyCursor.value, AbortSignal.any([signal, current.signal])),
      (result) => {
        if (!current.signal.aborted) {
          penalties.value = result.items
          penaltyNext.value = result.next_cursor
        }
      },
      async (cause) => {
        if (current.signal.aborted) return
        if (cause instanceof ApiError && cause.status === 404) await missing()
        else penaltyError.value = message(cause)
      },
      () => {
        if (!current.signal.aborted) penaltyBusy.value = false
      },
    )
  }
  async function open(id: string) {
    close()
    const current = new AbortController()
    detailRequest = current
    selected.value = id
    loading.value = true
    await workspace.run(
      (signal) => client.user(id, AbortSignal.any([signal, current.signal])),
      async (result) => {
        if (!current.signal.aborted) {
          detail.value = result
          loading.value = false
          await loadPenalties()
        }
      },
      async (cause) => {
        if (current.signal.aborted) return
        if (cause instanceof ApiError && cause.status === 404) await missing()
        else detailError.value = message(cause)
      },
      () => {
        if (!current.signal.aborted) loading.value = false
      },
    )
  }
  async function historyPage(forward: boolean) {
    if (penaltyBusy.value) return
    if (forward) {
      if (!penaltyNext.value) return
      penaltyHistory.value.push(penaltyCursor.value)
      penaltyCursor.value = penaltyNext.value
    } else {
      if (!penaltyHistory.value.length) return
      penaltyCursor.value = penaltyHistory.value.pop() ?? null
    }
    await loadPenalties()
  }
  async function refreshSelected() {
    const id = selected.value
    if (!id || !workspace.allowed()) return
    await Promise.all([load(true), open(id)])
  }
  async function navigate(path: string, query?: Record<string, string>) {
    if (!detail.value || !workspace.allowed()) return
    navigation.target = detail.value.id
    try {
      await router.push({ path, query: query ?? {} })
    } catch {
      navigation.target = null
      detailError.value = '页面跳转未完成，请重试'
    }
  }
  onMounted(async () => {
    await search()
    if (returnTarget && workspace.allowed()) await open(returnTarget)
  })
  return {
    draft,
    submitted,
    items,
    next,
    history,
    busy,
    error,
    dirty,
    selected,
    detail,
    loading,
    detailError,
    penalties,
    penaltyNext,
    penaltyHistory,
    penaltyBusy,
    penaltyError,
    workspace,
    search,
    page,
    open,
    close,
    loadPenalties,
    historyPage,
    navigate,
    refreshSelected,
  }
}
