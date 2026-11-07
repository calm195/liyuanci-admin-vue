<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { reviewErrorMessage, useAdminWorkspace } from '@/composables/useAdminWorkspace'
import { createWordlistTransport } from '@/services/content-transport'
import { useAdminStore } from '@/stores/admin'
import type {
  BuiltinDraftInput,
  BuiltinEntries,
  BuiltinEntry,
  MatchDisposition,
} from '@/types/wordlists'
import { builtinWordlistLabel } from '@/utils/builtin-wordlist-label'

const props = defineProps<{ id: string; headVersion?: number | undefined; locked: boolean }>()
const emit = defineEmits<{ save: [draft: BuiltinDraftInput] }>()
type EntryOverride = BuiltinDraftInput['overrides'][number]
const pageSize = 50
const page = ref<BuiltinEntries | null>(null)
const filters = ref({ q: '', label: '', disposition: '', enabled: '' })
const applied = ref({ ...filters.value })
const offset = ref(0)
const loading = ref(false)
const error = ref('')
const entries = ref(new Map<string, EntryOverride>())
const selected = ref(new Map<string, BuiltinEntry>())
const selecting = ref(false)
const bulkAction = ref('')
const changeCount = computed(() => entries.value.size)
const allSelected = computed(() => !!page.value?.total && selected.value.size === page.value.total)
const canEdit = computed(
  () => props.headVersion !== undefined && !props.locked && !loading.value && !selecting.value,
)
const workspace = useAdminWorkspace(() => {
  page.value = null
  entries.value.clear()
  selected.value.clear()
  selecting.value = false
  bulkAction.value = ''
  filters.value = { q: '', label: '', disposition: '', enabled: '' }
  loading.value = false
  error.value = ''
})
const client = createWordlistTransport(useAdminStore().session?.token ?? '', workspace.allowed)

function entryQuery(start: number, limit: number, currentFilters: typeof applied.value) {
  const query = new URLSearchParams({ offset: String(start), limit: String(limit) })
  for (const [key, value] of Object.entries(currentFilters)) {
    if (value.trim()) query.set(key, value.trim())
  }
  return query
}

async function load(start: number, search = false) {
  if (loading.value || selecting.value || props.locked) return
  const nextFilters = search ? { ...filters.value } : applied.value
  const query = entryQuery(start, pageSize, nextFilters)
  loading.value = true
  error.value = ''
  await workspace.run(
    (signal) => client.builtinEntries(props.id, query, signal),
    (value) => {
      if (search) selected.value.clear()
      applied.value = nextFilters
      offset.value = start
      page.value = value
    },
    (cause) => {
      error.value = reviewErrorMessage(cause)
    },
    () => {
      loading.value = false
    },
  )
}
function setEnabled(entry: BuiltinEntry) {
  stageEntry(entry, { enabled: !(entries.value.get(entry.id)?.enabled ?? entry.enabled) })
}
function setDisposition(entry: BuiltinEntry, event: Event) {
  if (!(event.target instanceof HTMLSelectElement)) return
  const disposition = event.target.value
  if (disposition === 'hint' || disposition === 'review') stageEntry(entry, { disposition })
}
function stageEntry(
  entry: BuiltinEntry,
  settings: { enabled?: boolean; disposition?: MatchDisposition },
) {
  if (!canEdit.value) return
  const next = { id: entry.id, ...entries.value.get(entry.id), ...settings }
  if (next.enabled === entry.enabled) delete next.enabled
  if (next.disposition === entry.disposition) delete next.disposition
  if (next.enabled === undefined && next.disposition === undefined) entries.value.delete(entry.id)
  else entries.value.set(entry.id, next)
}
function toggleEntry(entry: BuiltinEntry) {
  if (!canEdit.value) return
  if (!selected.value.delete(entry.id)) selected.value.set(entry.id, entry)
}

async function toggleAll() {
  if (!canEdit.value || !page.value?.total) return
  if (allSelected.value) {
    selected.value.clear()
    return
  }
  const total = page.value.total
  if (page.value.items.length === total) {
    selected.value = new Map(page.value.items.map((entry) => [entry.id, entry]))
    return
  }
  selecting.value = true
  error.value = ''
  await workspace.run(
    async (signal) => {
      const result = await client.builtinEntries(
        props.id,
        entryQuery(0, total, applied.value),
        signal,
      )
      const selection = new Map(result.items.map((entry) => [entry.id, entry]))
      if (result.total !== total || selection.size !== total)
        throw new Error('筛选结果已变化，请重新查询')
      return selection
    },
    (selection) => {
      selected.value = selection
    },
    (cause) => {
      error.value = reviewErrorMessage(cause)
    },
    () => {
      selecting.value = false
    },
  )
}

function applyBulk() {
  if (!canEdit.value) return
  const action = bulkAction.value
  if (!action) return
  const settings: Omit<EntryOverride, 'id'> =
    action === 'hint' || action === 'review'
      ? { disposition: action }
      : { enabled: action === 'enable' }
  for (const entry of selected.value.values()) stageEntry(entry, settings)
  selected.value.clear()
  bulkAction.value = ''
}

