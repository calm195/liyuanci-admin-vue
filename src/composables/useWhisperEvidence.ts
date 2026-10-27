import { computed, ref, watch } from 'vue'
import { ApiError } from '@/services/admin'
import { createWhispersClient } from '@/services/whispers'
import { uuid } from '@/services/whispers/boundary'
import { parseEvidenceDelete } from '@/services/whispers/parsers'
import { useAdminStore } from '@/stores/admin'
import { reviewErrorMessage, useAdminWorkspace } from './useAdminWorkspace'
import type { DeletionJob, EvidenceDelete, EvidenceScope } from '@/types/whispers'

export function validWhisperId(value: string): boolean {
  try {
    uuid(value)
    return true
  } catch {
    return false
  }
}

export function useWhisperEvidence() {
  const admin = useAdminStore()
  const evidenceId = ref('')
  const target = ref<EvidenceScope | null>(null)
  const jobId = ref('')
  const acceptedId = ref('')
  const progress = ref<DeletionJob | null>(null)
  const busy = ref(false)
  const error = ref('')
  const notice = ref('')
  const editorOpen = ref(false)
  const reason = ref('')
  const confirmation = ref('')
  const confirming = ref(false)
  const uncertain = ref(false)
  let attempt: { id: string; key: string; body: EvidenceDelete } | null = null
  const workspace = useAdminWorkspace(clearAll, 'super_admin')
  const client = createWhispersClient(
    admin.session?.token ?? '',
    (scope) => workspace.allowed() && scope === 'admin-super',
  )
  const canDelete = computed(
    () =>
      workspace.allowed() &&
      target.value?.state === 'retained' &&
      target.value.allowed_actions.includes('whisperAdminEvidenceDelete') === true,
  )
  const valid = computed(() => {
    if (!target.value || !canDelete.value) return false
    try {
      parseEvidenceDelete({
        expected_version: target.value.version,
        confirmation: confirmation.value,
        reason: reason.value,
      })
      return true
    } catch {
      return false
    }
  })
  function resetForm() {
    editorOpen.value = false
    reason.value = ''
    confirmation.value = ''
    confirming.value = false
    uncertain.value = false
    attempt = null
  }
  function clearAll() {
    target.value = null
    evidenceId.value = ''
    jobId.value = ''
    acceptedId.value = ''
    progress.value = null
    busy.value = false
    error.value = ''
    notice.value = ''
    resetForm()
  }
  function reset() {
    if (busy.value || editorOpen.value) return
    workspace.cancel()
    clearAll()
  }
  watch(
    evidenceId,
    () => {
      target.value = null
    },
    { flush: 'sync' },
  )
  watch(
    jobId,
    () => {
      progress.value = null
    },
    { flush: 'sync' },
  )
  async function loadTarget() {
    if (busy.value || editorOpen.value || !validWhisperId(evidenceId.value)) return
    workspace.cancel()
    target.value = null
    error.value = ''
    notice.value = ''
    busy.value = true
    const id = evidenceId.value
    await workspace.run(
      (signal) => client.whisperAdminEvidenceGet(id, signal),
      (value) => {
        if (evidenceId.value === id) target.value = value
      },
      (cause) => {
        error.value = reviewErrorMessage(cause)
      },
      () => {
        busy.value = false
      },
    )
  }
  function startProcessing() {
    if (busy.value || editorOpen.value || !canDelete.value) return
    workspace.cancel()
    resetForm()
    error.value = ''
    editorOpen.value = true
  }
  function cancelProcessing() {
    if (busy.value || uncertain.value) return
    resetForm()
    error.value = ''
  }
  function closeProcessing(done: () => void) {
    if (busy.value || uncertain.value) return
    cancelProcessing()
    done()
  }
  function check() {
    if (editorOpen.value && valid.value && !busy.value && !uncertain.value) confirming.value = true
  }
  function back() {
    if (!busy.value && !uncertain.value) confirming.value = false
  }
  async function submit() {
    const current = target.value
    if (!current || busy.value || !editorOpen.value || !confirming.value || !valid.value) return
    if (!attempt)
      attempt = {
        id: current.id,
        key: crypto.randomUUID(),
        body: parseEvidenceDelete({
          expected_version: current.version,
          confirmation: confirmation.value,
          reason: reason.value,
        }),
      }
    const pending = attempt
    busy.value = true
    error.value = ''
    await workspace.run(
      (signal) => client.whisperAdminEvidenceDelete(pending.id, pending.body, pending.key, signal),
      (value) => {
        target.value = null
        resetForm()
        acceptedId.value = value.id
        jobId.value = value.id
        progress.value = null
        notice.value =
          '删除请求已受理，尚未确认清理完成，请按删除任务查询进度。删除不会恢复普通内容。'
      },
      (cause) => {
        if (cause instanceof ApiError && [404, 409].includes(cause.status)) {
          target.value = null
          resetForm()
          error.value = '证据范围已不可访问或版本已变化，已清除表单，请重新读取后核对。'
        } else if (cause instanceof ApiError && [400, 429, 503].includes(cause.status)) {
          attempt = null
          uncertain.value = false
          confirming.value = false
          error.value = reviewErrorMessage(cause)
        } else {
          uncertain.value = true
          error.value = '删除受理结果尚未确认，请恢复连接后使用原请求重试。'
        }
      },
      () => {
        busy.value = false
      },
    )
  }
  async function query() {
    if (busy.value || editorOpen.value || !validWhisperId(jobId.value)) return
    workspace.cancel()
    progress.value = null
    error.value = ''
    busy.value = true
    const id = jobId.value
    await workspace.run(
      (signal) => client.whisperAdminDeletionGet(id, signal),
      (value) => {
        if (jobId.value === id) progress.value = value
      },
      (cause) => {
        error.value = reviewErrorMessage(cause)
      },
      () => {
        busy.value = false
      },
    )
  }
  return {
    evidenceId,
    target,
    jobId,
    acceptedId,
    progress,
    busy,
    error,
    notice,
    editorOpen,
    reason,
    confirmation,
    confirming,
    uncertain,
    workspace,
    canDelete,
    valid,
    reset,
    loadTarget,
    startProcessing,
    cancelProcessing,
    closeProcessing,
    check,
    back,
    submit,
    query,
  }
}
