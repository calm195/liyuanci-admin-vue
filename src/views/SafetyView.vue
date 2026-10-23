<script setup lang="ts">
import CrisisEscalation from '@/components/CrisisEscalation.vue'
import { useRouter } from 'vue-router'
import type { CrisisSummary } from '@/types/crisis'
import { computed, onMounted, ref, watch } from 'vue'
import { ApiError } from '@/services/admin'
import { createSafetyClient } from '@/services/safety'
import { useAdminStore } from '@/stores/admin'
import { reviewErrorMessage, useAdminWorkspace } from '@/composables/useAdminWorkspace'
import { safetyRoles, penaltyLevels } from '@/types/safety'
import type {
  AppealDecisionInput,
  AppealDetail,
  ContentKind,
  PenaltyInput,
  PenaltyLevel,
  ReasonInput,
  ReportDecisionInput,
  ReportDetail,
  RestrictionAction,
  SafetySummary,
} from '@/types/safety'

type Tab = 'reports' | 'appeals'
type Operation =
  'confirmed' | 'dismissed' | 'penalty' | 'offline' | 'release-restriction' | 'uphold' | 'revoke'
type Confirmation =
  | { type: 'report'; id: string; input: ReportDecisionInput }
  | { type: 'appeal'; id: string; input: AppealDecisionInput }
  | { type: 'penalty'; id: string; input: PenaltyInput }
  | {
      type: 'restriction'
      id: string
      kind: ContentKind
      action: RestrictionAction
      input: ReasonInput
    }
