import { computed, onMounted, reactive, ref } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { useAdminStore } from '@/stores/admin'
import { useAdminWorkspace } from './useAdminWorkspace'
import {
  createResourcesClient,
  resourceId,
  normalizeResourceFilters,
  normalizeResourceInput,
  normalizeResourceText,
  ResourceApiError,
  resourceErrorMessage,
} from '@/services/resources'
import { resourceRoles } from '@/types/resources'
import type {
  AdminResourceCategory,
  ResourceDetail,
  ResourceFilters,
  ResourceInput,
  ResourceSummary,
} from '@/types/resources'

const defaults = (): ResourceFilters => ({ q: '', category_id: '', status: '', limit: 20 })
const blank = (): ResourceInput => ({
  title: '',
  category_id: '',
  description: '',
  download_url: '',
  extraction_code: null,
})
type Pending =
  | { key: string; kind: 'create'; input: ResourceInput }
  | { key: string; kind: 'update'; id: string; input: ResourceInput & { expected_version: number } }
  | { key: string; kind: 'publish'; id: string; version: number }
  | { key: string; kind: 'offline'; id: string; version: number; reason: string; edit: boolean }
export function useResources() {
  const route = useRoute()
  const filters = reactive(defaults()),
    submitted = ref(defaults())
  const items = ref<ResourceSummary[]>([]),
    categories = ref<AdminResourceCategory[]>([])
  const cursor = ref<string | null>(null),
    next = ref<string | null>(null),
    history = ref<(string | null)[]>([])
  const error = ref(''),
    categoryError = ref(''),
    notice = ref(''),
    detailError = ref('')
  const busy = ref(false),
    loading = ref(false),
    writing = ref(false),
    categoriesBusy = ref(false)
  const selected = ref(''),
    detail = ref<ResourceDetail | null>(null)
  const mode = ref<'detail' | 'create' | 'edit' | 'offline'>('detail'),
    afterOfflineEdit = ref(false)
  const form = reactive(blank()),
    reason = ref(''),
    conflict = ref(false),
    pending = ref<Pending | null>(null)
  let listRequest = new AbortController(),
    detailRequest = new AbortController(),
    categoryRequest = new AbortController()
  const workspace = useAdminWorkspace(clear, resourceRoles)
  const client = createResourcesClient(useAdminStore().session?.token ?? '', workspace.allowed)
  const dirty = computed(() => JSON.stringify(filters) !== JSON.stringify(submitted.value))
  const hasDraft = computed(() => !!selected.value && mode.value !== 'detail')
  function resetDetail() {
    detailRequest.abort()
    selected.value = ''
    detail.value = null
    detailError.value = ''
    mode.value = 'detail'
    conflict.value = false
    pending.value = null
    loading.value = false
    writing.value = false
    reason.value = ''
    Object.assign(form, blank())
  }
  function clear() {
    listRequest.abort()
    categoryRequest.abort()
    resetDetail()
    items.value = []
    categories.value = []
    next.value = null
    history.value = []
    cursor.value = null
    busy.value = false
    categoriesBusy.value = false
    error.value = ''
    categoryError.value = ''
    notice.value = ''
    Object.assign(filters, defaults())
    submitted.value = defaults()
  }
  function canLeave() {
    return (
      !writing.value &&
      (!(hasDraft.value || pending.value) ||
        window.confirm(
          pending.value
            ? '操作结果尚未确认，关闭后请先核对服务端结果，避免重复创建。确认放弃？'
            : '放弃尚未保存的输入？已下架的资料不会自动恢复上架。',
        ))
    )
  }
  function close() {
    if (canLeave()) resetDetail()
  }
  onBeforeRouteLeave(canLeave)
  async function load() {
    listRequest.abort()
    const request = new AbortController()
    listRequest = request
    busy.value = true
    items.value = []
    next.value = null
    error.value = ''
    await workspace.run(
      (signal) =>
        client.list(submitted.value, cursor.value, AbortSignal.any([signal, request.signal])),
      (result) => {
        if (!request.signal.aborted) {
          items.value = [...new Map(result.items.map((item) => [item.id, item])).values()]
          next.value = result.next_cursor
        }
      },
      (cause) => {
        if (!request.signal.aborted) error.value = resourceErrorMessage(cause)
      },
      () => {
        if (!request.signal.aborted) busy.value = false
      },
    )
  }
  async function search() {
    try {
      submitted.value = normalizeResourceFilters(filters)
      Object.assign(filters, submitted.value)
    } catch (cause) {
      error.value = resourceErrorMessage(cause)
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
  async function loadCategories() {
    categoryRequest.abort()
    const request = new AbortController()
    categoryRequest = request
    categoriesBusy.value = true
    categoryError.value = ''
    categories.value = []
    await workspace.run(
      async (signal) => {
        const all = new Map<string, AdminResourceCategory>(),
          seen = new Set<string>()
        let pageCursor: string | null = null
        do {
          const result = await client.categories(
            true,
            pageCursor,
            AbortSignal.any([signal, request.signal]),
          )
          for (const item of result.items) all.set(item.id, item)
          pageCursor = result.next_cursor
          if (pageCursor && seen.has(pageCursor)) throw new Error('分类分页异常')
          if (pageCursor) seen.add(pageCursor)
        } while (pageCursor)
        return [...all.values()]
      },
      (result) => {
        if (!request.signal.aborted) categories.value = result
      },
      (cause) => {
        if (!request.signal.aborted) categoryError.value = resourceErrorMessage(cause)
      },
      () => {
        if (!request.signal.aborted) categoriesBusy.value = false
      },
    )
  }
  async function read(id: string, keepInput = false) {
    detailRequest.abort()
    const request = new AbortController()
    detailRequest = request
    loading.value = true
    detailError.value = ''
    detail.value = null
    await workspace.run(
      (signal) => client.detail(id, AbortSignal.any([signal, request.signal])),
      (result) => {
        if (!request.signal.aborted) {
          detail.value = result
          conflict.value = false
          if (!keepInput) mode.value = 'detail'
          if (keepInput && result.status === 'published')
            detailError.value = '资料已上架，当前输入不能保存；请重新核对并执行下架后编辑'
        }
      },
      (cause) => {
        if (!request.signal.aborted) {
          if (cause instanceof ResourceApiError && cause.status === 404) {
            resetDetail()
            items.value = items.value.filter((item) => item.id !== id)
            error.value = resourceErrorMessage(cause)
          } else detailError.value = resourceErrorMessage(cause)
        }
      },
      () => {
        if (!request.signal.aborted) loading.value = false
      },
    )
  }
  async function open(id: string) {
    if (!canLeave()) return
    resetDetail()
    selected.value = id
    await read(id)
  }
  function create() {
    if (!canLeave()) return
    resetDetail()
    selected.value = 'new'
    mode.value = 'create'
  }
  function edit() {
    if (!detail.value?.allowed_actions.includes('update') || pending.value) return
    Object.assign(form, {
      title: detail.value.title,
      category_id: detail.value.category.id,
      description: detail.value.description,
      download_url: detail.value.download_url,
      extraction_code: detail.value.extraction_code,
    })
    mode.value = 'edit'
    conflict.value = false
    detailError.value = ''
  }
  function offline(editAfter: boolean) {
    if (!detail.value?.allowed_actions.includes('offline') || pending.value) return
    mode.value = 'offline'
    reason.value = ''
    afterOfflineEdit.value = editAfter
  }
  function cancelEditing() {
    if (writing.value || pending.value || !canLeave()) return
    Object.assign(form, blank())
    reason.value = ''
    mode.value = 'detail'
    conflict.value = false
  }
  async function refresh() {
    if (pending.value || !selected.value || selected.value === 'new' || writing.value) return
    await read(selected.value, mode.value === 'edit')
  }
  async function runPending() {
    const command = pending.value
    if (!command || writing.value) return
    writing.value = true
    detailError.value = ''
    notice.value = ''
    await workspace.run(
      (signal) => {
        if (command.kind === 'create') return client.create(command.input, command.key, signal)
        if (command.kind === 'update')
          return client.update(command.id, command.input, command.key, signal)
        if (command.kind === 'publish')
          return client.publish(command.id, command.version, command.key, signal)
        return client.offline(command.id, command.version, command.reason, command.key, signal)
      },
      async (result) => {
        pending.value = null
        selected.value = result.id
        detail.value = result
        mode.value = 'detail'
        Object.assign(form, blank())
        reason.value = ''
        notice.value = '操作已成功，正在刷新当前资料'
        await read(result.id)
        if (!workspace.allowed()) return
        const refreshFailed = !!detailError.value || !detail.value
        if (!refreshFailed && command.kind === 'offline' && command.edit) edit()
        cursor.value = null
        history.value = []
        await load()
        if (workspace.allowed())
          notice.value =
            refreshFailed || error.value
              ? '操作已成功，刷新失败，请重新读取核对；无需重复提交'
              : '操作已成功，当前状态已刷新'
      },
      (cause) => {
        detailError.value = resourceErrorMessage(cause)
        if (cause instanceof ResourceApiError && cause.status < 500 && cause.status !== 429) {
          pending.value = null
          if (cause.status === 409) conflict.value = true
          if (cause.status === 404) {
            const id = selected.value
            resetDetail()
            items.value = items.value.filter((item) => item.id !== id)
            error.value = resourceErrorMessage(cause)
          }
        }
      },
      () => {
        writing.value = false
      },
    )
  }
  async function save() {
    if (
      pending.value ||
      writing.value ||
      conflict.value ||
      (mode.value === 'edit' && !detail.value?.allowed_actions.includes('update'))
    )
      return
    try {
      const input = normalizeResourceInput(form)
      pending.value =
        mode.value === 'create'
          ? { kind: 'create', key: crypto.randomUUID(), input }
          : detail.value
            ? {
                kind: 'update',
                key: crypto.randomUUID(),
                id: detail.value.id,
                input: { ...input, expected_version: detail.value.version },
              }
            : null
    } catch (cause) {
      detailError.value = resourceErrorMessage(cause)
      return
    }
    await runPending()
  }
  async function publish() {
    if (
      !detail.value?.allowed_actions.includes('publish') ||
      pending.value ||
      writing.value ||
      !window.confirm('确认上架当前资料，向已认证学生展示？')
    )
      return
    pending.value = {
      kind: 'publish',
      key: crypto.randomUUID(),
      id: detail.value.id,
      version: detail.value.version,
    }
    await runPending()
  }
  async function confirmOffline() {
    if (!detail.value?.allowed_actions.includes('offline') || pending.value || writing.value) return
    try {
      pending.value = {
        kind: 'offline',
        key: crypto.randomUUID(),
        id: detail.value.id,
        version: detail.value.version,
        reason: normalizeResourceText('reason', reason.value),
        edit: afterOfflineEdit.value,
      }
    } catch (cause) {
      detailError.value = resourceErrorMessage(cause)
      return
    }
    await runPending()
  }
  onMounted(() => {
    const initialCategory = route.query['category_id']
    if (initialCategory !== undefined) {
      try {
        filters.category_id = resourceId(initialCategory)
      } catch (cause) {
        error.value = resourceErrorMessage(cause)
        void loadCategories()
        return
      }
    }
    void search()
    void loadCategories()
  })
  return {
    filters,
    items,
    categories,
    next,
    history,
    busy,
    loading,
    writing,
    categoriesBusy,
    error,
    categoryError,
    detailError,
    notice,
    selected,
    detail,
    mode,
    form,
    reason,
    conflict,
    pending,
    dirty,
    workspace,
    search,
    page,
    open,
    create,
    close,
    edit,
    offline,
    refresh,
    save,
    publish,
    confirmOffline,
    runPending,
    loadCategories,
    cancelEditing,
  }
}
