<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useAdminStore } from '@/stores/admin'
import { ApiError, mockEnabled, identityIntegrationEnabled } from '@/services/admin'
import { createIdentityReviewClient } from '@/services/identity'
import { createIdentityTransport } from '@/services/identity-transport'
import type {
  IdentityCase,
  IdentityDecision,
  IdentityReceipt,
  IdentitySummary,
} from '@/types/identity'

const admin = useAdminStore()
const owner = admin.session
const allowed = () => admin.session === owner && admin.can('review_operator')
const enabled = mockEnabled || identityIntegrationEnabled
const client = identityIntegrationEnabled
  ? createIdentityTransport(owner?.token ?? '', allowed)
  : createIdentityReviewClient(allowed)
const items = ref<IdentitySummary[]>([])
const nextCursor = ref<string | null>(null)
const currentCursor = ref<string | null>(null)
const cursors = ref<(string | null)[]>([])
const listBusy = ref(false)
const listError = ref('')
const detail = ref<IdentityCase | null>(null)
const selected = ref('')
const caseBusy = ref(false)
const cardBusy = ref(false)
const submitting = ref(false)
const cardUrl = ref('')
const caseError = ref('')
const notice = ref('')
const receipt = ref<IdentityReceipt | null>(null)
const decision = ref<'approved' | 'rejected'>('approved')
const reason = ref('')
const suggestion = ref('')
const confirming = ref(false)
const valid = computed(
  () => decision.value === 'approved' || (!!reason.value.trim() && !!suggestion.value.trim()),
)
let listController: AbortController | null = null
let caseController: AbortController | null = null
let listGeneration = 0
let caseGeneration = 0
let active = true
let attempt: { fingerprint: string; key: string } | null = null

function statusLabel(status: string) {
  return status === 'pending'
    ? '待审核'
    : status === 'approved'
      ? '已通过'
      : status === 'rejected'
        ? '已驳回'
        : '暂不可操作'
}
function hideCard() {
  if (cardUrl.value) URL.revokeObjectURL(cardUrl.value)
  cardUrl.value = ''
}
function clearCase() {
  caseGeneration++
  caseController?.abort()
  caseController = null
  hideCard()
  detail.value = null
  selected.value = ''
  caseBusy.value = false
  cardBusy.value = false
  submitting.value = false
  confirming.value = false
  reason.value = ''
  suggestion.value = ''
  decision.value = 'approved'
  caseError.value = ''
  receipt.value = null
  attempt = null
}
function clearAll() {
  listGeneration++
  listController?.abort()
  listController = null
  items.value = []
  nextCursor.value = null
  currentCursor.value = null
  cursors.value = []
  listError.value = ''
  listBusy.value = false
  notice.value = ''
  clearCase()
}
function message(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      clearAll()
      if (error.status === 401) admin.clear('会话已失效，请重新登录')
      else admin.forbidden++
      return '当前身份无权继续操作，请重新确认后台权限'
    }
    if (error.status === 404) return '案件不存在或已不可访问，请刷新列表'
    if (error.status === 409) return '案件版本或状态已变化，请重新核对后提交'
    if (error.status === 429) return '操作过于频繁，请稍后重试'
  }
  return '操作未完成，请重试；提交失败时请先核对案件最新状态'
}
async function loadList(cursor: string | null = currentCursor.value) {
  if (!allowed()) return clearAll()
  listController?.abort()
  const controller = new AbortController()
  listController = controller
  const generation = ++listGeneration
  listBusy.value = true
  listError.value = ''
  items.value = []
  nextCursor.value = null
  try {
    const result = await client.list(cursor, controller.signal)
    if (!active || controller.signal.aborted || generation !== listGeneration || !allowed()) return
    items.value = result.items
    nextCursor.value = result.next_cursor
    currentCursor.value = cursor
  } catch (error) {
    if (!active || controller.signal.aborted || generation !== listGeneration) return
    listError.value = message(error)
  } finally {
    if (generation === listGeneration) listBusy.value = false
  }
}
async function refreshList() {
  clearCase()
  await loadList()
}
async function nextPage() {
  if (!nextCursor.value || listBusy.value) return
  cursors.value.push(currentCursor.value)
  clearCase()
  currentCursor.value = nextCursor.value
  await loadList()
}
async function previousPage() {
  if (!cursors.value.length || listBusy.value) return
  clearCase()
  currentCursor.value = cursors.value.pop() ?? null
  await loadList()
}
async function openCase(id: string) {
  clearCase()
  notice.value = ''
  if (!allowed()) return
  selected.value = id
  const controller = new AbortController()
  caseController = controller
  const generation = caseGeneration
  caseBusy.value = true
  try {
    const result = await client.detail(id, controller.signal)
    if (!active || controller.signal.aborted || generation !== caseGeneration || !allowed()) return
    if (result.id !== id) throw new Error('案件响应不匹配')
    detail.value = result
  } catch (error) {
    if (!active || controller.signal.aborted || generation !== caseGeneration) return
    caseError.value = message(error)
  } finally {
    if (generation === caseGeneration) caseBusy.value = false
  }
}
async function showCard() {
  const current = detail.value
  const controller = caseController
  if (!current || !controller || cardBusy.value || !allowed()) return
  const generation = caseGeneration
  cardBusy.value = true
  caseError.value = ''
  hideCard()
  try {
    const image = await client.card(current.id, controller.signal)
    if (!active || controller.signal.aborted || generation !== caseGeneration || !allowed()) return
    cardUrl.value = URL.createObjectURL(image)
  } catch (error) {
    if (!active || controller.signal.aborted || generation !== caseGeneration) return
    if (error instanceof ApiError && error.status === 404) clearCase()
    caseError.value = message(error)
  } finally {
    if (generation === caseGeneration) cardBusy.value = false
  }
}
function cardFailed() {
  hideCard()
  caseError.value = '学生卡显示失败，请重新读取'
}
function confirmDecision() {
  if (valid.value && detail.value?.status === 'pending') confirming.value = true
}
async function submit() {
  const current = detail.value
  const controller = caseController
  if (
    !current ||
    !controller ||
    !valid.value ||
    !confirming.value ||
    submitting.value ||
    !allowed() ||
    current.status !== 'pending'
  )
    return
  const input: IdentityDecision =
    decision.value === 'approved'
      ? { decision: 'approved', expected_version: current.version }
      : {
          decision: 'rejected',
          expected_version: current.version,
          reason: reason.value.trim(),
          revision_suggestion: suggestion.value.trim(),
        }
  const fingerprint = JSON.stringify([current.id, input])
  if (attempt?.fingerprint !== fingerprint)
    attempt = { fingerprint, key: globalThis.crypto.randomUUID() }
  const generation = caseGeneration
  submitting.value = true
  caseError.value = ''
  try {
    const result = await client.decide(current.id, input, attempt.key, controller.signal)
    if (!active || controller.signal.aborted || generation !== caseGeneration || !allowed()) return
    if (result.request_id !== current.id) throw new Error('案件回执不匹配')
    clearCase()
    receipt.value = result
    notice.value = `审核提交已确认：${statusLabel(result.status)}，版本 ${result.version}`
    await loadList()
  } catch (error) {
    if (!active || controller.signal.aborted || generation !== caseGeneration) return
    if (error instanceof ApiError && error.status === 409) {
      const reloadedGeneration = caseGeneration + 1
      await openCase(current.id)
      if (
        active &&
        caseGeneration === reloadedGeneration &&
        selected.value === current.id &&
        allowed()
      )
        caseError.value = '案件版本或状态已变化，已重新读取；请重新核对，旧决定不会自动重试'
    } else {
      caseError.value = message(error)
    }
  } finally {
    if (generation === caseGeneration) submitting.value = false
  }
}
watch(
  () => [admin.session, admin.can('review_operator')],
  () => {
    if (!allowed()) clearAll()
  },
  { flush: 'sync' },
)
onMounted(() => {
  if (enabled) void loadList()
})
onBeforeUnmount(() => {
  active = false
  clearAll()
})
</script>

