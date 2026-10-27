import { computed, onMounted, ref, watch } from 'vue'
import { ApiError } from '@/services/admin'
import { createWhispersClient } from '@/services/whispers'
import { parseReasonCommand, parseReviewCommand } from '@/services/whispers/parsers'
import { reviewErrorMessage, useAdminWorkspace } from '@/composables/useAdminWorkspace'
import { useAdminStore } from '@/stores/admin'
import type {
  ContentRef,
  ReasonCommand,
  ReviewCommand,
  ReviewDetail,
  ReviewOutcome,
  ReviewSummary,
} from '@/types/whispers'

type Attempt =
  | { kind: 'decision'; id: string; key: string; body: ReviewCommand }
  | { kind: 'crisis'; id: string; key: string; body: ReasonCommand }

export const whisperKindLabels: Record<ContentRef['kind'], string> = {
  whisper_post: '帖子',
  whisper_comment: '暖评',
  whisper_nickname: '昵称',
  whisper_capsule: '私密胶囊',
}
export const whisperStatusLabels: Record<ReviewSummary['status'], string> = {
  pending: '待审核',
  approved: '内容已通过',
  rejected: '内容已驳回',
  cancelled: '案件已取消',
}
export const whisperOutcomeLabels: Record<ReviewOutcome['business_outcome'], string> = {
  published: '已公开',
  nickname_activated: '昵称已启用',
  capsule_locked: '胶囊仍锁定',
  capsule_unlocked: '胶囊已解锁',
  cancelled: '业务已取消',
  rejected: '业务已拒绝',
  privacy_review_required: '仍需隐私复核',
}

