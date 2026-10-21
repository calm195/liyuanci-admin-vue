<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { mockEnabled, ApiError } from '@/services/admin'
import { createModerationClient } from '@/services/moderation'
import { reviewErrorMessage, useAdminWorkspace } from '@/composables/useAdminWorkspace'
import type {
  BusinessOutcome,
  DemoContent,
  ModerationCase,
  ModerationOutcome,
  ModerationSummary,
  ReviewDecision,
} from '@/types/moderation'

const items = ref<ModerationSummary[]>([])
const targets = ref<DemoContent[]>([])
const cursor = ref<string | null>(null)
const nextCursor = ref<string | null>(null)
const history = ref<(string | null)[]>([])
const listBusy = ref(false)
const listError = ref('')
const error = ref('')
const detail = ref<ModerationCase | null>(null)
const target = ref<DemoContent | null>(null)
const selectedId = ref('')
const loading = ref(false)
const writing = ref(false)
const decision = ref<'approved' | 'rejected'>('approved')
const reason = ref('')
const suggestion = ref('')
const confirming = ref(false)
const outcome = ref<ModerationOutcome | null>(null)
const commandReceipt = ref<ModerationSummary | null>(null)
const notice = ref('')
let editorGeneration = 0
let attempt: { fingerprint: string; key: string } | null = null
const workspace = useAdminWorkspace(clearAll)
const client = createModerationClient(workspace.allowed)
const valid = computed(() =>
  target.value
    ? !!reason.value.trim()
    : decision.value === 'approved' || (!!reason.value.trim() && !!suggestion.value.trim()),
)
const restrictionAction = computed(() =>
  target.value?.ordinary_restricted ? 'release-restriction' : 'offline',
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
    pending: '待审核',
    approved: '已通过',
    rejected: '已驳回',
    published: '已公开',
    offline: '普通违规下线',
    withdrawn: '已撤下',
  }
  return labels[value] ?? '未知状态（只读）'
}
function clearEditor() {
  editorGeneration++
  detail.value = null
  target.value = null
  selectedId.value = ''
  loading.value = false
  writing.value = false
  confirming.value = false
  decision.value = 'approved'
  reason.value = ''
  suggestion.value = ''
  error.value = ''
  outcome.value = null
  commandReceipt.value = null
  notice.value = ''
  attempt = null
}
function clearAll() {
  clearEditor()
  items.value = []
  targets.value = []
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
    async (signal) => {
      const [page, contents] = await Promise.all([
        client.list(cursor.value, signal),
        client.demoContents(signal),
      ])
      return { page, contents }
    },
    ({ page, contents }) => {
      items.value = page.items
      nextCursor.value = page.next_cursor
      targets.value = contents
    },
    (cause) => {
      listError.value = reviewErrorMessage(cause)
    },
    () => {
      listBusy.value = false
    },
  )
}
async function refresh() {
  workspace.cancel()
  clearEditor()
  await loadList()
}
async function page(direction: 'next' | 'previous') {
  if (listBusy.value) return
  if (direction === 'next') {
    if (!nextCursor.value) return
    history.value.push(cursor.value)
    cursor.value = nextCursor.value
  } else {
    if (!history.value.length) return
    cursor.value = history.value.pop() ?? null
  }
  await refresh()
}
async function openCase(id: string) {
  workspace.cancel()
  clearEditor()
  selectedId.value = id
  loading.value = true
  await workspace.run(
    (signal) => client.detail(id, signal),
    (value) => {
      if (value.id !== id) throw new Error('案件响应不匹配')
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
function selectTarget(value: DemoContent) {
  workspace.cancel()
  clearEditor()
  target.value = { ...value }
}
function close() {
  workspace.cancel()
  clearEditor()
}
function check() {
  if (valid.value && (detail.value?.status === 'pending' || target.value)) confirming.value = true
}
async function submit() {
  if (!confirming.value || !valid.value || writing.value) return
  const current = detail.value
  const content = target.value
  if (!current && !content) return
  if (current && current.status !== 'pending') return
  const action = restrictionAction.value
  const input: ReviewDecision =
    decision.value === 'approved'
      ? { decision: 'approved', expected_version: current?.version ?? 1 }
      : {
          decision: 'rejected',
          expected_version: current?.version ?? 1,
          reason: reason.value.trim(),
          revision_suggestion: suggestion.value.trim(),
        }
  const command = { expected_version: content?.version ?? 1, reason: reason.value.trim() }
  const fingerprint = JSON.stringify(
    content ? [content.kind, content.id, action, command] : [current?.id, input],
  )
  if (attempt?.fingerprint !== fingerprint)
    attempt = { fingerprint, key: globalThis.crypto.randomUUID() }
  const key = attempt.key
  writing.value = true
  error.value = ''
  await workspace.run(
    async (signal) => {
      if (content)
        return {
          type: 'restriction' as const,
          value: await client.restrict(content.kind, content.id, action, command, key, signal),
        }
      if (!current) throw new Error('请先选择案件')
      return {
        type: 'decision' as const,
        value: await client.decide(current.id, input, key, signal),
      }
    },
    async (result) => {
      if (result.type === 'restriction' && result.value.id !== content?.id)
        throw new Error('内容回执不匹配')
      clearEditor()
      if (result.type === 'decision') {
        outcome.value = result.value
        notice.value = '审核决定已确认，请分别核对内容判定与业务结果'
      } else {
        commandReceipt.value = result.value
        notice.value =
          action === 'offline'
            ? '普通违规下线已确认'
            : '普通限制已解除；未自动上架，也未解除危机隔离'
      }
      await loadList()
    },
    async (cause) => {
      if (cause instanceof ApiError && cause.status === 409) {
        const rereadGeneration = editorGeneration + 1
        if (current) await openCase(current.id)
        else await refresh()
        if (editorGeneration === rereadGeneration)
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
  if (mockEnabled) void loadList()
})
</script>
<template>
  <main class="panel workflow">
    <p class="eyebrow">内容治理 / 人工复核</p>
    <h1>内容审核</h1>
    <p>仅查看授权案件命中正文，不提供全站私聊或上下文会话搜索。</p>
    <p v-if="!mockEnabled" role="status">真实内容审核待接口验收后开放。</p>
    <template v-else>
      <p class="banner">合成业务演示 · 案件、正文和内容处置对象均为虚构，离开页面后重置</p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <section v-if="outcome" class="workflow-box" aria-label="审核回执">
        <h2>审核回执</h2>
        <p>内容判定：{{ outcome.content_decision === 'approved' ? '通过' : '驳回' }}</p>
        <p>业务结果：{{ outcomeLabels[outcome.business_outcome] }}</p>
        <p>资源版本：{{ outcome.version }}</p>
        <p>内容通过不代表必然公开、送达或恢复交互。</p>
      </section>
      <section v-if="commandReceipt" class="workflow-box" aria-label="处置回执">
        <h2>处置回执</h2>
        <p>
          {{ commandReceipt.id }} · {{ stateLabel(commandReceipt.status) }} · 资源版本
          {{ commandReceipt.version }}
        </p>
      </section>
      <div class="workflow-grid">
        <section aria-label="案件列表" :aria-busy="listBusy">
          <div class="workflow-actions">
            <h2>审核案件</h2>
            <button :disabled="listBusy || writing" @click="refresh">刷新列表</button>
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
                {{ item.id }} · {{ stateLabel(item.status) }} · 案件版本 {{ item.version
                }}<span v-if="item.content_version"> · 正文版本 {{ item.content_version }}</span>
              </button>
            </li>
          </ul>
          <div class="workflow-actions">
            <button :disabled="listBusy || !history.length" @click="page('previous')">上一页</button
            ><button :disabled="listBusy || !nextCursor" @click="page('next')">下一页</button>
          </div>
          <h2>合成内容处置样例</h2>
          <p>此目录独立于审核案件，不从案件编号推断内容对象。</p>
          <ul class="workflow-list">
            <li v-for="item in targets" :key="item.id">
              <button :disabled="listBusy" @click="selectTarget(item)">
                {{ item.id }} · {{ stateLabel(item.status) }} · 资源版本 {{ item.version }}
              </button>
            </li>
          </ul>
        </section>
        <section aria-label="案件操作" :aria-busy="loading || writing">
          <h2>{{ target ? '普通内容处置' : '案件详情' }}</h2>
          <p v-if="error" role="alert">{{ error }}</p>
          <p v-if="loading" role="status">正在读取案件…</p>
          <button v-if="selectedId && !detail && !loading" @click="openCase(selectedId)">
            重试案件
          </button>
          <template v-if="detail || target">
            <button @click="close">关闭操作</button>
            <template v-if="detail">
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
            </template>
            <template v-if="target"
              ><p>{{ target.kind }} / {{ target.id }} · 资源版本 {{ target.version }}</p>
              <p>
                {{
                  restrictionAction === 'offline' ? '普通违规下线' : '解除普通限制'
                }}；不会操作危机隔离。
              </p></template
            >
            <form
              v-if="
                detail?.status === 'pending' ||
                (target && (target.status === 'published' || target.ordinary_restricted))
              "
              @submit.prevent="check"
            >
              <fieldset :disabled="writing || confirming">
                <legend>{{ target ? '处置理由' : '审核决定' }}</legend>
                <template v-if="!target"
                  ><label
                    ><input
                      v-model="decision"
                      type="radio"
                      name="decision"
                      value="approved"
                    />通过内容审核</label
                  ><label
                    ><input
                      v-model="decision"
                      type="radio"
                      name="decision"
                      value="rejected"
                    />驳回并建议修改</label
                  ></template
                >
                <template v-if="target || decision === 'rejected'"
                  ><label for="moderation-reason"
                    >{{ target ? '处置原因' : '驳回原因' }}（必填）</label
                  ><textarea id="moderation-reason" v-model="reason" rows="3" required></textarea>
                </template>
                <template v-if="!target && decision === 'rejected'"
                  ><label for="moderation-suggestion">修改建议（必填）</label
                  ><textarea
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
              <p v-if="detail">
                {{ detail.id }} · 案件版本 {{ detail.version }} · 正文版本
                {{ detail.content_version }} ·
                {{ decision === 'approved' ? '通过内容审核' : '驳回内容审核' }}
              </p>
              <p v-else-if="target">
                {{ target.kind }}/{{ target.id }} · 资源版本 {{ target.version }} ·
                {{ restrictionAction === 'offline' ? '普通违规下线' : '解除普通限制，不自动上架' }}
              </p>
              <p v-if="reason.trim()">原因：{{ reason.trim() }}</p>
              <p v-if="!target && decision === 'rejected'">修改建议：{{ suggestion.trim() }}</p>
              <div class="workflow-actions">
                <button :disabled="writing" @click="submit">
                  {{ writing ? '正在提交…' : '确认提交' }}</button
                ><button :disabled="writing" @click="confirming = false">返回修改</button>
              </div>
            </section>
          </template>
          <p v-else-if="!loading && !selectedId">选择案件复核，或选择合成内容处置样例。</p>
        </section>
      </div>
    </template>
  </main>
</template>
