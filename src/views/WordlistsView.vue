<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElDialog } from 'element-plus'
import 'element-plus/theme-chalk/el-dialog.css'
import 'element-plus/theme-chalk/el-overlay.css'
import BusinessToolbar from '@/components/BusinessToolbar.vue'
import { useWordlists } from '@/composables/useWordlists'
import type { WordlistKind } from '@/types/wordlists'

type Entry = { text: string; enabled: boolean }
type Dialog =
  | { mode: 'add' | 'history' }
  | { mode: 'view' | 'edit' | 'delete'; entry: Entry }
  | { mode: 'discard'; action: () => Promise<void> }

const {
  busy,
  writing,
  error,
  notice,
  workspace,
  labels,
  load,
  items,
  heads,
  detail,
  detailBusy,
  loaded,
  resultId,
  kind,
  status,
  confirmation,
  publish,
  submit,
  canPublish,
  openDetail,
  base,
} = useWordlists(undefined, false)

const dialog = ref<Dialog | null>(null)
const staged = ref<{ entries: Entry[]; headVersion: number; stale: boolean } | null>(null)
const keyword = ref('')
const editorText = ref('')
const editorError = ref('')
const selectedId = ref<string | null>(null)
const locked = computed(() => busy.value || writing.value)
const rows = computed<Entry[]>(() => {
  if (staged.value) return staged.value.entries
  const disabled = new Set(detail.value?.disabled_entries)
  return detail.value?.entries.map((text) => ({ text, enabled: !disabled.has(text) })) ?? []
})
const visibleRows = computed(() => {
  const query = keyword.value.trim().toLocaleLowerCase()
  return rows.value.filter((entry) => entry.text.toLocaleLowerCase().includes(query))
})
const history = computed(() => items.value.filter((item) => item.kind === kind.value))
const conflicted = computed(
  () =>
    staged.value !== null &&
    (staged.value.stale || staged.value.headVersion !== base.value?.version),
)
const editable = computed(() => {
  if (!loaded.value || locked.value || detailBusy.value || !base.value || conflicted.value)
    return false
  if (staged.value) return true
  if (!detail.value) return base.value.effective_id === null && selectedId.value === null
  return detail.value.id === base.value.effective_id || canPublish(detail.value)
})
const dialogTitle = computed(() => {
  if (confirmation.value) return 'entries' in confirmation.value ? '保存词库草稿' : '发布词库草稿'
  if (!dialog.value) return ''
  return {
    add: '新增词条',
    edit: '编辑词条',
    view: '词条详情',
    delete: '删除词条',
    history: '词库版本',
    discard: '放弃未保存修改',
  }[dialog.value.mode]
})
function clearEditor() {
  dialog.value = null
  staged.value = null
  editorText.value = ''
  editorError.value = ''
  keyword.value = ''
  selectedId.value = null
}
watch(
  workspace.allowed,
  (allowed) => {
    if (!allowed) clearEditor()
  },
  { flush: 'sync' },
)

async function readVersion(id: string | null) {
  selectedId.value = id
  await openDetail(id)
}
async function refresh() {
  clearEditor()
  await load()
  if (loaded.value) await readVersion(base.value?.effective_id ?? null)
}
async function changeContext(action: () => Promise<void>) {
  if (locked.value) return
  if (staged.value) {
    dialog.value = { mode: 'discard', action }
    return
  }
  dialog.value = null
  await action()
}
async function discard() {
  if (dialog.value?.mode !== 'discard') return
  const { action } = dialog.value
  clearEditor()
  await action()
}
async function choose(next: WordlistKind) {
  if (next === kind.value) return
  await changeContext(async () => {
    kind.value = next
    keyword.value = ''
    await readVersion(base.value?.effective_id ?? null)
  })
}
function openEditor(entry?: Entry) {
  editorText.value = entry?.text ?? ''
  editorError.value = ''
  dialog.value = entry ? { mode: 'edit', entry } : { mode: 'add' }
}
function stage(entries: Entry[]) {
  if (!editable.value || !base.value) return
  staged.value = {
    entries,
    headVersion: staged.value?.headVersion ?? base.value.version,
    stale: false,
  }
}
function applyEditor() {
  const current = dialog.value
  if (!current || (current.mode !== 'add' && current.mode !== 'edit') || !editable.value) return
  const text = editorText.value.trim()
  const previous = current.mode === 'edit' ? current.entry : null
  if (!text || [...text].length > 1000) {
    editorError.value = '请输入 1 至 1000 个字符'
    return
  }
  if (text !== previous?.text && rows.value.some((entry) => entry.text === text)) {
    editorError.value = '词条已存在'
    return
  }
  if (previous)
    stage(rows.value.map((entry) => (entry.text === previous.text ? { ...entry, text } : entry)))
  else stage([...rows.value, { text, enabled: true }])
  closeDialog()
}
function deleteEntry(entry: Entry) {
  stage(rows.value.filter((item) => item.text !== entry.text))
  closeDialog()
}
function toggle(entry: Entry) {
  stage(
    rows.value.map((item) =>
      item.text === entry.text ? { ...item, enabled: !item.enabled } : item,
    ),
  )
}
function prepareSave() {
  const changes = staged.value
  if (!editable.value || !changes) return
  confirmation.value = {
    kind: kind.value,
    entries: changes.entries.map((entry) => entry.text),
    disabled_entries: changes.entries.filter((entry) => !entry.enabled).map((entry) => entry.text),
    expected_version: changes.headVersion,
  }
}
function closeDialog() {
  if (writing.value) return
  dialog.value = null
  confirmation.value = null
  editorText.value = ''
  editorError.value = ''
}
async function confirmWrite() {
  if (!confirmation.value || locked.value) return
  await submit()
  if (!workspace.allowed()) return
  if (resultId.value && notice.value) {
    staged.value = null
    if (loaded.value) await readVersion(resultId.value)
  } else if (!confirmation.value) {
    // 冲突后保留待编辑词条，并禁止基于原快照再次提交。
    if (staged.value) staged.value.stale = true
    if (loaded.value) {
      const conflict = error.value
      await readVersion(base.value?.effective_id ?? null)
      if (!error.value) error.value = conflict
    }
  }
}
onMounted(() => {
  void refresh()
})
</script>

