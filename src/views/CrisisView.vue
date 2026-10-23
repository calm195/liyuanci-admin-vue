<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ApiError } from '@/services/admin'
import { createCrisisClient, validCrisisReason } from '@/services/crisis'
import { useAdminStore } from '@/stores/admin'
import { reviewErrorMessage, useAdminWorkspace } from '@/composables/useAdminWorkspace'
import { crisisActions } from '@/types/crisis'
import type {
  CrisisAction,
  CrisisDetail,
  CrisisEvent,
  CrisisEvidence,
  CrisisSummary,
  CrisisWork,
} from '@/types/crisis'

const route = useRoute()
const items = ref<CrisisSummary[]>([])
const cursor = ref<string | null>(null)
const nextCursor = ref<string | null>(null)
const history = ref<(string | null)[]>([])
const listBusy = ref(false)
const listError = ref('')
const detail = ref<CrisisDetail | null>(null)
const selected = ref('')
const loading = ref(false)
const error = ref('')
const timeline = ref<CrisisEvent[]>([])
const timelineBusy = ref(false)
const timelineError = ref('')
const work = ref<CrisisWork | null>(null)
const workBusy = ref(false)
const workError = ref('')
const evidence = ref<CrisisEvidence | null>(null)
const evidenceBusy = ref(false)
const evidenceError = ref('')
const showIdentity = ref(false)
const action = ref<CrisisAction | 'false_positive'>('take_over')
const reason = ref('')
const confirming = ref(false)
const writing = ref(false)
const notice = ref('')
const receipt = ref<CrisisSummary | null>(null)
let attempt: { fingerprint: string; key: string } | null = null
let generation = 0
let evidenceGeneration = 0
const workspace = useAdminWorkspace(clearAll, 'crisis_operator')
const client = createCrisisClient(useAdminStore().session?.token ?? '', workspace.allowed)
const evidenceRefs = computed(
  () => detail.value?.timeline.filter((item) => item.kind === 'evidence') ?? [],
)
const canAct = computed(
  () => detail.value?.status === 'pending_handling' || detail.value?.status === 'handling',
)
const valid = computed(() => canAct.value && validCrisisReason(reason.value.trim()))
const actionLabels: Record<CrisisAction | 'false_positive', string> = {
  take_over: '接手处置',
  follow_up: '记录跟进',
  resolve: '结束处置',
  retry_notification: '重试人员通知',
  false_positive: '判定误报并转普通复核',
}
function status(value: string) {
  const labels: Record<string, string> = {
    pending_handling: '待人工接手',
    handling: '处理中',
    resolved: '处置已结束',
    false_positive: '误报，已转普通复核',
    pending: '等待投递或重试',
    leased: '投递处理中',
    completed: '已完成',
    sent: '已送达',
    delivered: '已送达',
    cancelled: '已取消',
  }
  return labels[value] ?? '未知状态（仅供查看）'
}
function eventLabel(value: string) {
  const labels: Record<string, string> = {
    ...actionLabels,
    isolated: '自动隔离',
    detected: '人工判定危机',
    view: '案件授权查看',
    evidence_view: '限定证据查看',
  }
  return labels[value] ?? '其他服务端动作'
}
function displayTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    dateStyle: 'medium',
    timeStyle: 'medium',
    hour12: false,
  }).format(new Date(value))
}
function hideEvidence() {
  evidenceGeneration++
  evidence.value = null
  evidenceBusy.value = false
  evidenceError.value = ''
}
function clearCase() {
  generation++
  selected.value = ''
  detail.value = null
  timeline.value = []
  work.value = null
  loading.value = false
  timelineBusy.value = false
  workBusy.value = false
  timelineError.value = ''
  workError.value = ''
  error.value = ''
  showIdentity.value = false
  reason.value = ''
  action.value = 'take_over'
  confirming.value = false
  writing.value = false
  attempt = null
  hideEvidence()
}
function clearAll() {
  clearCase()
  items.value = []
  cursor.value = null
  nextCursor.value = null
  history.value = []
  listBusy.value = false
  listError.value = ''
  notice.value = ''
  receipt.value = null
}
function failure(cause: unknown) {
  if (cause instanceof ApiError && cause.status === 404)
    return '案件不存在、证据已不可访问或危机接口尚未装配，请联系后端核对'
  return reviewErrorMessage(cause)
}
async function loadList() {
  listBusy.value = true
  listError.value = ''
  items.value = []
  nextCursor.value = null
  await workspace.run(
    (signal) => client.list(cursor.value, signal),
    (page) => {
      items.value = page.items
      nextCursor.value = page.next_cursor
    },
    (cause) => {
      listError.value = failure(cause)
    },
    () => {
      listBusy.value = false
    },
  )
}
async function refresh(reset = true) {
  workspace.cancel()
  clearCase()
  notice.value = ''
  receipt.value = null
  if (reset) {
    cursor.value = null
    history.value = []
  }
  await loadList()
}
async function page(next: boolean) {
  if (listBusy.value || writing.value) return
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
async function loadTimeline() {
  const id = detail.value?.id
  if (!id || timelineBusy.value || writing.value) return
  timelineBusy.value = true
  timeline.value = []
  timelineError.value = ''
  await workspace.run(
    (signal) => client.timeline(id, signal),
    (value) => {
      timeline.value = value
    },
    (cause) => {
      timelineError.value = failure(cause)
    },
    () => {
      timelineBusy.value = false
    },
  )
}
async function loadWork() {
  const id = detail.value?.id
  if (!id || workBusy.value || writing.value) return
  workBusy.value = true
  work.value = null
  workError.value = ''
  await workspace.run(
    (signal) => client.work(id, signal),
    (value) => {
      work.value = value
    },
    (cause) => {
      workError.value = failure(cause)
    },
    () => {
      workBusy.value = false
    },
  )
}
async function open(id: string) {
  workspace.cancel()
  clearCase()
  listBusy.value = false
  notice.value = ''
  receipt.value = null
  selected.value = id
  loading.value = true
  await workspace.run(
    (signal) => client.detail(id, signal),
    async (value) => {
      detail.value = value
      await Promise.all([loadTimeline(), loadWork()])
    },
    (cause) => {
      error.value = failure(cause)
    },
    () => {
      loading.value = false
    },
  )
}
async function readEvidence(id: string) {
  const current = detail.value
  if (
    !current ||
    !evidenceRefs.value.some((ref) => ref.id === id) ||
    evidenceBusy.value ||
    writing.value
  )
    return
  hideEvidence()
  evidenceBusy.value = true
  const currentGeneration = evidenceGeneration
  await workspace.run(
    (signal) => client.evidence(current.id, id, signal),
    (value) => {
      if (currentGeneration === evidenceGeneration) evidence.value = value
    },
    (cause) => {
      if (currentGeneration === evidenceGeneration) evidenceError.value = failure(cause)
    },
    () => {
      if (currentGeneration === evidenceGeneration) evidenceBusy.value = false
    },
  )
}
function close() {
  workspace.cancel()
  clearCase()
}
function confirm() {
  if (valid.value && !loading.value && !writing.value) confirming.value = true
}
async function submit() {
  const current = detail.value
  if (!current || !confirming.value || !valid.value || writing.value) return
  const input = { reason: reason.value.trim(), expected_version: current.version }
  const selectedAction = action.value
  const fingerprint = JSON.stringify([current.id, selectedAction, input])
  if (attempt?.fingerprint !== fingerprint)
    attempt = { fingerprint, key: globalThis.crypto.randomUUID() }
  const key = attempt.key
  writing.value = true
  error.value = ''
  await workspace.run(
    (signal) =>
      selectedAction === 'false_positive'
        ? client.falsePositive(current.id, input, key, signal)
        : client.act(current.id, { ...input, action: selectedAction }, key, signal),
    async (result) => {
      clearCase()
      receipt.value = result
      notice.value =
        selectedAction === 'false_positive'
          ? '误报处理已确认：仅解除本案危机限制，后续须普通复核，不会直接公开或送达'
          : selectedAction === 'retry_notification'
            ? '通知重试请求已确认；不代表通知已送达或已有人员接手'
            : '处置已确认；结束处置不会自动解除危机隔离'
      await loadList()
    },
    async (cause) => {
      if (cause instanceof ApiError && cause.status === 409) {
        const expected = generation + 1
        await open(current.id)
        if (generation === expected && workspace.allowed())
          error.value = '案件版本或状态已变化，已重新读取；请重新核对，旧操作不会自动重试'
      } else if (cause instanceof ApiError && cause.status === 404) {
        clearCase()
        error.value = failure(cause)
      } else error.value = failure(cause)
    },
    () => {
      writing.value = false
    },
  )
}
watch(
  [action, reason],
  () => {
    confirming.value = false
  },
  { flush: 'sync' },
)
watch(
  () => route.query['case'],
  (value) => {
    if (typeof value === 'string' && value.trim()) void open(value)
  },
)
onMounted(() => {
  void (async () => {
    await loadList()
    const id = route.query['case']
    if (typeof id === 'string' && id.trim() && workspace.allowed()) await open(id)
  })()
})
</script>
<template>
  <main class="panel workflow">
    <p class="eyebrow">安全治理 / 危机处置</p>
    <h1>危机工作台</h1>
    <p>
      危机隔离和自动待办全天运行；北京时间 8–22
      时为人工窗口，夜间案件按服务端接手时刻交接，不承诺首次响应时限。
    </p>
    <template v-if="workspace.allowed()">
      <p v-if="notice" role="status">{{ notice }}</p>
      <section v-if="receipt" class="workflow-box" aria-label="危机处理回执">
        <h2>处理回执</h2>
        <p>{{ receipt.id }} · {{ status(receipt.status) }} · 案件版本 {{ receipt.version }}</p>
      </section>
      <div class="workflow-grid">
        <section aria-label="危机案件列表" :aria-busy="listBusy">
          <h2>危机案件</h2>
          <button :disabled="listBusy || writing" @click="refresh()">从首页刷新</button>
          <p v-if="listBusy" role="status">正在读取危机案件…</p>
          <div v-else-if="listError" role="alert">
            <p>{{ listError }}</p>
            <button @click="loadList">重试列表</button>
          </div>
          <p v-else-if="!items.length">暂无危机案件</p>
          <ul v-else class="workflow-list">
            <li v-for="item in items" :key="item.id">
              <button
                :aria-pressed="selected === item.id"
                :disabled="writing"
                @click="open(item.id)"
              >
                {{ item.id }} · {{ status(item.status) }} · 版本 {{ item.version }}
              </button>
            </li>
          </ul>
          <div class="workflow-actions">
            <button :disabled="listBusy || writing || !history.length" @click="page(false)">
              上一页</button
            ><button :disabled="listBusy || writing || !nextCursor" @click="page(true)">
              下一页
            </button>
          </div>
          <p>列表不展示身份或正文，材料仅在具体案件授权后读取。</p>
        </section>
        <section aria-label="危机案件详情" :aria-busy="loading || writing">
          <h2>案件详情</h2>
          <p v-if="loading" role="status">正在读取授权案件…</p>
          <p v-if="error" role="alert">{{ error }}</p>
          <button v-if="selected && !detail && !loading" @click="open(selected)">重试案件</button>
          <template v-if="detail">
            <button :disabled="writing" @click="close">关闭案件并清除材料</button>
            <p>{{ detail.id }} · {{ status(detail.status) }} · 案件版本 {{ detail.version }}</p>
            <p>
              学号：<span v-if="showIdentity">{{ detail.student_number || '未提供' }}</span
              ><span v-else>已隐藏</span>
            </p>
            <button :disabled="writing" @click="showIdentity = !showIdentity">
              {{ showIdentity ? '隐藏完整学号' : '显示完整学号' }}
            </button>
            <blockquote class="workflow-body">{{ detail.body }}</blockquote>
            <section aria-label="危机投递待办" class="workflow-box" :aria-busy="workBusy">
              <h3>关怀与人员通知待办</h3>
              <button :disabled="workBusy || writing" @click="loadWork">刷新待办</button>
              <p v-if="workBusy" role="status">正在读取待办…</p>
              <p v-if="workError" role="alert">{{ workError }}</p>
              <template v-if="work"
                ><p>
                  服务端接手窗口：{{
                    work.handoff_at ? displayTime(work.handoff_at) : '未提供'
                  }}（北京时间）
                </p>
                <ul>
                  <li v-for="item in work.items" :key="item.id">
                    {{
                      item.kind === 'care'
                        ? '本人关怀投递'
                        : item.kind === 'operator'
                          ? '授权人员通知'
                          : '其他待办'
                    }}
                    · {{ status(item.status) }} · 已尝试 {{ item.attempts }} 次 · 调度时刻
                    {{ displayTime(item.next_at) }}
                  </li>
                </ul>
                <p v-if="!work.items.length">暂无投递待办</p>
              </template>
              <p>通知或关怀投递完成不代表人工已接手；资料与通知依赖缺失时以服务端待办状态为准。</p>
            </section>
            <section aria-label="危机时间线" class="workflow-box" :aria-busy="timelineBusy">
              <h3>案件时间线</h3>
              <button :disabled="timelineBusy || writing" @click="loadTimeline">刷新时间线</button>
              <p v-if="timelineBusy" role="status">正在读取时间线…</p>
              <p v-if="timelineError" role="alert">{{ timelineError }}</p>
              <ol>
                <li v-for="item in timeline" :key="item.id">
                  <p>
                    {{ eventLabel(item.action) }} ·
                    {{ item.actor === 'system' ? '系统' : item.actor }} ·
                    {{ displayTime(item.at) }}（北京时间）
                  </p>
                  <p v-if="item.reason" class="crisis-text">{{ item.reason }}</p>
                </li>
              </ol>
              <p v-if="!timelineBusy && !timelineError && !timeline.length">暂无动作记录</p>
            </section>
            <section aria-label="限定证据" class="workflow-box">
              <h3>本案限定证据</h3>
              <button
                v-for="evidenceRef in evidenceRefs"
                :key="evidenceRef.id"
                :disabled="evidenceBusy || writing"
                @click="readEvidence(evidenceRef.id)"
              >
                查看证据 {{ evidenceRef.id }}
              </button>
              <p v-if="!evidenceRefs.length">当前案件未提供证据项引用</p>
              <p v-if="evidenceBusy" role="status">正在读取限定证据…</p>
              <p v-if="evidenceError" role="alert">{{ evidenceError }}</p>
              <template v-if="evidence"
                ><p>
                  证据 {{ evidence.id }} · {{ status(evidence.status) }} · 版本
                  {{ evidence.version }}
                </p>
                <p>学号：{{ showIdentity ? evidence.student_number || '未提供' : '已隐藏' }}</p>
                <blockquote class="workflow-body">{{ evidence.body }}</blockquote></template
              >
              <button v-if="evidence || evidenceBusy" @click="hideEvidence">收起证据</button>
              <p>仅包含本案授权文字证据，不读取无关学生卡。</p>
            </section>
            <form v-if="canAct" @submit.prevent="confirm">
              <fieldset :disabled="writing || confirming || loading">
                <legend>危机处置</legend>
                <label for="crisis-action">处置动作</label
                ><select id="crisis-action" v-model="action">
                  <option v-for="value in crisisActions" :key="value" :value="value">
                    {{ actionLabels[value] }}
                  </option>
                  <option value="false_positive">{{ actionLabels.false_positive }}</option>
                </select>
                <p v-if="action === 'false_positive'" class="banner">
                  误报只解除本案危机限制并转普通人工复核；不会直接公开或送达，不解除其他处罚或隐私屏障。
                </p>
                <p v-if="action === 'resolve'">结束处置保留危机隔离，不自动恢复内容。</p>
                <p v-if="action === 'retry_notification'">
                  只请求重试授权人员通知，不表示实际送达或接手。
                </p>
                <label for="crisis-reason">处理理由（必填，最多 2000 个字符）</label
                ><textarea id="crisis-reason" v-model="reason" rows="4" required></textarea
                ><button type="submit" :disabled="!valid">核对处置</button>
              </fieldset>
            </form>
            <p v-else>当前状态仅供查看，不能再次处置。</p>
            <section v-if="confirming" class="workflow-box" aria-label="危机处置确认">
              <h3>确认{{ actionLabels[action] }}</h3>
              <p>{{ detail.id }} · 案件版本 {{ detail.version }}</p>
              <p class="crisis-text">理由：{{ reason.trim() }}</p>
              <p>提交后以服务端状态为准；版本变化须重新核对。</p>
              <div class="workflow-actions">
                <button :disabled="writing" @click="submit">
                  {{ writing ? '正在提交…' : '确认提交' }}</button
                ><button :disabled="writing" @click="confirming = false">返回修改</button>
              </div>
            </section>
          </template>
          <p v-else-if="!loading && !selected">选择案件，按需读取授权材料。</p>
        </section>
      </div>
    </template>
  </main>
</template>
<style scoped>
.crisis-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
