import { computed, onMounted, reactive, ref } from 'vue'
import { useAdminStore } from '@/stores/admin'
import { createUsersClient, normalizeUserFilters } from '@/services/users'
import { ApiError } from '@/services/admin'
import { useAdminWorkspace, reviewErrorMessage } from './useAdminWorkspace'
import { userRoles } from '@/types/users'
import type { UserFilters, UserSummary } from '@/types/users'

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
  const notice = ref('')
  let listRequest = new AbortController()
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
  function clear() {
    listRequest.abort()
    items.value = []
    cursor.value = null
    next.value = null
    history.value = []
    busy.value = false
    Object.assign(draft, defaults())
    submitted.value = defaults()
    error.value = ''
    notice.value = ''
  }
  async function load() {
    listRequest.abort()
    const current = new AbortController()
    listRequest = current
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
    notice.value = ''
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
    notice.value = ''
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
  async function refreshRestrictions(message: string) {
    notice.value = message
    await load()
  }
  onMounted(search)
  return {
    draft,
    items,
    next,
    history,
    busy,
    error,
    notice,
    dirty,
    workspace,
    search,
    page,
    refreshRestrictions,
  }
}
