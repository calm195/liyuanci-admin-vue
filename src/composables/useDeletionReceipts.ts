import { computed, ref, watch } from 'vue'
import { ApiError } from '@/services/admin'
import { createPrivacyClient, validDeletionReceipt } from '@/services/privacy'
import { createWhispersClient } from '@/services/whispers'
import { useAdminStore } from '@/stores/admin'
import { reviewErrorMessage, useAdminWorkspace } from '@/composables/useAdminWorkspace'
import type {
  DeletionProgress,
  EvidenceDeletionTask,
  EvidenceDeletionTaskRef,
} from '@/types/privacy'

export function deletionTaskLabel(task: EvidenceDeletionTaskRef) {
  return task.source_module === 'legacy' ? '普通危机证据' : '树洞证据'
}

export function useDeletionReceipts() {
  const busy = ref(false)
  const error = ref('')
  const handle = ref('')
  const task = ref<EvidenceDeletionTaskRef | null>(null)
  const progress = ref<DeletionProgress | null>(null)
  const progressKind = ref('')
  const tasks = ref<EvidenceDeletionTask[]>([])
  const listBusy = ref(false)
  const listError = ref('')
  const page = ref(1)
  const pageSize = ref(10)
  const total = ref(0)

  const admin = useAdminStore()
  const workspace = useAdminWorkspace(clearLookup, 'super_admin')
  const listWorkspace = useAdminWorkspace(clearList, 'super_admin')
  const client = createPrivacyClient(admin.session?.token ?? '', workspace.allowed)
  const listClient = createPrivacyClient(admin.session?.token ?? '', listWorkspace.allowed)
  const whisperClient = createWhispersClient(
    admin.session?.token ?? '',
    (scope) => workspace.allowed() && scope === 'admin-super',
  )
  const retryHint = computed(() => {
    const code = progress.value?.retryable_error
    if (!code) return ''
    if (code === 'external_cleanup_unavailable') return '外部清理依赖暂不可用，后端将重试。'
    if (code === 'database_cleanup_unavailable') return '数据库清理暂不可用，后端将重试。'
    return '清理暂未完成，请稍后重新查询。'
  })

  function clearLookup() {
    handle.value = ''
    task.value = null
    progress.value = null
    progressKind.value = ''
    error.value = ''
    busy.value = false
  }

  function clearList() {
    tasks.value = []
    page.value = 1
    total.value = 0
    listError.value = ''
    listBusy.value = false
  }

  watch(
    handle,
    () => {
      if (task.value) return
      workspace.cancel()
      progress.value = null
      progressKind.value = ''
      error.value = ''
      busy.value = false
    },
    { flush: 'sync' },
  )

  async function loadTasks(next = 1, size = pageSize.value) {
    if (listBusy.value) return
    listWorkspace.cancel()
    listBusy.value = true
    listError.value = ''
    await listWorkspace.run(
      (signal) => listClient.jobs(next, size, signal),
      (result) => {
        tasks.value = result.items
        page.value = result.page
        pageSize.value = result.page_size
        total.value = result.total
      },
      () => {
        listError.value = '删除任务列表未能读取，请稍后重试'
      },
      () => {
        listBusy.value = false
      },
    )
  }
  function resizeTasks(size: number) {
    return loadTasks(1, size)
  }

  function failure(cause: unknown) {
    if (cause instanceof ApiError && cause.status === 404)
      error.value = '任务或回执不存在、已过期或不可访问；不能据此认定清理完成'
    else if (cause instanceof ApiError && cause.status === 400)
      error.value = '查询参数无效，请重新选择任务或核对完整的匿名回执'
    else if (cause instanceof ApiError && (cause.status === 429 || cause.status === 503))
      error.value = reviewErrorMessage(cause)
    else error.value = '查询未完成，请稍后重试'
  }

  async function queryTask(next: EvidenceDeletionTaskRef) {
    if (busy.value) return
    task.value = next
    await lookup(deletionTaskLabel(next), (signal) =>
      next.source_module === 'legacy'
        ? client.job(next.id, signal)
        : whisperClient.whisperAdminDeletionGet(next.id, signal),
    )
  }

  async function queryReceipt() {
    if (busy.value) return
    const value = handle.value.trim()
    task.value = null
    if (!validDeletionReceipt(value)) {
      progress.value = null
      progressKind.value = ''
      error.value = '请填写完整的删除回执，包含标识与校验串'
      return
    }
    await lookup('匿名删除回执', (signal) => client.receipt(value, signal))
  }

  async function lookup(kind: string, request: (signal: AbortSignal) => Promise<DeletionProgress>) {
    workspace.cancel()
    progress.value = null
    progressKind.value = ''
    error.value = ''
    busy.value = true
    await workspace.run(
      request,
      (result) => {
        progressKind.value = kind
        progress.value = result
      },
      failure,
      () => {
        busy.value = false
      },
    )
  }

  function reset() {
    if (busy.value) return
    workspace.cancel()
    clearLookup()
  }

  return {
    busy,
    error,
    handle,
    task,
    progress,
    progressKind,
    workspace,
    retryHint,
    queryTask,
    queryReceipt,
    reset,
    tasks,
    listBusy,
    listError,
    page,
    pageSize,
    total,
    loadTasks,
    resizeTasks,
  }
}
