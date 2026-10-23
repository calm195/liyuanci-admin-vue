import { computed, ref, watch } from 'vue'
import { ApiError } from '@/services/admin'
import { createPrivacyClient, validDeletionId, validDeletionReceipt } from '@/services/privacy'
import { useAdminStore } from '@/stores/admin'
import { reviewErrorMessage, useAdminWorkspace } from '@/composables/useAdminWorkspace'
import type { DeletionProgress } from '@/types/privacy'
export function useDeletionReceipts() {
  const busy = ref(false)
  const error = ref('')
  const jobId = ref('')
  const handle = ref('')
  const progress = ref<DeletionProgress | null>(null)
  const progressKind = ref('')
  const workspace = useAdminWorkspace(clear, 'super_admin')
  const client = createPrivacyClient(useAdminStore().session?.token ?? '', workspace.allowed)
  const retryHint = computed(() => {
    const code = progress.value?.retryable_error
    if (!code) return ''
    if (code === 'external_cleanup_unavailable') return '外部清理依赖暂不可用，后端将重试。'
    if (code === 'database_cleanup_unavailable') return '数据库清理暂不可用，后端将重试。'
    return '清理暂未完成，请稍后重新查询。'
  })
  function clear() {
    jobId.value = ''
    handle.value = ''
    progress.value = null
    progressKind.value = ''
    error.value = ''
    busy.value = false
  }
  watch(
    [jobId, handle],
    () => {
      progress.value = null
      progressKind.value = ''
    },
    { flush: 'sync' },
  )
  async function query(kind: 'job' | 'receipt') {
    if (busy.value) return
    const value = kind === 'job' ? jobId.value.trim() : handle.value.trim()
    if (kind === 'job' ? !validDeletionId(value) : !validDeletionReceipt(value)) {
      error.value =
        kind === 'job' ? '请填写有效的待办 ID' : '请填写完整的删除回执，包含标识与校验串'
      return
    }
    workspace.cancel()
    progress.value = null
    progressKind.value = ''
    error.value = ''
    busy.value = true
    await workspace.run(
      (signal) => (kind === 'job' ? client.job(value, signal) : client.receipt(value, signal)),
      (result) => {
        if (value !== (kind === 'job' ? jobId.value.trim() : handle.value.trim())) return
        progressKind.value = kind === 'job' ? '后台证据删除待办' : '匿名删除回执'
        progress.value = result
      },
      (cause) => {
        if (cause instanceof ApiError && cause.status === 404)
          error.value = '待办或回执不存在、已过期或不可访问；不能据此认定清理完成'
        else if (cause instanceof ApiError && cause.status === 400)
          error.value = '查询参数无效，请核对完整的待办 ID 或删除回执'
        else if (cause instanceof ApiError && (cause.status === 429 || cause.status === 503))
          error.value = reviewErrorMessage(cause)
        else error.value = '查询未完成，请稍后重试'
      },
      () => {
        busy.value = false
      },
    )
  }
  function reset() {
    if (!busy.value) {
      workspace.cancel()
      clear()
    }
  }

  return { busy, error, jobId, handle, progress, progressKind, workspace, retryHint, query, reset }
}