function discardChanges() {
  entries.value.clear()
}
function save() {
  if (!canEdit.value || props.headVersion === undefined || !changeCount.value) return
  emit('save', {
    expected_version: props.headVersion,
    overrides: Array.from(entries.value.values()),
  })
}
onBeforeRouteLeave(() => !changeCount.value || globalThis.confirm('放弃尚未保存的内置词库调整？'))
onMounted(() => void load(0))
</script>

<template>
  <section aria-label="内置词条" :aria-busy="loading || selecting">
    <p v-if="page">上游版本 {{ page.upstream_version }} · 当前筛选 {{ page.total }} 条</p>
    <form @submit.prevent="load(0, true)">
      <fieldset class="business-filters" :disabled="loading || selecting || locked">
        <legend>筛选内置词条</legend>
        <label>关键词 <input v-model="filters.q" type="search" maxlength="255" /></label>
        <label>
          标签
          <select v-model="filters.label">
            <option value="">全部</option>
            <option v-for="label in page?.labels ?? []" :key="label" :value="label">
              {{ builtinWordlistLabel(label) }}
            </option>
          </select>
        </label>
        <label>
          状态
          <select v-model="filters.enabled">
            <option value="">全部</option>
            <option value="true">启用</option>
            <option value="false">停用</option>
          </select>
        </label>
        <label>
          处置
          <select v-model="filters.disposition">
            <option value="">全部</option>
            <option value="review">进入复核</option>
            <option value="hint">仅提示</option>
          </select>
        </label>
        <button type="submit">应用筛选</button>
        <div v-if="headVersion !== undefined" class="business-toolbar-tools business-row-actions">
          <span role="status">已选 {{ selected.size }} 条</span>
          <select
            v-model="bulkAction"
            aria-label="批量调整方式"
            :disabled="!canEdit || !selected.size"
          >
            <option value="">选择调整方式</option>
            <option value="enable">启用</option>
            <option value="disable">停用</option>
            <option value="review">进入复核</option>
            <option value="hint">仅提示</option>
          </select>
          <button
            type="button"
            :disabled="!canEdit || !selected.size || !bulkAction"
            @click="applyBulk"
          >
            批量调整
          </button>
        </div>
      </fieldset>
    </form>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">正在读取内置词条…</p>
    <p v-if="selecting" role="status">正在全选当前筛选结果…</p>
    <template v-if="page">
      <p v-if="changeCount" role="status">
        待保存 {{ changeCount }} 条词条调整。
        <button type="button" :disabled="!canEdit" @click="save">保存内置词库草稿</button>
        <button type="button" :disabled="!canEdit" @click="discardChanges">清除未保存调整</button>
      </p>
      <p v-if="!page.items.length">暂无匹配词条</p>
      <div v-else class="business-table">
        <table>
          <thead>
            <tr>
              <th v-if="headVersion !== undefined" scope="col">
                <input
                  type="checkbox"
                  aria-label="全选当前筛选结果（含所有分页）"
                  :checked="allSelected"
                  :indeterminate.prop="selected.size > 0 && !allSelected"
                  :disabled="!canEdit"
                  @change="toggleAll"
                />
              </th>
              <th scope="col">词条</th>
              <th scope="col">标签</th>
              <th scope="col">状态</th>
              <th scope="col">处置</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in page.items" :key="entry.id">
              <td v-if="headVersion !== undefined">
                <input
                  type="checkbox"
                  :aria-label="`选择词条 ${entry.word}（${builtinWordlistLabel(entry.label)}）`"
                  :checked="selected.has(entry.id)"
                  :disabled="!canEdit"
                  @change="toggleEntry(entry)"
                />
              </td>
              <th scope="row">{{ entry.word }}</th>
              <td>{{ builtinWordlistLabel(entry.label) }}</td>
              <td>
                <button
                  v-if="headVersion !== undefined"
                  type="button"
                  role="switch"
                  :aria-label="`启用词条 ${entry.word}`"
                  :aria-checked="entries.get(entry.id)?.enabled ?? entry.enabled"
                  :disabled="!canEdit"
                  @click="setEnabled(entry)"
                >
                  {{ (entries.get(entry.id)?.enabled ?? entry.enabled) ? '启用' : '停用' }}
                </button>
                <span v-else>{{ entry.enabled ? '启用' : '停用' }}</span>
              </td>
              <td>
                <select
                  v-if="headVersion !== undefined"
                  :aria-label="`${entry.word}的处置`"
                  :value="entries.get(entry.id)?.disposition ?? entry.disposition"
                  :disabled="!canEdit"
                  @change="setDisposition(entry, $event)"
                >
                  <option value="review">进入复核</option>
                  <option value="hint">仅提示</option>
                </select>
                <span v-else>{{ entry.disposition === 'review' ? '进入复核' : '仅提示' }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <nav v-if="page.total > pageSize" aria-label="内置词条分页">
        <button
          type="button"
          :disabled="!offset || loading || selecting || locked"
          @click="load(offset - pageSize)"
        >
          上一页
        </button>
        <span> 第 {{ offset / pageSize + 1 }} 页 / {{ Math.ceil(page.total / pageSize) }} 页 </span>
        <button
          type="button"
          :disabled="offset + pageSize >= page.total || loading || selecting || locked"
          @click="load(offset + pageSize)"
        >
          下一页
        </button>
      </nav>
    </template>
  </section>
</template>
