<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ApiError } from '@/services/admin'
import { createModerationTransport, validModerationFeedback } from '@/services/content-transport'
import { useAdminStore } from '@/stores/admin'
import { reviewErrorMessage, useAdminWorkspace } from '@/composables/useAdminWorkspace'
import type {
  BusinessOutcome,
  ModerationCase,
  ModerationOutcome,
  ModerationSummary,
  ReviewDecision,
} from '@/types/moderation'

const items = ref<ModerationSummary[]>([])
const cursor = ref<string | null>(null)
const nextCursor = ref<string | null>(null)
const history = ref<(string | null)[]>([])
const listBusy = ref(false)
const listError = ref('')
const error = ref('')
const detail = ref<ModerationCase | null>(null)
const selectedId = ref('')
const loading = ref(false)
const writing = ref(false)
const decision = ref<'approved' | 'rejected'>('approved')
const reason = ref('')
const suggestion = ref('')
const confirming = ref(false)
const outcome = ref<ModerationOutcome | null>(null)
const notice = ref('')
let editorGeneration = 0
let attempt: { fingerprint: string; key: string } | null = null
const workspace = useAdminWorkspace(clearAll)
const client = createModerationTransport(useAdminStore().session?.token ?? '', workspace.allowed)
const valid = computed(
  () =>
    decision.value === 'approved' ||
    (validModerationFeedback(reason.value.trim()) &&
      validModerationFeedback(suggestion.value.trim())),
)
const outcomeLabels: Record<BusinessOutcome, string> = {
  published: '已公开',
  delivered: '已送达',
  cancelled: '业务已取消',
  privacy_review_required: '仍需隐私复核',
  pending_review: '仍待审核',
  ready: '待后续发布',
  expired: '已过期',
  active: '业务已生效',
}
function stateLabel(value: string) {
  const labels: Record<string, string> = {
    human_required: '待人工审核',
    approved: '已通过',
    rejected: '已驳回',
  }
  return labels[value] ?? '未知状态（只读）'
}
function clearEditor() {
  editorGeneration++
  detail.value = null
  selectedId.value = ''
  loading.value = false
  writing.value = false
  confirming.value = false
  decision.value = 'approved'
  reason.value = ''
  suggestion.value = ''
  error.value = ''
  outcome.value = null
  notice.value = ''
  attempt = null
}
function clearAll() {
  clearEditor()
  items.value = []
  cursor.value = null
  nextCursor.value = null
  history.value = []
  listBusy.value = false
  listError.value = ''
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
      listError.value = reviewErrorMessage(cause)
    },
    () => {
      listBusy.value = false
    },
  )
}
async function refresh(reset = true) {
  workspace.cancel()
  clearEditor()
  if (reset) {
    cursor.value = null
    history.value = []
  }
  await loadList()
}
async function page(direction: 'next' | 'previous') {
  if (listBusy.value || writing.value) return
  if (direction === 'next') {
    if (!nextCursor.value) return
    history.value.push(cursor.value)
    cursor.value = nextCursor.value
  } else {
    if (!history.value.length) return
    cursor.value = history.value.pop() ?? null
  }
  await refresh(false)
}
async function openCase(id: string) {
  workspace.cancel()
  clearEditor()
  selectedId.value = id
  loading.value = true
  await workspace.run(
    (signal) => client.detail(id, signal),
    (value) => {
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
  workspace.cancel()
  clearEditor()
}
function check() {
  if (valid.value && detail.value?.status === 'human_required') confirming.value = true
}
async function submit() {
  const current = detail.value
  if (
    !current ||
    !confirming.value ||
    !valid.value ||
    writing.value ||
    current.status !== 'human_required'
  )
    return
  const input: ReviewDecision =
    decision.value === 'approved'
      ? { decision: 'approved', expected_version: current.version }
      : {
          decision: 'rejected',
          expected_version: current.version,
          reason: reason.value.trim(),
          revision_suggestion: suggestion.value.trim(),
        }
  const fingerprint = JSON.stringify([current.id, input])
  if (attempt?.fingerprint !== fingerprint) attempt = { fingerprint, key: crypto.randomUUID() }
  const key = attempt.key
  writing.value = true
  error.value = ''
  await workspace.run(
    (signal) => client.decide(current.id, input, key, signal),
    async (result) => {
      clearEditor()
      outcome.value = result
      notice.value = '审核决定已确认，请分别核对内容判定与业务结果'
      await loadList()
    },
    async (cause) => {
      if (cause instanceof ApiError && cause.status === 409) {
        const generation = editorGeneration + 1
        await openCase(current.id)
        if (editorGeneration === generation && workspace.allowed())
          error.value = '版本或状态已变化，已重新读取；请重新核对，旧操作不会自动重试'
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
onMounted(() => {
  void loadList()
})
</script>
<template>
  <main class="panel workflow">
    <p class="eyebrow">内容治理 / 人工复核</p>
    <h1>内容审核</h1>
    <p>仅查看授权案件命中正文，不提供全站私聊或上下文会话搜索。</p>
    <template v-if="workspace.allowed()">
      <p class="banner">仅展示当前授权的审核案件，决定提交后以服务端业务结果为准。</p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <section v-if="outcome" class="workflow-box" aria-label="审核回执">
        <h2>审核回执</h2>
        <p>内容判定：{{ outcome.content_decision === 'approved' ? '通过' : '驳回' }}</p>
        <p>业务结果：{{ outcomeLabels[outcome.business_outcome] }}</p>
        <p>资源版本：{{ outcome.version }}</p>
        <p>内容通过不代表必然公开、送达或恢复交互。</p>
      </section>
      <div class="workflow-grid">
        <section aria-label="案件列表" :aria-busy="listBusy">
          <div class="workflow-actions">
            <h2>审核案件</h2>
            <button :disabled="listBusy || writing" @click="refresh()">刷新列表</button>
          </div>
          <p v-if="listBusy" role="status">正在加载案件…</p>
          <div v-else-if="listError" role="alert">
            <p>{{ listError }}</p>
            <button @click="loadList">重试列表</button>
          </div>
          <p v-else-if="!items.length">暂无审核案件</p>
          <ul v-else class="workflow-list">
            <li v-for="item in items" :key="item.id">
              <button :aria-pressed="selectedId === item.id" @click="openCase(item.id)">
                {{ item.id }} · {{ stateLabel(item.status) }} · 案件版本 {{ item.version }}
                <span v-if="item.content_version"> · 正文版本 {{ item.content_version }}</span>
              </button>
            </li>
          </ul>
          <div class="workflow-actions">
            <button :disabled="listBusy || writing || !history.length" @click="page('previous')">
              上一页
            </button>
            <button :disabled="listBusy || writing || !nextCursor" @click="page('next')">
              下一页
            </button>
          </div>
        </section>
        <section aria-label="案件操作" :aria-busy="loading || writing">
          <h2>案件详情</h2>
          <p v-if="error" role="alert">{{ error }}</p>
          <p v-if="loading" role="status">正在读取案件…</p>
          <button v-if="selectedId && !detail && !loading" @click="openCase(selectedId)">
            重试案件
          </button>
          <template v-if="detail">
            <button @click="close">关闭操作</button>
            <p>
              {{ detail.id }} · 案件版本 {{ detail.version }} · 正文版本
              {{ detail.content_version }}
            </p>
            <p v-if="detail.school_related === true" class="banner">
              本正文版本涉及学校官方内容：未经证实；仅同版本人工通过后才可按业务条件公开并保留提示。
            </p>
            <p v-else-if="detail.school_related === undefined">
              此响应未提供涉校标记，不据此判断是否涉校。
            </p>
            <blockquote class="workflow-body">{{ detail.body }}</blockquote>
            <p>{{ stateLabel(detail.status) }}</p>
            <form v-if="detail.status === 'human_required'" @submit.prevent="check">
              <fieldset :disabled="writing || confirming">
                <legend>审核决定</legend>
                <label
                  ><input
                    v-model="decision"
                    type="radio"
                    name="decision"
                    value="approved"
                  />通过内容审核</label
                >
                <label
                  ><input
                    v-model="decision"
                    type="radio"
                    name="decision"
                    value="rejected"
                  />驳回并建议修改</label
                >
                <template v-if="decision === 'rejected'">
                  <p>原因和建议各不得超过 2000 字节。</p>
                  <label for="moderation-reason">驳回原因（必填）</label>
                  <textarea id="moderation-reason" v-model="reason" rows="3" required></textarea>
                  <label for="moderation-suggestion">修改建议（必填）</label>
                  <textarea
                    id="moderation-suggestion"
                    v-model="suggestion"
                    rows="3"
                    required
                  ></textarea>
                </template>
                <button type="submit" :disabled="!valid">核对操作</button>
              </fieldset>
            </form>
            <p v-else>当前状态只读，不能直接再次操作。</p>
            <section v-if="confirming" class="workflow-box" aria-label="操作确认">
              <h3>确认操作</h3>
              <p>
                {{ detail.id }} · 案件版本 {{ detail.version }} · 正文版本
                {{ detail.content_version }} ·
                {{ decision === 'approved' ? '通过内容审核' : '驳回内容审核' }}
              </p>
              <p v-if="decision === 'rejected'">
                原因：{{ reason.trim() }}；建议：{{ suggestion.trim() }}
              </p>
              <p>提交后以服务返回状态为准；版本变化需重新核对。</p>
              <button :disabled="writing" @click="submit">
                {{ writing ? '正在提交…' : '确认提交' }}
              </button>
              <button :disabled="writing" @click="confirming = false">返回修改</button>
            </section>
          </template>
          <p v-else-if="!loading && !selectedId">选择案件，按需读取精确版本正文。</p>
        </section>
      </div>
    </template>
  </main>
</template>