export function useWhisperReviews() {
  const admin = useAdminStore()
  const items = ref<ReviewSummary[]>([])
  const nextCursor = ref<string | null>(null)
  const listBusy = ref(false)
  const listError = ref('')
  const listNotice = ref('')
  const selectedId = ref('')
  const detail = ref<ReviewDetail | null>(null)
  const loading = ref(false)
  const error = ref('')
  const notice = ref('')
  const outcome = ref<ReviewOutcome | null>(null)
  const editorOpen = ref(false)
  const task = ref<'decision' | 'crisis'>('decision')
  const decision = ref<'approved' | 'rejected'>('approved')
  const reason = ref('')
  const suggestion = ref('')
  const confirming = ref(false)
  const writing = ref(false)
  const uncertain = ref(false)
  const usedCursors = new Set<string | null>()
  let attempt: Attempt | null = null
  const workspace = useAdminWorkspace(clearAll)
  const client = createWhispersClient(
    admin.session?.token ?? '',
    (scope) =>
      workspace.allowed() &&
      (scope === 'admin-review' ||
        (scope === 'admin-review-and-crisis' && admin.can('super_admin'))),
  )
  const canDecide = computed(
    () =>
      workspace.allowed() &&
      detail.value?.status === 'pending' &&
      detail.value.allowed_actions.includes('whisperAdminReviewDecide') === true,
  )
  const canEscalate = computed(
    () =>
      workspace.allowed() &&
      admin.can('super_admin') &&
      detail.value?.status === 'pending' &&
      detail.value.allowed_actions.includes('whisperAdminReviewEscalate') === true,
  )
  const valid = computed(() => {
    const current = detail.value
    if (!current) return false
    try {
      if (task.value === 'crisis')
        parseReasonCommand({ expected_version: current.version, reason: reason.value })
      else parseReviewCommand(command(current))
      return true
    } catch {
      return false
    }
  })
  function command(current: ReviewDetail): ReviewCommand {
    return {
      expected_version: current.version,
      expected_content_version: current.source.content_version,
      decision: decision.value,
      ...(decision.value === 'rejected'
        ? { reason: reason.value, revision_suggestion: suggestion.value }
        : {}),
    }
  }
  function resetForm() {
    editorOpen.value = false
    task.value = 'decision'
    decision.value = 'approved'
    reason.value = ''
    suggestion.value = ''
    confirming.value = false
    uncertain.value = false
    writing.value = false
    attempt = null
  }
  function clearDetail() {
    detail.value = null
    selectedId.value = ''
    loading.value = false
    error.value = ''
    resetForm()
  }
  function clearAll() {
    clearDetail()
    items.value = []
    nextCursor.value = null
    usedCursors.clear()
    listBusy.value = false
    listError.value = ''
    listNotice.value = ''
    notice.value = ''
    outcome.value = null
  }
  function cancelReads() {
    workspace.cancel()
    loading.value = false
    listBusy.value = false
  }
  async function loadList(cursor: string | null) {
    listBusy.value = true
    listError.value = ''
    await workspace.run(
      (signal) => client.whisperAdminReviewsList(cursor, signal),
      (page) => {
        usedCursors.add(cursor)
        const merged = new Map(items.value.map((item) => [item.id, item]))
        for (const item of page.items) {
          if (
            detail.value?.id === item.id &&
            (detail.value.version !== item.version ||
              detail.value.source.content_version !== item.source.content_version ||
              item.status === 'cancelled')
          ) {
            clearDetail()
            notice.value = '案件版本或状态已变化，已清除旧正文，请重新选择案件。'
          }
          merged.set(item.id, item)
        }
        items.value = [...merged.values()]
        if (page.next_cursor !== null && usedCursors.has(page.next_cursor)) {
          nextCursor.value = null
          listNotice.value = '分页游标重复，已停止加载，请刷新列表。'
        } else nextCursor.value = page.next_cursor
      },
      (cause) => {
        if (cause instanceof ApiError && cause.status === 409) {
          clearDetail()
          items.value = []
          nextCursor.value = null
          usedCursors.clear()
        }
        listError.value = reviewErrorMessage(cause)
      },
      () => {
        listBusy.value = false
      },
    )
  }
  async function refresh() {
    if (writing.value || editorOpen.value) return
    cancelReads()
    clearAll()
    await loadList(null)
  }
  async function more() {
    if (listBusy.value || editorOpen.value || nextCursor.value === null) return
    await loadList(nextCursor.value)
  }
  async function openCase(id: string) {
    if (writing.value || editorOpen.value) return
    cancelReads()
    clearDetail()
    notice.value = ''
    outcome.value = null
    selectedId.value = id
    loading.value = true
    await workspace.run(
      (signal) => client.whisperAdminReviewGet(id, signal),
      (value) => {
        if (value.status === 'cancelled') {
          notice.value = '案件已取消，已清除正文，不能继续处理。'
          return
        }
        detail.value = value
      },
      (cause) => {
        error.value = reviewErrorMessage(cause)
      },
      () => {
        loading.value = false
      },
    )
  }
  function close() {
    if (writing.value || editorOpen.value) return
    cancelReads()
    clearDetail()
  }
  function startProcessing(kind: 'decision' | 'crisis') {
    if (
      writing.value ||
      editorOpen.value ||
      !(kind === 'decision' ? canDecide.value : canEscalate.value)
    )
      return
    cancelReads()
    resetForm()
    error.value = ''
    task.value = kind
    editorOpen.value = true
  }
  function cancelProcessing() {
    if (writing.value || uncertain.value) return
    resetForm()
    error.value = ''
  }
  function closeProcessing(done: () => void) {
    if (writing.value || uncertain.value) return
    cancelProcessing()
    done()
  }
  function check() {
    if (!editorOpen.value || writing.value || uncertain.value || !valid.value) return
    confirming.value = true
  }
  function back() {
    if (!writing.value && !uncertain.value) confirming.value = false
  }
  async function reread() {
    if (writing.value) return
    const id = selectedId.value
    cancelReads()
    clearDetail()
    if (id) await openCase(id)
  }
  async function submit() {
    const current = detail.value
    if (!current || !editorOpen.value || !confirming.value || writing.value || !valid.value) return
    if (!(task.value === 'decision' ? canDecide.value : canEscalate.value)) return
    if (!attempt)
      attempt =
        task.value === 'decision'
          ? {
              kind: 'decision',
              id: current.id,
              key: crypto.randomUUID(),
              body: parseReviewCommand(command(current)),
            }
          : {
              kind: 'crisis',
              id: current.id,
              key: crypto.randomUUID(),
              body: parseReasonCommand({ expected_version: current.version, reason: reason.value }),
            }
    const pending = attempt
    writing.value = true
    error.value = ''
    await workspace.run(
      async (signal) => {
        if (pending.kind === 'decision')
          return {
            kind: 'decision' as const,
            value: await client.whisperAdminReviewDecide(
              pending.id,
              pending.body,
              pending.key,
              signal,
            ),
          }
        return {
          kind: 'crisis' as const,
          value: await client.whisperAdminReviewEscalate(
            pending.id,
            pending.body,
            pending.key,
            signal,
          ),
        }
      },
      (result) => {
        clearDetail()
        items.value = items.value.filter((item) => item.id !== pending.id)
        if (result.kind === 'decision') outcome.value = result.value
        else notice.value = `已升级危机，案件标识：${result.value.id}。请按危机处置流程跟进。`
      },
      (cause) => {
        if (cause instanceof ApiError && (cause.status === 404 || cause.status === 409)) {
          clearDetail()
          selectedId.value = pending.id
          items.value = items.value.filter((item) => item.id !== pending.id)
          error.value =
            cause.status === 404
              ? '案件已不可访问，已清除正文和处理表单。'
              : '案件版本或状态已变化，已清除旧正文和表单，请重新读取后核对。'
        } else if (cause instanceof ApiError && [400, 429, 503].includes(cause.status)) {
          attempt = null
          confirming.value = false
          uncertain.value = false
          error.value = reviewErrorMessage(cause)
        } else {
          uncertain.value = true
          error.value = '写入结果尚未确认，请恢复连接后使用原请求重试。'
        }
      },
      () => {
        writing.value = false
      },
    )
  }
  watch(
    () => admin.can('super_admin'),
    (allowed, previouslyAllowed) => {
      // 页面仍可读取普通案件时，也须单独撤销升级操作及其原请求。
      if (!allowed && previouslyAllowed && editorOpen.value && task.value === 'crisis') {
        cancelReads()
        clearDetail()
        notice.value = '危机升级权限已撤销，已清除正文和表单；请在恢复权限后先核对处理结果。'
      }
    },
    { flush: 'sync' },
  )
  onMounted(refresh)
  return {
    items,
    nextCursor,
    listBusy,
    listError,
    listNotice,
    selectedId,
    detail,
    loading,
    error,
    notice,
    outcome,
    editorOpen,
    task,
    decision,
    reason,
    suggestion,
    confirming,
    writing,
    uncertain,
    workspace,
    canDecide,
    canEscalate,
    valid,
    refresh,
    more,
    openCase,
    close,
    startProcessing,
    cancelProcessing,
    closeProcessing,
    check,
    back,
    submit,
    reread,
  }
}
