import { computed, ref, watch } from 'vue'
import { ApiError } from '@/services/admin'
import { createPrivacyClient, validDeletionId, validDeletionReason } from '@/services/privacy'
import { useAdminStore } from '@/stores/admin'
import { reviewErrorMessage, useAdminWorkspace } from '@/composables/useAdminWorkspace'
import type { DeletionJob, EvidenceTarget } from '@/types/privacy'

export function useEvidenceDeletion() {
  const editorOpen = ref(false)
  const evidenceId = ref('')
  const target = ref<EvidenceTarget | null>(null)
  const reason = ref('')
  const confirmation = ref(false)
  const busy = ref(false)
  const error = ref('')
  const accepted = ref<DeletionJob | null>(null)
  let attempt: { fingerprint: string; key: string } | null = null
  const workspace = useAdminWorkspace(clear, 'super_admin')
  const client = createPrivacyClient(useAdminStore().session?.token ?? '', workspace.allowed)
  const reasonBytes = computed(() => new TextEncoder().encode(reason.value).length)
  const canPrepare = computed(
    () => !!target.value && validDeletionReason(reason.value) && !busy.value,
  )
  function clearTarget() {
    editorOpen.value = false
    target.value = null
    reason.value = ''
    confirmation.value = false
    attempt = null
  }
  function clear() {
    clearTarget()
    evidenceId.value = ''
    accepted.value = null
    error.value = ''
    busy.value = false
  }
  watch(evidenceId, clearTarget, { flush: 'sync' })
  function failure(cause: unknown) {
    error.value = reviewErrorMessage(cause)
  }
  async function loadTarget() {
    if (editorOpen.value || busy.value || !validDeletionId(evidenceId.value.trim())) return
    workspace.cancel()
    clearTarget()
    accepted.value = null
    error.value = ''
    const id = evidenceId.value.trim()
    busy.value = true
    await workspace.run(
      (signal) => client.evidence(id, signal),
      (value) => {
        if (evidenceId.value.trim() === id) target.value = value
      },
      failure,
      () => {
        busy.value = false
      },
    )
  }
  function prepare() {
    if (editorOpen.value && canPrepare.value) confirmation.value = true
  }
  async function submit() {
    const current = target.value
    if (!editorOpen.value || !current || !confirmation.value || !canPrepare.value) return
    const input = { reason: reason.value, expected_version: current.version }
    const fingerprint = JSON.stringify({ id: current.id, ...input })
    if (attempt?.fingerprint !== fingerprint)
      attempt = { fingerprint, key: globalThis.crypto.randomUUID() }
    const key = attempt.key
    busy.value = true
    error.value = ''
    accepted.value = null
    await workspace.run(
      (signal) => client.remove(current.id, input, key, signal),
      (value) => {
        clearTarget()
        evidenceId.value = ''
        accepted.value = value
      },
      (cause) => {
        if (cause instanceof ApiError && (cause.status === 404 || cause.status === 409)) {
          clearTarget()
          error.value = '证据版本或状态已变化，请重新读取并核对；不会自动重提'
        } else {
          failure(cause)
          error.value += '。删除结果可能已生效；可用相同内容与操作标识重试核对受理回执'
        }
      },
      () => {
        busy.value = false
      },
    )
  }
  function reset() {
    if (!busy.value && !editorOpen.value) {
      workspace.cancel()
      clear()
    }
  }

  function startProcessing() {
    if (!target.value || busy.value) return
    reason.value = ''
    confirmation.value = false
    attempt = null
    editorOpen.value = true
  }
  function cancelProcessing() {
    if (busy.value) return
    editorOpen.value = false
    reason.value = ''
    confirmation.value = false
    attempt = null
  }
  function closeProcessing(done: () => void) {
    if (busy.value) return
    cancelProcessing()
    done()
  }
  watch(
    reason,
    () => {
      confirmation.value = false
    },
    { flush: 'sync' },
  )
  return {
    editorOpen,
    evidenceId,
    target,
    reason,
    confirmation,
    busy,
    error,
    accepted,
    workspace,
    reasonBytes,
    canPrepare,
    loadTarget,
    prepare,
    submit,
    reset,
    startProcessing,
    cancelProcessing,
    closeProcessing,
  }
}
