<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ApiError } from '@/services/admin'
import { createWordlistTransport } from '@/services/content-transport'
import { useAdminStore } from '@/stores/admin'
import { reviewErrorMessage, useAdminWorkspace } from '@/composables/useAdminWorkspace'
import { wordlistKinds } from '@/types/wordlists'
import type {
  Wordlist,
  WordlistInput,
  WordlistKind,
  WordlistHead,
  WordlistDetail,
  WordlistPublish,
} from '@/types/wordlists'

const items = ref<Wordlist[]>([])
const heads = ref<WordlistHead[]>([])
const detail = ref<WordlistDetail | null>(null)
const detailBusy = ref(false)
const busy = ref(false)
const writing = ref(false)
const loaded = ref(false)
const error = ref('')
const notice = ref('')
const kind = ref<WordlistKind>('school')
const text = ref('')
const confirmation = ref<WordlistInput | { item: Wordlist; input: WordlistPublish } | null>(null)
let generation = 0
let attempt: { fingerprint: string; key: string } | null = null
const workspace = useAdminWorkspace(clear)
const client = createWordlistTransport(useAdminStore().session?.token ?? '', workspace.allowed)
const labels: Record<WordlistKind, string> = {
  crisis: '危机',
  school: '涉校',
  ordinary_violation: '普通违规',
}
const base = computed(() => heads.value.find((head) => head.kind === kind.value))
function status(value: string) {
  return (
    ({ draft: '草稿', published: '已发布', archived: '已归档' } as Record<string, string>)[value] ??
    '未知状态（只读）'
  )
}
function clear() {
  generation++
  items.value = []
  heads.value = []
  detail.value = null
  detailBusy.value = false
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
      let snapshot: WordlistHead[] | null = null
      let cursor: string | null = null
      do {
        const page = await client.list(cursor, signal)
        const ordered = wordlistKinds.map((kind) => page.heads.find((head) => head.kind === kind))
        if (snapshot && JSON.stringify(snapshot) !== JSON.stringify(ordered))
          throw new Error('词库分页基准已变化，请刷新')
        if (ordered.some((head) => !head)) throw new Error('词库基准缺失')
        snapshot = page.heads
          .slice()
          .sort(
            (left, right) => wordlistKinds.indexOf(left.kind) - wordlistKinds.indexOf(right.kind),
          )
        all.push(...page.items)
        cursor = page.next_cursor
        if (cursor) {
          if (cursors.has(cursor)) throw new Error('词库分页游标重复')
          cursors.add(cursor)
        }
      } while (cursor)
      return { items: all, heads: snapshot ?? [] }
    },
    (value) => {
      items.value = value.items
      heads.value = value.heads
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
  if (!loaded.value || busy.value || writing.value || !base.value) return
  const entries = text.value
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
  confirmation.value = {
    kind: kind.value,
    entries,
    expected_version: base.value.version,
  }
}
function publish(item: Wordlist) {
  if (writing.value || busy.value || !loaded.value || item.status !== 'draft') return
  const head = heads.value.find((head) => head.kind === item.kind)
  if (!head || item.base_effective_id !== head.effective_id) return
  confirmation.value = {
    item: { ...item },
    input: { expected_version: item.version, expected_head_version: head.version },
  }
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
        : client.publish(current.item.id, current.input, key, signal),
    async (value) => {
      const expected = generation + 1
      await load()
      if (generation === expected && workspace.allowed())
        notice.value = `${'entries' in current ? '草稿已创建，尚未发布' : '版本已发布，旧生效版已归档'}：${value.id} · 资源版本 ${value.version}；已有审核任务继续使用原词库快照`
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
async function openDetail(id: string) {
  if (busy.value || writing.value) return
  workspace.cancel()
  detail.value = null
  detailBusy.value = true
  error.value = ''
  await workspace.run(
    (signal) => client.detail(id, signal),
    (value) => {
      if (value.id !== id) throw new Error('词库详情响应不匹配')
      detail.value = value
    },
    (cause) => {
      error.value = reviewErrorMessage(cause)
    },
    () => {
      detailBusy.value = false
    },
  )
}
function closeDetail() {
  if (writing.value) return
  workspace.cancel()
  detail.value = null
  detailBusy.value = false
}
function canPublish(item: Wordlist) {
  return (
    item.status === 'draft' &&
    heads.value.some(
      (head) => head.kind === item.kind && head.effective_id === item.base_effective_id,
    )
  )
}
onMounted(() => {
  void load()
})
</script>
<template>
  <main class="panel workflow">
    <p class="eyebrow">内容治理 / 版本管理</p>
    <h1>词库管理</h1>
    <template v-if="workspace.allowed()">
      <p class="banner">发布将切换当前生效词库，提交前请核对分类和完整词条。</p>
      <p>
        创建使用分类基准，首次也须读取；词条为完整不可变快照。发布核对草稿资源版本、分类基准和创建时生效版，替代版本授权只读，不可直接重发。仅用于后续新扫描及正常重提，不自动全量重扫历史。
      </p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <button :disabled="busy || writing" @click="load">刷新词库</button>
      <p v-if="busy" role="status">正在读取词库版本…</p>
      <template v-if="loaded">
        <h2>分类基准与当前生效版</h2>
        <ul aria-label="词库基准">
          <li v-for="head in heads" :key="head.kind">
            {{ labels[head.kind] }} · 分类基准 {{ head.version }} · 生效版
            {{ head.effective_id ?? '无' }}
          </li>
        </ul>
        <h2>版本列表</h2>
        <p v-if="!items.length">暂无词库版本</p>
        <ul class="workflow-list">
          <li v-for="item in items" :key="item.id">
            {{ labels[item.kind] }} · {{ item.id }} · 资源版本 {{ item.version }} ·
            {{ status(item.status) }} · 创建时生效版 {{ item.base_effective_id ?? '无' }}
            <button :disabled="writing || !!confirmation" @click="openDetail(item.id)">
              查看 {{ item.id }}
            </button>
            <p v-if="item.status === 'draft' && !canPublish(item)">
              创建基准已被替代，请基于当前生效版创建新快照。
            </p>
            <button
              v-if="canPublish(item)"
              :disabled="writing || !!confirmation"
              @click="publish(item)"
            >
              发布 {{ item.id }}
            </button>
          </li>
        </ul>
        <form @submit.prevent="prepare">
          <fieldset :disabled="writing || !!confirmation">
            <legend>创建完整版本</legend>
            <label for="wordlist-kind">分类</label>
            <select id="wordlist-kind" v-model="kind">
              <option v-for="value in wordlistKinds" :key="value" :value="value">
                {{ labels[value] }}
              </option>
            </select>
            <p>
              分类创建基准：{{ base?.version ?? '未读取' }} · 当前生效版
              {{ base?.effective_id ?? '无' }}
            </p>
            <label for="wordlist-entries">完整词条，每行一条；空输入表示空版本</label>
            <textarea id="wordlist-entries" v-model="text" rows="5"></textarea>
            <button type="submit">核对草稿</button>
          </fieldset>
        </form>
        <section v-if="confirmation" class="workflow-box" aria-label="词库操作确认">
          <h2>{{ 'entries' in confirmation ? '确认创建草稿' : '确认发布版本' }}</h2>
          <p>
            {{ labels['entries' in confirmation ? confirmation.kind : confirmation.item.kind] }}
          </p>
          <template v-if="'entries' in confirmation">
            <p>
              分类基准：{{ confirmation.expected_version }}；完整词条
              {{ confirmation.entries.length }} 条
            </p>
            <ul>
              <li v-for="(entry, index) in confirmation.entries" :key="index">{{ entry }}</li>
            </ul>
            <p>创建后尚未发布，不改变当前生效版本。</p>
          </template>
          <p v-else>
            {{ confirmation.item.id }} · 草稿资源版本 {{ confirmation.input.expected_version }} ·
            分类基准 {{ confirmation.input.expected_head_version }} · 创建时生效版
            {{
              confirmation.item.base_effective_id ?? '无'
            }}；发布后归档旧生效版，不自动全量重扫历史。
          </p>
          <button :disabled="writing" @click="submit">
            {{ writing ? '正在提交…' : '确认提交' }}
          </button>
          <button :disabled="writing" @click="confirmation = null">返回修改</button>
        </section>
        <p v-if="detailBusy" role="status">正在读取完整词条…</p>
        <section v-if="detail" class="workflow-box" aria-label="词库只读详情">
          <h2>完整快照（只读）</h2>
          <p>{{ detail.id }} · 资源版本 {{ detail.version }} · {{ status(detail.status) }}</p>
          <p>
            创建时生效版 {{ detail.base_effective_id ?? '无' }}；归档不等于物理删除或无限期保留。
          </p>
          <ul>
            <li v-for="(entry, index) in detail.entries" :key="index">{{ entry }}</li>
          </ul>
          <p v-if="!detail.entries.length">空词条快照</p>
          <button :disabled="writing" @click="closeDetail">关闭详情</button>
        </section>
      </template>
    </template>
  </main>
</template>
