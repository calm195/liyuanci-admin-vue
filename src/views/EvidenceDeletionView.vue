<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ApiError } from '@/services/admin'
import { createPrivacyClient, validDeletionId, validDeletionReason } from '@/services/privacy'
import { useAdminStore } from '@/stores/admin'
import { reviewErrorMessage, useAdminWorkspace } from '@/composables/useAdminWorkspace'
import type { DeletionJob, DeletionProgress, EvidenceTarget } from '@/types/privacy'

const evidenceId = ref('')
const target = ref<EvidenceTarget | null>(null)
const reason = ref('')
const confirmation = ref(false)
const busy = ref(false)
const error = ref('')
const accepted = ref<DeletionJob | null>(null)
const jobId = ref('')
const handle = ref('')
const progress = ref<DeletionProgress | null>(null)
const progressKind = ref('')
let attempt: { fingerprint: string; key: string } | null = null
const workspace = useAdminWorkspace(clear, 'super_admin')
const client = createPrivacyClient(useAdminStore().session?.token ?? '', workspace.allowed)
const reasonBytes = computed(() => new TextEncoder().encode(reason.value).length)
const canPrepare = computed(
  () => !!target.value && validDeletionReason(reason.value) && !busy.value,
)
const retryHint = computed(() => {
  const code = progress.value?.retryable_error
  if (!code) return ''
  if (code === 'external_cleanup_unavailable') return '外部清理依赖暂不可用，后端将重试。'
  if (code === 'database_cleanup_unavailable') return '数据库清理暂不可用，后端将重试。'
  return '清理暂未完成，请稍后重新查询。'
})
function clearTarget() {
  target.value = null
  reason.value = ''
  confirmation.value = false
  attempt = null
}
function clear() {
  clearTarget()
  evidenceId.value = ''
  jobId.value = ''
  handle.value = ''
  accepted.value = null
  progress.value = null
  progressKind.value = ''
  error.value = ''
  busy.value = false
}
watch(evidenceId, clearTarget, { flush: 'sync' })
watch(
  [jobId, handle],
  () => {
    progress.value = null
    progressKind.value = ''
  },
  { flush: 'sync' },
)
function failure(cause: unknown) {
  error.value = reviewErrorMessage(cause)
}
async function loadTarget() {
  if (busy.value || !validDeletionId(evidenceId.value.trim())) return
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
  if (canPrepare.value) confirmation.value = true
}
async function submit() {
  const current = target.value
  if (!current || !confirmation.value || !canPrepare.value) return
  const input = { reason: reason.value, expected_version: current.version }
  const fingerprint = JSON.stringify({ id: current.id, ...input })
  if (attempt?.fingerprint !== fingerprint)
    attempt = { fingerprint, key: globalThis.crypto.randomUUID() }
  const key = attempt.key
  busy.value = true
  error.value = ''
  accepted.value = null
  progress.value = null
  await workspace.run(
    (signal) => client.remove(current.id, input, key, signal),
    (value) => {
      clearTarget()
      evidenceId.value = ''
      accepted.value = value
      jobId.value = value.id
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
async function query(kind: 'job' | 'receipt') {
  if (busy.value) return
  const value = kind === 'job' ? jobId.value.trim() : handle.value.trim()
  if (!value) return
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
      error.value =
        cause instanceof ApiError && cause.status === 404
          ? '待办或回执不存在、已过期或不可访问；不能据此认定清理完成'
          : reviewErrorMessage(cause)
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
</script>
<template>
  <main class="panel workflow">
    <p class="eyebrow">隐私管理 / 超级管理员</p>
    <h1>证据删除与回执</h1>
    <template v-if="workspace.allowed()">
      <p class="banner">删除作用于该证据所属的整个保留范围，无法撤回。受理不代表物理清理完成。</p>
      <p>仅查询已知证据、待办或完整回执。后台未提供列表；信息只保留在当前页面内存中。</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="busy" role="status">正在处理请求…</p>
      <button :disabled="busy" @click="reset">清空页面</button>
      <section class="workflow-box" aria-label="证据删除">
        <h2>读取并核对证据</h2>
        <form @submit.prevent="loadTarget">
          <fieldset :disabled="busy || confirmation">
            <legend>已知证据条目标识</legend>
            <label for="delete-evidence-id">证据条目 ID</label>
            <input
              id="delete-evidence-id"
              v-model="evidenceId"
              autocomplete="off"
              spellcheck="false"
            />
            <button :disabled="!validDeletionId(evidenceId.trim())" type="submit">
              读取证据元信息
            </button>
          </fieldset>
        </form>
        <template v-if="target">
          <p>证据条目：{{ target.id }} · 关联危机案件：{{ target.case_id }}</p>
          <p>证据范围版本：{{ target.version }} · 案件状态：{{ target.status }}</p>
          <p>不展示正文或学号。此处使用证据范围版本，关联案件状态不能代替清理状态。</p>
          <form @submit.prevent="prepare">
            <fieldset :disabled="busy || confirmation">
              <legend>删除理由</legend>
              <label for="delete-reason">理由（最多 2000 个 UTF-8 字节）</label>
              <textarea id="delete-reason" v-model="reason" rows="4" autocomplete="off"></textarea>
              <p>{{ reasonBytes }} / 2000 字节</p>
              <button type="submit" :disabled="!canPrepare">核对删除范围</button>
            </fieldset>
          </form>
          <section v-if="confirmation" aria-label="最终删除确认">
            <h3>确认删除整个证据范围</h3>
            <p>
              证据条目：{{ target.id }} · 关联案件：{{ target.case_id }} · 范围版本：{{
                target.version
              }}
            </p>
            <p class="workflow-body">删除理由：{{ reason }}</p>
            <p>将停止该范围的证据读取并进入异步清理，不能撤回，也不会解除普通内容的危机限制。</p>
            <button :disabled="busy" @click="submit">确认删除证据范围</button>
            <button :disabled="busy" @click="confirmation = false">返回修改</button>
          </section>
        </template>
      </section>
      <p v-if="accepted" role="status">
        已受理，尚未确认清理完成。待办：{{ accepted.id }} · 待办版本：{{ accepted.version }}
      </p>
      <section class="workflow-box" aria-label="删除进度查询">
        <h2>查询清理进度</h2>
        <form @submit.prevent="query('job')">
          <fieldset :disabled="busy">
            <legend>后台证据删除待办</legend>
            <label for="delete-job-id">待办 ID（不是证据 ID）</label>
            <input id="delete-job-id" v-model="jobId" autocomplete="off" spellcheck="false" />
            <button type="submit" :disabled="!validDeletionId(jobId.trim())">
              查询证据删除待办
            </button>
          </fieldset>
        </form>
        <form @submit.prevent="query('receipt')">
          <fieldset :disabled="busy">
            <legend>匿名删除回执</legend>
            <label for="delete-receipt">本人主动提供的完整删除回执</label>
            <input
              id="delete-receipt"
              v-model="handle"
              type="password"
              autocomplete="off"
              spellcheck="false"
            />
            <p>回执是访问凭据，请勿复制到网址、日志或截图；查询不携带后台令牌。</p>
            <button type="submit" :disabled="!handle.trim()">查询匿名删除回执</button>
          </fieldset>
        </form>
        <section v-if="progress" aria-label="清理结果" role="status">
          <h3>{{ progressKind }}</h3>
          <p v-if="progress.status === 'completed'">清理已完成（后端确认）。</p>
          <p v-else>正在清理，尚未全部完成；请稍后手动刷新查询。</p>
          <p v-if="retryHint">{{ retryHint }}</p>
        </section>
      </section>
    </template>
  </main>
</template>