<template>
  <main class="panel workflow" aria-label="词库管理">
    <template v-if="workspace.allowed()">
      <p>词条修改保存为草稿，发布后用于新扫描和正常重提。</p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="busy" role="status">正在读取词库版本…</p>
      <div class="workflow-grid wordlist-grid">
        <section class="business-card" aria-labelledby="wordlist-choices">
          <h2 id="wordlist-choices">选择词库</h2>
          <div class="business-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">词库</th>
                  <th scope="col">生效状态</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="head in heads"
                  :key="head.kind"
                  :class="{ 'is-current': kind === head.kind }"
                >
                  <th scope="row">
                    <button
                      type="button"
                      :aria-pressed="kind === head.kind"
                      :disabled="locked"
                      @click="choose(head.kind)"
                    >
                      {{ labels[head.kind] }}
                    </button>
                  </th>
                  <td>{{ head.effective_id ? '有生效版本' : '尚未发布' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <section class="business-card" aria-labelledby="wordlist-detail" :aria-busy="detailBusy">
          <h2 id="wordlist-detail">{{ labels[kind] }}词库详情</h2>
          <p v-if="detail">{{ status(detail.status) }} · 资源版本 {{ detail.version }}</p>
          <p v-if="detailBusy" role="status">正在读取词条…</p>
          <p v-if="staged">有未保存的词条修改。</p>
          <p v-if="conflicted" role="alert">
            词库基准已变化，请查看当前词库并核对保留的修改。刷新后可基于最新版本重新编辑。
          </p>
          <details v-if="conflicted && detail">
            <summary>对照当前生效词条</summary>
            <ul>
              <li v-for="entry in detail.entries" :key="entry">
                {{ entry }} · {{ detail.disabled_entries?.includes(entry) ? '停用' : '启用' }}
              </li>
            </ul>
            <p v-if="!detail.entries.length">当前生效版为空。</p>
          </details>
          <div class="business-filters">
            <label
              >搜索词条 <input v-model="keyword" type="search" placeholder="输入词条关键词"
            /></label>
          </div>
          <BusinessToolbar label="词条操作栏">
            <button
              class="business-primary"
              type="button"
              :disabled="!editable"
              @click="openEditor()"
            >
              新增词条
            </button>
            <button v-if="staged" type="button" :disabled="!editable" @click="prepareSave">
              保存草稿
            </button>
            <button
              v-if="detail && canPublish(detail)"
              class="business-primary"
              type="button"
              :disabled="locked || !!staged"
              @click="publish(detail)"
            >
              发布草稿
            </button>
            <template #tools>
              <button type="button" :disabled="locked" @click="changeContext(refresh)">
                刷新词库
              </button>
              <button
                type="button"
                :disabled="locked || !loaded"
                @click="dialog = { mode: 'history' }"
              >
                版本记录
              </button>
            </template>
          </BusinessToolbar>
          <p v-if="loaded && !detailBusy && !visibleRows.length && !error">暂无匹配词条</p>
          <div class="business-table">
            <table>
              <caption>
                词条明细
              </caption>
              <thead>
                <tr>
                  <th scope="col">词条</th>
                  <th scope="col">状态</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="entry in visibleRows" :key="entry.text">
                  <th scope="row">{{ entry.text }}</th>
                  <td>
                    <div class="wordlist-state">
                      <button
                        class="wordlist-switch"
                        type="button"
                        role="switch"
                        :aria-label="`启用词条 ${entry.text}`"
                        :aria-checked="entry.enabled"
                        :disabled="!editable"
                        @click="toggle(entry)"
                      ></button>
                      <span>{{ entry.enabled ? '启用' : '停用' }}</span>
                    </div>
                  </td>
                  <td>
                    <div class="business-row-actions">
                      <button
                        type="button"
                        :disabled="locked"
                        @click="dialog = { mode: 'view', entry }"
                      >
                        查看
                      </button>
                      <button type="button" :disabled="!editable" @click="openEditor(entry)">
                        编辑
                      </button>
                      <button
                        type="button"
                        :disabled="!editable"
                        class="business-danger"
                        @click="dialog = { mode: 'delete', entry }"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <ElDialog
        :model-value="!!dialog || !!confirmation"
        :title="dialogTitle"
        class="business-dialog"
        width="min(42rem, calc(100vw - 2rem))"
        top="2rem"
        :close-on-click-modal="false"
        :close-on-press-escape="!writing"
        :show-close="!writing"
        @update:model-value="
          (open) => {
            if (!open) closeDialog()
          }
        "
      >
        <template v-if="confirmation">
          <p v-if="error" role="alert">{{ error }}</p>
          <p v-if="'entries' in confirmation">
            共 {{ confirmation.entries.length }} 条词条，{{
              confirmation.disabled_entries?.length ?? 0
            }}
            条停用。保存草稿后可另行发布。
          </p>
          <p v-else>发布将替换{{ labels[kind] }}词库的生效版本，已有审核任务继续使用原词库快照。</p>
        </template>
        <form
          v-else-if="dialog?.mode === 'add' || dialog?.mode === 'edit'"
          id="wordlist-entry-form"
          @submit.prevent="applyEditor"
        >
          <label for="wordlist-entry-text">词条文本</label>
          <input id="wordlist-entry-text" v-model="editorText" required autocomplete="off" />
          <p v-if="editorError" role="alert">{{ editorError }}</p>
        </form>
        <template v-else-if="dialog?.mode === 'delete'">
          <p>从待发布版本删除「{{ dialog.entry.text }}」？</p>
        </template>
        <dl v-else-if="dialog?.mode === 'view'">
          <dt>词条</dt>
          <dd>{{ dialog.entry.text }}</dd>
          <dt>状态</dt>
          <dd>{{ dialog.entry.enabled ? '启用' : '停用' }}</dd>
        </dl>
        <template v-else-if="dialog?.mode === 'history'">
          <button
            type="button"
            @click="changeContext(() => readVersion(base?.effective_id ?? null))"
          >
            查看当前生效版
          </button>
          <p v-if="!history.length">暂无历史版本</p>
          <div v-else class="business-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">状态</th>
                  <th scope="col">资源版本</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in history" :key="item.id">
                  <td>{{ status(item.status) }} · 记录 {{ index + 1 }}</td>
                  <td>{{ item.version }}</td>
                  <td>
                    <button type="button" @click="changeContext(() => readVersion(item.id))">
                      查看版本
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
        <template v-else-if="dialog?.mode === 'discard'">
          <p>继续操作将放弃尚未保存的词条修改。</p>
        </template>
        <template #footer>
          <div class="business-dialog-actions">
            <button type="button" :disabled="writing" @click="closeDialog">关闭</button>
            <button
              v-if="confirmation"
              class="business-primary"
              type="button"
              :disabled="writing"
              @click="confirmWrite"
            >
              {{ writing ? '正在提交…' : '确认提交' }}
            </button>
            <button
              v-else-if="dialog?.mode === 'add' || dialog?.mode === 'edit'"
              class="business-primary"
              type="submit"
              form="wordlist-entry-form"
            >
              确认词条
            </button>
            <button
              v-else-if="dialog?.mode === 'delete'"
              class="business-danger"
              type="button"
              @click="deleteEntry(dialog.entry)"
            >
              确认删除
            </button>
            <button
              v-else-if="dialog?.mode === 'discard'"
              class="business-primary"
              type="button"
              @click="discard"
            >
              放弃并继续
            </button>
          </div>
        </template>
      </ElDialog>
    </template>
  </main>
</template>

<style scoped>
.wordlist-grid {
  grid-template-columns: minmax(12rem, 4fr) minmax(0, 7fr);
  align-items: start;
}
.wordlist-grid th button[aria-pressed] {
  padding: 0;
  background: transparent;
  border-color: transparent;
  color: inherit;
}
.wordlist-grid .is-current {
  background: var(--selected-surface);
  color: var(--accent-color);
}
.wordlist-state {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
button.wordlist-switch[role='switch'] {
  position: relative;
  width: 34px;
  height: 20px;
  min-height: 20px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 20px;
  background: var(--text-secondary);
}
button.wordlist-switch[aria-checked='true'] {
  background: var(--accent-color);
}
.wordlist-switch::before {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  content: '';
}
.wordlist-switch[aria-checked='true']::before {
  left: 16px;
}
@media (max-width: 1000px) {
  .wordlist-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