<template>
  <main class="panel identity-review">
    <p class="eyebrow">认证管理 / 身份审核</p>
    <h1>身份审核</h1>
    <p>按案件核对身份资料，不设置审核倒计时。</p>
    <p v-if="!enabled" role="status">真实身份审核待接口验收后开放。</p>
    <template v-else>
      <p v-if="mockEnabled" class="banner">
        合成业务演示 · 学生与卡图均为虚构，决定仅在当前页面内生效
      </p>
      <p v-else class="banner">
        隔离接口联调 · 身份材料由同源后台按案件授权返回，尚未完成真实服务验收
      </p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <section v-if="receipt" class="receipt" aria-label="审核回执">
        <h2>审核回执</h2>
        <p>
          案件 {{ receipt.request_id }} · {{ statusLabel(receipt.status) }} · 版本
          {{ receipt.version }}
        </p>
        <p v-if="receipt.reason">驳回原因：{{ receipt.reason }}</p>
        <p v-if="receipt.revision_suggestion">修改建议：{{ receipt.revision_suggestion }}</p>
      </section>
      <div class="review-grid">
        <section aria-labelledby="case-list-title" :aria-busy="listBusy">
          <div class="review-actions">
            <h2 id="case-list-title">审核案件</h2>
            <button :disabled="listBusy" @click="refreshList">刷新列表</button>
          </div>
          <p v-if="listBusy" role="status">正在加载案件…</p>
          <div v-else-if="listError" role="alert">
            <p>{{ listError }}</p>
            <button @click="loadList()">重试列表</button>
          </div>
          <p v-else-if="!items.length">暂无审核案件</p>
          <ul v-else class="case-list">
            <li v-for="item in items" :key="item.id">
              <button :aria-pressed="selected === item.id" @click="openCase(item.id)">
                <span>{{ item.id }}</span>
                <span>{{ statusLabel(item.status) }} · 版本 {{ item.version }}</span>
              </button>
            </li>
          </ul>
          <div class="review-actions">
            <button :disabled="listBusy || !cursors.length" @click="previousPage">上一页</button>
            <button :disabled="listBusy || !nextCursor" @click="nextPage">下一页</button>
          </div>
          <p class="muted">列表仅展示案件编号、状态与版本。</p>
        </section>
        <section aria-labelledby="case-detail-title" :aria-busy="caseBusy || submitting">
          <h2 id="case-detail-title">案件详情</h2>
          <p v-if="caseBusy" role="status">正在读取案件…</p>
          <p v-if="caseError" role="alert">{{ caseError }}</p>
          <button v-if="selected && !detail && !caseBusy" @click="openCase(selected)">
            重试案件
          </button>
          <template v-if="detail">
            <div class="review-actions">
              <p>{{ detail.id }}</p>
              <button @click="clearCase">关闭案件</button>
            </div>
            <dl class="identity-fields">
              <dt>姓名</dt>
              <dd>{{ detail.name }}</dd>
              <dt>学号</dt>
              <dd>{{ detail.student_number }}</dd>
              <dt>状态</dt>
              <dd>{{ statusLabel(detail.status) }} · 版本 {{ detail.version }}</dd>
            </dl>
            <p class="muted">身份资料仅供当前授权案件使用，离开页面即清除。</p>
            <div class="review-actions">
              <button :disabled="cardBusy || submitting" @click="showCard">
                {{ cardBusy ? '正在读取…' : '查看学生卡' }}
              </button>
              <button v-if="cardUrl" @click="hideCard">收起学生卡</button>
            </div>
            <img
              v-if="cardUrl"
              class="student-card"
              :src="cardUrl"
              alt="当前授权案件的学生卡"
              @error="cardFailed"
            />
            <form v-if="detail.status === 'pending'" @submit.prevent="confirmDecision">
              <fieldset :disabled="submitting || confirming">
                <legend>审核决定</legend>
                <label
                  ><input
                    v-model="decision"
                    type="radio"
                    value="approved"
                    name="decision"
                  />通过认证</label
                >
                <label
                  ><input
                    v-model="decision"
                    type="radio"
                    value="rejected"
                    name="decision"
                  />驳回并建议修改</label
                >
                <template v-if="decision === 'rejected'">
                  <label for="reject-reason">驳回原因（必填）</label>
                  <textarea id="reject-reason" v-model="reason" required rows="3"></textarea>
                  <label for="revision-suggestion">修改建议（必填）</label>
                  <textarea
                    id="revision-suggestion"
                    v-model="suggestion"
                    required
                    rows="3"
                  ></textarea>
                </template>
                <button :disabled="!valid" type="submit">核对决定</button>
              </fieldset>
            </form>
            <section v-if="confirming" class="receipt" aria-label="提交确认">
              <h3>确认审核决定</h3>
              <p>
                {{ detail.id }} · 当前版本 {{ detail.version }} ·
                {{ decision === 'approved' ? '通过认证' : '驳回认证' }}
              </p>
              <p v-if="decision === 'rejected'">
                原因：{{ reason.trim() }}；建议：{{ suggestion.trim() }}
              </p>
              <p>提交后以服务返回状态为准；版本变化需重新核对。</p>
              <div class="review-actions">
                <button :disabled="submitting" @click="submit">
                  {{ submitting ? '正在提交…' : '确认提交' }}
                </button>
                <button :disabled="submitting" @click="confirming = false">返回修改</button>
              </div>
            </section>
            <p v-else-if="detail.status !== 'pending'">当前案件不可再次审核。</p>
          </template>
          <p v-else-if="!caseBusy && !selected">选择一个案件，按需读取身份详情和学生卡。</p>
        </section>
      </div>
    </template>
  </main>
