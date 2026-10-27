import { computed, onMounted, ref, watch } from 'vue'
import { ApiError } from '@/services/admin'
import { createWhispersClient } from '@/services/whispers'
import {
  parsePenaltyCommand,
  parseReasonCommand,
  parseReportDecision,
  parseRestrictionCommand,
} from '@/services/whispers/parsers'
import { reviewErrorMessage, useAdminWorkspace } from './useAdminWorkspace'
import { useAdminStore } from '@/stores/admin'
import { safetyRoles } from '@/types/safety'
import type {
  ContentControl,
  ContentRef,
  PenaltyCommand,
  PenaltyResult,
  ReasonCommand,
  ReportDecision,
  ReportDetail,
  ReportSummary,
  RestrictionCommand,
} from '@/types/whispers'

type Task = 'decision' | 'restriction' | 'penalty' | 'crisis'
type Attempt = { key: string; reportId: string } & (
  | { task: 'decision'; body: ReportDecision }
  | { task: 'crisis'; body: ReasonCommand }
  | { task: 'restriction'; source: ContentRef; body: RestrictionCommand }
  | { task: 'penalty'; source: ContentRef; body: PenaltyCommand }
)
export const whisperReportStatuses: Record<ReportSummary['status'], string> = {
  pending: '待处理',
  confirmed: '举报已确认',
  dismissed: '举报已驳回',
}
export const whisperPenaltyLabels: Record<PenaltyCommand['level'], string> = {
  minor: '轻微：警告',
  general: '一般：禁言7天',
  severe: '严重：永久封禁',
}
export const whisperTaskLabels: Record<Task, string> = {
  decision: '判定举报',
  restriction: '调整普通限制',
  penalty: '给予处罚',
  crisis: '升级危机',
}
export function useWhisperReports() {
  const admin = useAdminStore()
  const items = ref<ReportSummary[]>([])
  const nextCursor = ref<string | null>(null)
  const listBusy = ref(false)
  const listError = ref('')
  const listNotice = ref('')
  const selectedId = ref('')
  const detail = ref<ReportDetail | null>(null)
  const control = ref<ContentControl | null>(null)
  const loading = ref(false)
  const controlError = ref('')
  const error = ref('')
  const notice = ref('')
  const penaltyReceipt = ref<PenaltyResult | null>(null)
  const editorOpen = ref(false)
  const task = ref<Task>('decision')
  const decision = ref<ReportDecision['decision']>('confirmed')
  const level = ref<PenaltyCommand['level']>('minor')
  const reason = ref('')
  const confirming = ref(false)
  const writing = ref(false)
  const uncertain = ref(false)
  const usedCursors = new Set<string | null>()
  let attempt: Attempt | null = null
  const workspace = useAdminWorkspace(clearAll, safetyRoles)
  const client = createWhispersClient(
    admin.session?.token ?? '',
    (scope) =>
      workspace.allowed() &&
      (scope === 'admin-safety' || (scope === 'admin-crisis' && admin.can('crisis_operator'))),
  )
  const matching = computed(
    () =>
      detail.value !== null &&
      control.value !== null &&
      detail.value.source.id === control.value.source.id &&
      detail.value.source.kind === control.value.source.kind &&
      detail.value.source.content_version === control.value.source.content_version,
  )
  const options = computed<Task[]>(() => {
    const report = detail.value
    if (!report || !workspace.allowed()) return []
    const result: Task[] = []
    if (report.status === 'pending' && report.allowed_actions.includes('whisperAdminReportDecide'))
      result.push('decision')
    if (matching.value && control.value?.allowed_actions.includes('whisperAdminRestrictionSet'))
      result.push('restriction')
    if (
      report.status === 'confirmed' &&
      matching.value &&
      control.value?.allowed_actions.includes('whisperAdminPenaltyCreate')
    )
      result.push('penalty')
    if (
      admin.can('crisis_operator') &&
      report.allowed_actions.includes('whisperAdminReportEscalate')
    )
      result.push('crisis')
    return result
  })
  function buildAttempt(): Attempt | null {
    const report = detail.value
    if (!report || !options.value.includes(task.value)) return null
    const base = { reportId: report.id, key: '' }
    if (task.value === 'decision')
      return {
        ...base,
        task: 'decision',
        body: parseReportDecision({
          expected_version: report.version,
          decision: decision.value,
          reason: reason.value,
        }),
      }
    if (task.value === 'crisis')
      return {
        ...base,
        task: 'crisis',
        body: parseReasonCommand({ expected_version: report.version, reason: reason.value }),
      }
    const resource = control.value
    if (!resource || !matching.value) return null
    if (task.value === 'restriction')
      return {
        ...base,
        task: 'restriction',
        source: { ...resource.source },
        body: parseRestrictionCommand({
          expected_version: resource.version,
          restricted: !resource.restricted,
          reason: reason.value,
        }),
      }
    return {
      ...base,
      task: 'penalty',
      source: { ...resource.source },
      body: parsePenaltyCommand({
        expected_version: resource.version,
        report_id: report.id,
        expected_report_version: report.version,
        level: level.value,
        reason: reason.value,
      }),
    }
  }
  const valid = computed(() => {
    try {
      return buildAttempt() !== null
    } catch {
      return false
    }
  })
  function resetForm() {
    editorOpen.value = false
    task.value = 'decision'
    decision.value = 'confirmed'
    level.value = 'minor'
    reason.value = ''
    confirming.value = false
    writing.value = false
    uncertain.value = false
    attempt = null
  }
  function clearDetail() {
    detail.value = null
    control.value = null
    controlError.value = ''
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
    penaltyReceipt.value = null
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
      (signal) => client.whisperAdminReportsList(cursor, signal),
      (page) => {
        usedCursors.add(cursor)
        const merged = new Map(items.value.map((item) => [item.id, item]))
        for (const item of page.items) {
          if (
            detail.value?.id === item.id &&
            (detail.value.version !== item.version ||
              detail.value.source.content_version !== item.source.content_version ||
              detail.value.source.kind !== item.source.kind ||
              detail.value.source.id !== item.source.id ||
              detail.value.status !== item.status)
          ) {
            clearDetail()
            notice.value = '举报版本或状态已变化，已清除旧详情，请重新选择。'
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
    penaltyReceipt.value = null
    selectedId.value = id
    loading.value = true
    await workspace.run(
      async (signal) => {
        const report = await client.whisperAdminReportGet(id, signal)
        try {
          const resource = await client.whisperAdminContentGet(
            report.source.kind,
            report.source.id,
            signal,
          )
          return { report, resource, controlError: '' }
        } catch (cause) {
          if (cause instanceof ApiError && [401, 403, 404, 409].includes(cause.status)) throw cause
          return {
            report,
            resource: null,
            controlError: '治理状态读取失败，治理操作暂不可用；可重新读取举报重试。',
          }
        }
      },
      (value) => {
        detail.value = value.report
        control.value = value.resource
        controlError.value = value.controlError
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
  function startProcessing(kind: Task) {
    if (writing.value || editorOpen.value || !options.value.includes(kind)) return
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
    if (editorOpen.value && !writing.value && !uncertain.value && valid.value)
      confirming.value = true
  }
  function back() {
    if (!writing.value && !uncertain.value) confirming.value = false
  }
  async function submit() {
    if (
      !detail.value ||
      !editorOpen.value ||
      !confirming.value ||
      writing.value ||
      !valid.value ||
      !options.value.includes(task.value)
    )
      return
    if (!attempt) {
      const built = buildAttempt()
      if (!built) return
      attempt = { ...built, key: crypto.randomUUID() }
    }
    const pending = attempt
    writing.value = true
    error.value = ''
    await workspace.run(
      async (signal) => {
        switch (pending.task) {
          case 'decision':
            return {
              task: 'decision' as const,
              value: await client.whisperAdminReportDecide(
                pending.reportId,
                pending.body,
                pending.key,
                signal,
              ),
            }
          case 'restriction':
            return {
              task: 'restriction' as const,
              value: await client.whisperAdminRestrictionSet(
                pending.source.kind,
                pending.source.id,
                pending.body,
                pending.key,
                signal,
              ),
            }
          case 'penalty':
            return {
              task: 'penalty' as const,
              value: await client.whisperAdminPenaltyCreate(
                pending.source.kind,
                pending.source.id,
                pending.body,
                pending.key,
                signal,
              ),
            }
          case 'crisis':
            return {
              task: 'crisis' as const,
              value: await client.whisperAdminReportEscalate(
                pending.reportId,
                pending.body,
                pending.key,
                signal,
              ),
            }
        }
      },
      (result) => {
        clearDetail()
        selectedId.value = pending.reportId
        if (result.task === 'decision') {
          items.value = items.value.map((item) =>
            item.id === result.value.id ? result.value : item,
          )
          notice.value = `举报判定：${whisperReportStatuses[result.value.status]}。请重新读取举报后进行后续治理。`
        } else if (result.task === 'restriction')
          notice.value = result.value.restricted
            ? '普通限制已设置，以服务端当前状态为准。'
            : '普通限制已解除，后续仍需按当前条件重新复核，不代表内容已公开，也不解除危机或隐私屏障。'
        else if (result.task === 'penalty') {
          penaltyReceipt.value = result.value
          notice.value = '处罚已确认，结果以服务端回执为准。'
        } else {
          items.value = items.value.filter((item) => item.id !== pending.reportId)
          notice.value = `已升级危机，案件标识：${result.value.id}。请按危机处置流程跟进。`
        }
      },
      (cause) => {
        if (cause instanceof ApiError && [404, 409].includes(cause.status)) {
          clearDetail()
          selectedId.value = pending.reportId
          items.value = items.value.filter((item) => item.id !== pending.reportId)
          error.value =
            '举报或治理对象已失效或换版，已清除正文和表单，请重新读取核对，不会自动重提。'
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
    () => admin.can('crisis_operator'),
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
    control,
    matching,
    controlError,
    loading,
    error,
    notice,
    penaltyReceipt,
    editorOpen,
    task,
    decision,
    level,
    reason,
    confirming,
    writing,
    uncertain,
    workspace,
    options,
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
  }
}