const tab = ref<Tab>('reports')
const items = ref<SafetySummary[]>([])
const cursor = ref<string | null>(null)
const nextCursor = ref<string | null>(null)
const history = ref<(string | null)[]>([])
const busy = ref(false)
const loading = ref(false)
const writing = ref(false)
const listError = ref('')
const error = ref('')
const notice = ref('')
const selected = ref('')
const report = ref<ReportDetail | null>(null)
const appeal = ref<AppealDetail | null>(null)
const receipt = ref<SafetySummary | null>(null)
const operation = ref<Operation>('confirmed')
const reason = ref('')
const level = ref<PenaltyLevel>('minor')
const accountVersion = ref('')
const resourceVersion = ref('')
const confirmation = ref<Confirmation | null>(null)
let attempt: { fingerprint: string; key: string } | null = null
let generation = 0
const router = useRouter()
async function crisisEscalated(value: CrisisSummary) {
  close()
  try {
    await router.push({ path: '/crisis', query: { case: value.id } })
  } catch {
    error.value = '危机升级已确认，但页面跳转未完成，请进入危机工作台查看'
  }
}
const workspace = useAdminWorkspace(clearAll, safetyRoles)
const client = createSafetyClient(useAdminStore().session?.token ?? '', workspace.allowed)
const detail = computed(() => report.value ?? appeal.value)
const operationLabels: Record<Operation, string> = {
  confirmed: '确认举报',
  dismissed: '驳回举报',
  penalty: '给予账号处罚',
  offline: '下线违规内容',
  'release-restriction': '解除普通内容限制',
  uphold: '维持处罚',
  revoke: '撤销本项处罚',
}
const levelLabels: Record<PenaltyLevel, string> = {
  minor: '轻微：警告并移除违规内容',
  general: '一般：禁言 7 天',
  severe: '严重：永久封禁',
}
const kindLabels: Record<ContentKind, string> = {
  wish: '心愿',
  application: '应愿留言',
  message: '私聊消息',
  story: '还愿故事',
}
const options = computed<Operation[]>(() => {
  if (appeal.value) return appeal.value.status === 'pending' ? ['uphold', 'revoke'] : []
  const current = report.value
  if (!current || !['pending', 'processing', 'resolved', 'rejected'].includes(current.status))
    return []
  const result: Operation[] = ['offline', 'release-restriction']
  if (current.status === 'pending' || current.status === 'processing')
    result.unshift('confirmed', 'dismissed')
  if (current.status === 'resolved') result.unshift('penalty')
  return result
})
function status(value: string) {
  const labels: Record<string, string> = {
    pending: '待处理',
    processing: '处理中',
    resolved: '举报已确认',
    rejected: '未予支持',
    accepted: '申诉已通过',
    active: '处罚生效中',
    revoked: '处罚已撤销',
    expired: '处罚已到期',
    restricted: '内容仍有限制',
    released: '内容限制已解除',
  }
  return labels[value] ?? '未知状态（仅供查看）'
}
function positiveVersion(value: string): number | null {
  if (!/^[1-9]\d*$/u.test(value.trim())) return null
  const result = Number(value)
  return Number.isSafeInteger(result) ? result : null
}
const valid = computed(() => {
  if (!reason.value.trim() || !options.value.includes(operation.value)) return false
  if (operation.value === 'penalty') return positiveVersion(accountVersion.value) !== null
  if (operation.value === 'offline' || operation.value === 'release-restriction')
    return positiveVersion(resourceVersion.value) !== null
  return true
})
function clearEditor() {
  generation++
  selected.value = ''
  report.value = null
  appeal.value = null
  loading.value = false
  writing.value = false
  error.value = ''
  reason.value = ''
  accountVersion.value = ''
  resourceVersion.value = ''
  level.value = 'minor'
  confirmation.value = null
  attempt = null
}
function clearAll() {
  clearEditor()
  items.value = []
  cursor.value = null
  nextCursor.value = null
  history.value = []
  busy.value = false
  listError.value = ''
  notice.value = ''
  receipt.value = null
}
async function loadList() {
  busy.value = true
  items.value = []
  nextCursor.value = null
  listError.value = ''
  await workspace.run(
    (signal) =>
      tab.value === 'reports'
        ? client.reports(cursor.value, signal)
        : client.appeals(cursor.value, signal),
    (result) => {
      items.value = result.items
      nextCursor.value = result.next_cursor
    },
    (cause) => {
      listError.value = reviewErrorMessage(cause)
    },
    () => {
      busy.value = false
    },
  )
}
async function refresh(reset = true) {
  workspace.cancel()
  clearEditor()
  notice.value = ''
  receipt.value = null
  if (reset) {
    cursor.value = null
    history.value = []
  }
  await loadList()
}
async function switchTab(value: Tab) {
  if (value === tab.value || writing.value) return
  tab.value = value
  await refresh()
}
async function page(next: boolean) {
  if (busy.value || writing.value) return
  if (next) {
    if (!nextCursor.value) return
    history.value.push(cursor.value)
    cursor.value = nextCursor.value
  } else {
    if (!history.value.length) return
    cursor.value = history.value.pop() ?? null
  }
  await refresh(false)
}
async function open(id: string) {
  workspace.cancel()
  clearEditor()
  busy.value = false
  selected.value = id
  loading.value = true
  notice.value = ''
  receipt.value = null
  await workspace.run(
    async (signal) =>
      tab.value === 'reports'
        ? { type: 'report' as const, value: await client.report(id, signal) }
        : { type: 'appeal' as const, value: await client.appeal(id, signal) },
    (result) => {
      if (result.type === 'report') report.value = result.value
      else appeal.value = result.value
      operation.value = options.value[0] ?? 'confirmed'
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
  workspace.cancel()
  clearEditor()
}
function prepare() {
  if (!valid.value || writing.value || loading.value) return
  const message = reason.value.trim()
  const current = report.value
  if (current) {
    if (operation.value === 'confirmed' || operation.value === 'dismissed') {
      confirmation.value = {
        type: 'report',
        id: current.id,
        input: { decision: operation.value, reason: message, expected_version: current.version },
      }
    } else if (operation.value === 'penalty') {
      const version = positiveVersion(accountVersion.value)
      if (version === null) return
      confirmation.value = {
        type: 'penalty',
        id: current.subject_id,
        input: {
          violation_ref: current.id,
          content_ref: current.content_ref,
          content_version: current.content_version,
          level: level.value,
          reason: message,
          expected_version: version,
        },
      }
    } else if (operation.value === 'offline' || operation.value === 'release-restriction') {
      const version = positiveVersion(resourceVersion.value)
      if (version === null) return
      confirmation.value = {
        type: 'restriction',
        id: current.target_id,
        kind: current.target_kind,
        action: operation.value,
        input: { reason: message, expected_version: version },
      }
    }
  } else if (appeal.value && (operation.value === 'uphold' || operation.value === 'revoke')) {
    confirmation.value = {
      type: 'appeal',
      id: appeal.value.id,
      input: { decision: operation.value, reason: message, expected_version: appeal.value.version },
    }
  }
}
async function submit() {
  const current = confirmation.value
  if (!current || writing.value || !workspace.allowed()) return
  const fingerprint = JSON.stringify(current)
  if (attempt?.fingerprint !== fingerprint)
    attempt = { fingerprint, key: globalThis.crypto.randomUUID() }
  const key = attempt.key
  const caseId = selected.value
  writing.value = true
  error.value = ''
  await workspace.run(
    (signal) => {
      switch (current.type) {
        case 'report':
          return client.decideReport(current.id, current.input, key, signal)
        case 'appeal':
          return client.decideAppeal(current.id, current.input, key, signal)
        case 'penalty':
          return client.penalize(current.id, current.input, key, signal)
        case 'restriction':
          return client.restrict(
            current.kind,
            current.id,
            current.action,
            current.input,
            key,
            signal,
          )
      }
    },
    async (result) => {
      clearEditor()
      receipt.value = result
      notice.value =
        current.type === 'penalty'
          ? '处罚已受理，以服务端当前状态为准'
          : '处理已确认；解除处罚或普通内容限制不会自动恢复旧申请、匹配、内容公开或消息'
      await loadList()
    },
    async (cause) => {
      if (cause instanceof ApiError && cause.status === 409) {
        const expected = generation + 1
        await open(caseId)
        if (generation === expected && workspace.allowed())
          error.value =
            current.type === 'penalty' || current.type === 'restriction'
              ? '目标版本或状态已变化，已重读案件并清空版本与确认；请重新取得目标当前版本后核对，不会自动重提'
              : '案件版本或状态已变化，已重新读取；请重新核对，旧决定不会自动重提'
      } else if (cause instanceof ApiError && cause.status === 404) {
        clearEditor()
        error.value = reviewErrorMessage(cause)
      } else error.value = reviewErrorMessage(cause)
    },
    () => {
      writing.value = false
    },
  )
}
watch(
  [operation, reason, level, accountVersion, resourceVersion],
  () => {
    confirmation.value = null
  },
  { flush: 'sync' },
)
onMounted(() => {
  void loadList()
})
</script>

<template>
  <main class="panel workflow">
    <p class="eyebrow">安全治理 / 普通案件</p>
    <h1>举报、处罚与申诉</h1>
    <p>仅处理服务端授权的普通案件；账号角色管理请进入“后台账号管理”。</p>
    <template v-if="workspace.allowed()">
      <div class="workflow-actions" aria-label="案件分类">
        <button :aria-pressed="tab === 'reports'" :disabled="writing" @click="switchTab('reports')">
          举报管理
        </button>
        <button :aria-pressed="tab === 'appeals'" :disabled="writing" @click="switchTab('appeals')">
          申诉管理
        </button>
      </div>
      <p v-if="notice" role="status">{{ notice }}</p>
      <section v-if="receipt" class="workflow-box" aria-label="处理回执">
        <h2>处理回执</h2>
        <p>{{ receipt.id }} · {{ status(receipt.status) }} · 版本 {{ receipt.version }}</p>
      </section>
      <div class="workflow-grid">
        <section aria-label="案件列表" :aria-busy="busy">
          <h2>{{ tab === 'reports' ? '举报案件' : '申诉案件' }}</h2>
          <button :disabled="busy || writing" @click="refresh()">从首页刷新</button>
          <p v-if="busy" role="status">正在读取案件…</p>
          <div v-else-if="listError" role="alert">
            <p>{{ listError }}</p>
            <button @click="loadList">重试列表</button>
          </div>
          <p v-else-if="!items.length">暂无案件</p>
          <ul v-else class="workflow-list">
            <li v-for="item in items" :key="item.id">
              <button
                :aria-pressed="selected === item.id"
                :disabled="writing"
                @click="open(item.id)"
              >
                {{ item.id }} · {{ status(item.status) }} · 案件版本 {{ item.version
                }}<span v-if="item.kind"> · {{ kindLabels[item.kind] }}</span>
              </button>
            </li>
          </ul>
          <div class="workflow-actions">
            <button :disabled="busy || writing || !history.length" @click="page(false)">
              上一页
            </button>
            <button :disabled="busy || writing || !nextCursor" @click="page(true)">下一页</button>
          </div>
          <p>列表不展示举报说明、申诉正文或学生身份。</p>
        </section>
        <section aria-label="案件详情" :aria-busy="loading || writing">
          <h2>案件详情与处理</h2>
          <p v-if="loading" role="status">正在读取案件详情…</p>
          <p v-if="error" role="alert">{{ error }}</p>
          <button v-if="selected && !detail && !loading" @click="open(selected)">重试详情</button>
          <template v-if="detail">
            <button :disabled="writing" @click="close">关闭案件</button>
            <p>{{ detail.id }} · {{ status(detail.status) }} · 案件版本 {{ detail.version }}</p>
            <template v-if="report">
              <dl class="case-fields">
                <dt>内容类型</dt>
                <dd>{{ kindLabels[report.target_kind] }}</dd>
                <dt>内容对象</dt>
                <dd>{{ report.target_id }}</dd>
                <dt>正文版本</dt>
                <dd>{{ report.content_version }}</dd>
                <dt>举报类型代码</dt>
                <dd>{{ report.type_code }}</dd>
                <dt>被处置账号</dt>
                <dd>{{ report.subject_id }}</dd>
              </dl>
              <h3>案件允许查看的正文</h3>
              <blockquote v-if="report.body" class="workflow-body">{{ report.body }}</blockquote>
              <p v-else>当前正文不可展示，可能已换版、注销或受隐私屏障保护。</p>
              <h3>举报说明</h3>
              <p class="case-text">{{ report.description || '未提供说明' }}</p>
            </template>
            <template v-if="appeal">
              <p>原处罚编号：{{ appeal.penalty_id }}</p>
              <h3>申诉正文</h3>
              <blockquote class="workflow-body">{{ appeal.body }}</blockquote>
              <h3>原处罚理由</h3>
              <p class="case-text">{{ appeal.penalty_reason || '未提供理由' }}</p>
            </template>
            <p v-if="detail.reason" class="case-text">已有处理理由：{{ detail.reason }}</p>
            <CrisisEscalation
              v-if="report"
              :key="`${report.id}:${report.version}`"
              source="report"
              :source-id="report.id"
              :version="report.version"
              @escalated="crisisEscalated"
              @conflict="open(report.id)"
            />
            <form v-if="options.length" @submit.prevent="prepare">
              <fieldset :disabled="writing || !!confirmation">
                <legend>案件处理</legend>
                <label for="safety-operation">处理方式</label>
                <select id="safety-operation" v-model="operation">
                  <option v-for="value in options" :key="value" :value="value">
                    {{ operationLabels[value] }}
                  </option>
                </select>
                <template v-if="operation === 'penalty'">
                  <p>处罚目标固定为本案作者和精确正文，仅已确认举报可作为本页处罚依据。</p>
                  <label for="penalty-level">违规等级与固定措施</label>
                  <select id="penalty-level" v-model="level">
                    <option v-for="value in penaltyLevels" :key="value" :value="value">
                      {{ levelLabels[value] }}
                    </option>
                  </select>
                  <label for="account-version">被处置账号当前版本</label>
                  <input
                    id="account-version"
                    v-model="accountVersion"
                    type="text"
                    inputmode="numeric"
                    pattern="[1-9][0-9]*"
                    required
                    aria-describedby="account-version-note"
                  />
                  <p id="account-version-note">
                    请填写授权交接中该账号的当前版本；举报版本与正文版本不能代替。当前详情接口不提供此值。
                  </p>
                </template>
                <template v-if="operation === 'offline' || operation === 'release-restriction'">
                  <label for="resource-version">内容对象当前版本</label>
                  <input
                    id="resource-version"
                    v-model="resourceVersion"
                    type="text"
                    inputmode="numeric"
                    pattern="[1-9][0-9]*"
                    required
                    aria-describedby="resource-version-note"
                  />
                  <p id="resource-version-note">
                    请从授权交接取得本内容对象的当前版本；心愿与故事使用所属心愿版本，留言与消息使用各自对象版本，均不是正文版本。
                  </p>
                </template>
                <p
                  v-if="operation === 'revoke' || operation === 'release-restriction'"
                  class="banner"
                >
                  仅解除本项处罚或普通内容限制，不解除其他处罚、危机隔离或隐私屏障，不自动恢复旧交互或公开内容。
                </p>
                <label for="safety-reason">处理理由（必填）</label>
                <textarea id="safety-reason" v-model="reason" rows="4" required></textarea>
                <button type="submit" :disabled="!valid">核对处理</button>
              </fieldset>
            </form>
            <p v-else>当前案件已处理，仅供查看。</p>
            <section v-if="confirmation" class="workflow-box" aria-label="处理确认">
              <h3>确认{{ operationLabels[operation] }}</h3>
              <p>案件 {{ detail.id }} · 案件版本 {{ detail.version }}</p>
              <p>
                操作目标 {{ confirmation.id }} · 目标版本 {{ confirmation.input.expected_version }}
              </p>
              <p v-if="confirmation.type === 'penalty'">
                {{ levelLabels[confirmation.input.level] }} · 正文版本
                {{ confirmation.input.content_version }} · 精确内容
                {{ confirmation.input.content_ref }}
              </p>
              <p v-if="confirmation.type === 'restriction'">
                内容类型：{{ kindLabels[confirmation.kind] }}
              </p>
              <p class="case-text">理由：{{ confirmation.input.reason }}</p>
              <p>提交后以服务端状态为准；版本变化必须重新核对。</p>
              <div class="workflow-actions">
                <button :disabled="writing" @click="submit">
                  {{ writing ? '正在提交…' : '确认提交' }}
                </button>
                <button :disabled="writing" @click="confirmation = null">返回修改</button>
              </div>
            </section>
          </template>
          <p v-else-if="!loading && !selected">选择案件，按需读取详情。</p>
        </section>
      </div>
    </template>
  </main>
</template>
<style scoped>
.case-fields {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.5rem 1rem;
}
.case-fields dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.case-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
input {
  width: 100%;
  padding: 0.65rem;
  font: inherit;
  border: 1px solid var(--control-border);
  border-radius: 8px;
}
</style>
