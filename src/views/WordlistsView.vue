<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { mockEnabled, ApiError } from '@/services/admin'
import { createWordlistClient } from '@/services/wordlists'
import { reviewErrorMessage, useAdminWorkspace } from '@/composables/useAdminWorkspace'
import { wordlistKinds } from '@/types/wordlists'
import type { Wordlist, WordlistInput, WordlistKind } from '@/types/wordlists'

const items = ref<Wordlist[]>([])
const busy = ref(false)
const writing = ref(false)
const loaded = ref(false)
const error = ref('')
const notice = ref('')
const kind = ref<WordlistKind>('school')
const text = ref('')
const confirmation = ref<WordlistInput | Wordlist | null>(null)
let generation = 0
let attempt: { fingerprint: string; key: string } | null = null
const workspace = useAdminWorkspace(clear)
const client = createWordlistClient(workspace.allowed)
const labels: Record<WordlistKind, string> = {
  crisis: '危机',
  school: '涉校',
  ordinary_violation: '普通违规',
}
const base = computed(() =>
  items.value
    .filter((item) => item.kind === kind.value)
    .reduce<number | undefined>((latest, item) => Math.max(latest ?? 0, item.version), undefined),
)
function status(value: string) {
  return (
    ({ draft: '草稿', published: '已发布', archived: '已归档' } as Record<string, string>)[value] ??
    '未知状态（只读）'
  )
}
function clear() {
  generation++
  items.value = []
  busy.value = false
  writing.value = false
  loaded.value = false
  error.value = ''
  notice.value = ''
  text.value = ''
  confirmation.value = null
  attempt = null
}
async function load() {
  workspace.cancel()
  clear()
  busy.value = true
  await workspace.run(
    async (signal) => {
      const all: Wordlist[] = []
      const cursors = new Set<string>()
      let cursor: string | null = null
      do {
        const page = await client.list(cursor, signal)
        all.push(...page.items)
        cursor = page.next_cursor
        if (cursor) {
          if (cursors.has(cursor)) throw new Error('词库分页游标重复')
          cursors.add(cursor)
        }
      } while (cursor)
      return all
    },
    (value) => {
      items.value = value
      loaded.value = true
    },
    (cause) => {
      error.value = reviewErrorMessage(cause)
    },
    () => {
      busy.value = false
    },
  )
}
function prepare() {
  if (!loaded.value || busy.value || writing.value) return
  const entries = text.value
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
  confirmation.value = {
    kind: kind.value,
    entries,
    ...(base.value === undefined ? {} : { expected_version: base.value }),
  }
}
function publish(item: Wordlist) {
  if (writing.value || busy.value || !loaded.value || item.status !== 'draft') return
  confirmation.value = { ...item }
}
async function submit() {
  const current = confirmation.value
  if (!current || writing.value || busy.value || !loaded.value) return
  const fingerprint = JSON.stringify(current)
  if (attempt?.fingerprint !== fingerprint)
    attempt = { fingerprint, key: globalThis.crypto.randomUUID() }
  const key = attempt.key
  writing.value = true
  error.value = ''
  await workspace.run(
    (signal) =>
      'entries' in current
        ? client.create(current, key, signal)
        : client.publish(current.id, current.version, key, signal),
    async (value) => {
      const expected = generation + 1
      await load()
      if (generation === expected && workspace.allowed())
        notice.value = `${'entries' in current ? '合成草稿已创建，尚未发布' : '合成版本已发布，旧发布项按模拟规则归档'}：${value.id} · 资源版本 ${value.version}；不代表真实扫描生效`
    },
    async (cause) => {
      if (cause instanceof ApiError && (cause.status === 409 || cause.status === 404)) {
        const expected = generation + 1
        await load()
        if (generation === expected && workspace.allowed())
          error.value = loaded.value
            ? '版本或状态已变化，已重读列表；请重新核对，不会自动重提'
            : '版本或状态已变化，重读失败；请刷新核对，不会自动重提'
      } else error.value = reviewErrorMessage(cause)
    },
    () => {
      writing.value = false
    },
  )
}
onMounted(() => {
  if (mockEnabled) void load()
})
</script>
<template>
  <main class="panel workflow">
    <p class="eyebrow">内容治理 / 版本管理</p>
    <h1>词库管理</h1>
    <p v-if="!mockEnabled" role="status">真实词库入口待契约及接口验收后开放。</p>
    <template v-else>
      <p class="banner">合成业务演示 · 离开页面后重置；不代表真实审核、审计或扫描生效。</p>
      <p>
        模拟规则：同分类最高资源版本作为创建基准；完整新版本词条由本次输入提供，未读取原词条。创建仅生成草稿，发布使资源版本递增并归档同分类旧发布项。这些规则尚非真实契约。
      </p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <button :disabled="busy || writing" @click="load">刷新词库</button>
      <p v-if="busy" role="status">正在读取全部合成版本…</p>
      <template v-if="loaded">
        <h2>版本列表</h2>
        <p v-if="!items.length">暂无词库版本</p>
        <ul class="workflow-list">
          <li v-for="item in items" :key="item.id">
            {{ labels[item.kind] }} · {{ item.id }} · 资源版本 {{ item.version }} ·
            {{ status(item.status) }}
            <button
              v-if="item.status === 'draft'"
              :disabled="writing || !!confirmation"
              @click="publish(item)"
            >
              发布 {{ item.id }}
            </button>
          </li>
        </ul>
        <form @submit.prevent="prepare">
          <fieldset :disabled="writing || !!confirmation">
            <legend>创建合成完整版本</legend>
            <label for="wordlist-kind">分类</label>
            <select id="wordlist-kind" v-model="kind">
              <option v-for="value in wordlistKinds" :key="value" :value="value">
                {{ labels[value] }}
              </option>
            </select>
            <p>模拟创建基准：{{ base ?? '新分类，无前置版本' }}</p>
            <label for="wordlist-entries">完整词条，每行一条；空输入表示空版本</label>
            <textarea id="wordlist-entries" v-model="text" rows="5"></textarea>
            <button type="submit">核对草稿</button>
          </fieldset>
        </form>
        <section v-if="confirmation" class="workflow-box" aria-label="词库操作确认">
          <h2>{{ 'entries' in confirmation ? '确认创建草稿' : '确认发布版本' }}</h2>
          <p>{{ labels[confirmation.kind] }}</p>
          <template v-if="'entries' in confirmation">
            <p>
              模拟基准：{{ confirmation.expected_version ?? '无' }}；完整词条
              {{ confirmation.entries.length }} 条
            </p>
            <ul>
              <li v-for="(entry, index) in confirmation.entries" :key="index">{{ entry }}</li>
            </ul>
            <p>创建后尚未发布，不改变合成当前发布项。</p>
          </template>
          <p v-else>
            {{ confirmation.id }} · 资源版本
            {{ confirmation.version }}；确认后按模拟规则归档旧发布项，不证明真实扫描生效。
          </p>
          <button :disabled="writing" @click="submit">
            {{ writing ? '正在提交…' : '确认提交' }}
          </button>
          <button :disabled="writing" @click="confirmation = null">返回修改</button>
        </section>
      </template>
    </template>
  </main>
</template>