</template>

<style scoped>
.identity-review {
  max-width: 1200px;
}
.review-grid {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(0, 2fr);
  gap: 2rem;
  margin-top: 2rem;
}
.review-grid > section {
  min-width: 0;
}
.review-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin: 1rem 0;
}
.case-list {
  list-style: none;
  padding: 0;
}
.case-list button {
  width: 100%;
  display: grid;
  text-align: left;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
  overflow-wrap: anywhere;
  background: #f3f7f6;
  color: #183c3a;
}
.case-list button[aria-pressed='true'] {
  border: 2px solid #176957;
  background: #e3f2ed;
}
.identity-fields {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.5rem 1rem;
}
.identity-fields dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.muted {
  color: #4d7369;
  font-size: 0.9rem;
}
.student-card {
  display: block;
  max-width: 100%;
  margin: 1rem 0;
  border-radius: 12px;
}
fieldset {
  border: 1px solid #d3dfdb;
  border-radius: 12px;
  margin-top: 1rem;
  padding: 1rem;
}
fieldset label {
  margin: 0.75rem 0;
}
textarea {
  width: 100%;
  font: inherit;
  border: 1px solid #75978c;
  border-radius: 8px;
  padding: 0.75rem;
  margin-bottom: 1rem;
}
.receipt {
  background: #f3f7f6;
  border: 1px solid #d3dfdb;
  border-radius: 12px;
  padding: 1rem;
  margin: 1rem 0;
  overflow-wrap: anywhere;
}
@media (max-width: 760px) {
  .review-grid {
    grid-template-columns: 1fr;
  }
}
</style>
