import { computed, onMounted, reactive, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useAdminStore } from '@/stores/admin'
import { useAdminWorkspace } from './useAdminWorkspace'
import {
  createResourcesClient,
  normalizeResourceText,
  ResourceApiError,
  resourceErrorMessage,
} from '@/services/resources'
import { resourceRoles } from '@/types/resources'
import type { AdminResourceCategory, CategoryInput } from '@/types/resources'
const blank = (): CategoryInput => ({ name: '', sort_order: 0, enabled: true })
type Pending = { key: string; id: string | null; input: CategoryInput; version: number }
export function useResourceCategories() {
  const enabled = ref(''),
    submitted = ref(''),
    items = ref<AdminResourceCategory[]>([])
  const cursor = ref<string | null>(null),
    next = ref<string | null>(null),
    history = ref<(string | null)[]>([])
  const busy = ref(false),
    loading = ref(false),
    writing = ref(false),
    error = ref(''),
    detailError = ref(''),
    notice = ref('')
  const selected = ref(''),
    detail = ref<AdminResourceCategory | null>(null),
    form = reactive(blank()),
    conflict = ref(false),
    pending = ref<Pending | null>(null)
  let listRequest = new AbortController(),
    detailRequest = new AbortController()
  const workspace = useAdminWorkspace(clear, resourceRoles),
    client = createResourcesClient(useAdminStore().session?.token ?? '', workspace.allowed)
  const dirty = computed(() => enabled.value !== submitted.value)
  function resetDetail() {
    detailRequest.abort()
    selected.value = ''
    detail.value = null
    Object.assign(form, blank())
    loading.value = false
    writing.value = false
    pending.value = null
    detailError.value = ''
    conflict.value = false
  }
  function clear() {
    listRequest.abort()
    resetDetail()
    items.value = []
    next.value = null
    cursor.value = null
    history.value = []
    enabled.value = ''
    submitted.value = ''
    busy.value = false
    error.value = ''
    notice.value = ''
  }
  function canLeave() {
    return (
      !writing.value &&
      (!selected.value ||
        window.confirm(
          pending.value
            ? '操作结果尚未确认，放弃前请核对服务端，避免重复创建。确认关闭？'
            : '确认放弃当前分类表单？',
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
    error.value = ''
    items.value = []
    next.value = null
    await workspace.run(
      (signal) =>
        client.categories(
          submitted.value === '' ? null : submitted.value === 'true',
          cursor.value,
          AbortSignal.any([signal, request.signal]),
        ),
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
    submitted.value = enabled.value
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
  async function read(id: string, preserve = false) {
    detailRequest.abort()
    const request = new AbortController()
    detailRequest = request
    loading.value = true
    detail.value = null
    detailError.value = ''
    await workspace.run(
      (signal) => client.category(id, AbortSignal.any([signal, request.signal])),
      (result) => {
        if (!request.signal.aborted) {
          detail.value = result
          conflict.value = false
          if (!preserve)
            Object.assign(form, {
              name: result.name,
              sort_order: result.sort_order,
              enabled: result.enabled,
            })
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
  }
  async function refresh() {
    if (!pending.value && selected.value !== 'new' && selected.value)
      await read(selected.value, true)
  }
  async function runPending() {
    const command = pending.value
    if (!command || writing.value) return
    writing.value = true
    detailError.value = ''
    notice.value = ''
    await workspace.run(
      (signal) =>
        command.id
          ? client.updateCategory(
              command.id,
              { ...command.input, expected_version: command.version },
              command.key,
              signal,
            )
          : client.createCategory(command.input, command.key, signal),
      async (result) => {
        pending.value = null
        selected.value = result.id
        detail.value = result
        await read(result.id)
        if (!workspace.allowed()) return
        const failed = !!detailError.value || !detail.value
        cursor.value = null
        history.value = []
        await load()
        if (workspace.allowed())
          notice.value =
            failed || error.value
              ? '操作已成功，刷新失败，请重新读取核对；无需重复提交'
              : '分类已保存，当前状态已刷新'
      },
      (cause) => {
        detailError.value = resourceErrorMessage(cause)
        if (cause instanceof ResourceApiError && cause.status < 500 && cause.status !== 429) {
          pending.value = null
          if (
            ['VERSION_CONFLICT', 'STATE_CONFLICT', 'IDEMPOTENCY_CONFLICT'].includes(cause.errorCode)
          )
            conflict.value = true
          if (cause.status === 404) {
            resetDetail()
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
      writing.value ||
      pending.value ||
      conflict.value ||
      (selected.value !== 'new' && !detail.value)
    )
      return
    try {
      const input = {
        name: normalizeResourceText('name', form.name),
        sort_order: form.sort_order,
        enabled: form.enabled,
      }
      if (!Number.isInteger(input.sort_order) || input.sort_order < 0 || input.sort_order > 9999) {
        detailError.value = '排序应为 0 至 9999 的整数'
        return
      }
      if (
        detail.value &&
        !window.confirm('改名会同步影响引用资料的分类名称；有资料引用时不能停用。确认保存？')
      )
        return
      pending.value = {
        id: detail.value?.id ?? null,
        version: detail.value?.version ?? 1,
        input,
        key: crypto.randomUUID(),
      }
    } catch (cause) {
      detailError.value = resourceErrorMessage(cause)
      return
    }
    await runPending()
  }
  onMounted(() => {
    void search()
  })
  return {
    enabled,
    items,
    next,
    history,
    busy,
    loading,
    writing,
    error,
    detailError,
    notice,
    selected,
    detail,
    form,
    conflict,
    pending,
    dirty,
    workspace,
    search,
    page,
    open,
    create,
    close,
    refresh,
    save,
    runPending,
  }
}
