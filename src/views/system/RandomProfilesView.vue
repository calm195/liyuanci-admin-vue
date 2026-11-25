<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { onBeforeRouteLeave } from 'vue-router'
import FloatingNotice from '@/components/FloatingNotice.vue'
import LocalPagination from '@/components/LocalPagination.vue'
import WorkspaceDrawer from '@/components/WorkspaceDrawer.vue'
import WorkspaceHeading from '@/components/WorkspaceHeading.vue'
import { confirmDiscardChanges } from '@/components/confirmDiscardChanges'
import { useAdminWorkspace, reviewErrorMessage } from '@/composables/useAdminWorkspace'
import { useLocalPagination } from '@/composables/useLocalPagination'
import { useOperationFeedback } from '@/composables/useOperationFeedback'
import { ApiError } from '@/services/admin'
import {
  drawRandomProfile,
  maxRandomAvatarBytes,
  maxRandomAvatarNameLength,
  maxRandomNicknameLength,
  maxRandomWordLength,
  readRandomProfiles,
  RandomProfileError,
  submitRandomProfile,
} from '@/services/random-profiles'
import { useAdminStore } from '@/stores/admin'
import { displayBeijingTime } from '@/utils/admin-time'
import type {
  RandomAvatar,
  RandomPool,
  RandomProfileCommand,
  RandomProfileDraw,
  RandomProfileSnapshot,
  RandomWord,
} from '@/types/random-profiles'

type AvatarRow = RandomAvatar & { pool: 'avatars' }
type WordRow = RandomWord & { pool: 'adjectives' | 'nouns' }
type Row = AvatarRow | WordRow
type Editor =
  | { mode: 'create'; pool: RandomPool; label: string; file: File | null }
  | { mode: 'edit'; row: Row; label: string }
  | { mode: 'replace'; row: AvatarRow; file: File | null }

const pools = [
  { key: 'avatars', label: '头像' },
  { key: 'adjectives', label: '形容词' },
  { key: 'nouns', label: '名词' },
] as const
const admin = useAdminStore()
const snapshot = shallowRef<RandomProfileSnapshot | null>(null)
const pool = ref<RandomPool>('avatars')
const query = ref('')
const status = ref<'all' | 'enabled' | 'disabled'>('all')
const busy = ref(false)
const error = ref('')
const errorRevision = ref(0)
const draft = ref<Editor | null>(null)
const { pendingRandomProfile: attempt } = storeToRefs(admin)
const drawOpen = ref(false)
const drawn = shallowRef<RandomProfileDraw | null>(null)
const previewUrl = ref('')
const workspace = useAdminWorkspace(() => {
  snapshot.value = null
  draft.value = null
  drawOpen.value = false
  drawn.value = null
  busy.value = false
  error.value = ''
}, 'super_admin')
const { feedback, run } = useOperationFeedback(() => !!error.value)

function rowName(row: Row) {
  return row.pool === 'avatars' ? row.name : row.text
}

const rows = computed(() => {
  if (!snapshot.value) return []
  const { avatars, adjectives, nouns } = snapshot.value
  const entries: Row[] =
    pool.value === 'avatars'
      ? avatars.map((item) => ({ ...item, pool: 'avatars' }))
      : pool.value === 'adjectives'
        ? adjectives.map((item) => ({ ...item, pool: 'adjectives' }))
        : nouns.map((item) => ({ ...item, pool: 'nouns' }))
  const term = query.value.trim().toLowerCase()
  return entries.filter(
    (row) =>
      rowName(row).toLowerCase().includes(term) &&
      (status.value === 'all' || row.enabled === (status.value === 'enabled')),
  )
})
const { page, pageSize, pageRows } = useLocalPagination(rows)
const poolLabel = computed(() => pools.find((item) => item.key === pool.value)?.label ?? '资料')
const editorPool = computed(() => {
  const editor = draft.value
  return editor?.mode === 'create' ? editor.pool : editor?.row.pool
})
const editorTitle = computed(() => {
  const editor = draft.value
  if (editor?.mode === 'replace') return '更换头像图片'
  return `${editor?.mode === 'edit' ? '编辑' : '新增'}${poolLabel.value}`
})
const file = computed(() => {
  const editor = draft.value
  return editor && 'file' in editor ? editor.file : null
})
const uploadsImage = computed(
  () =>
    draft.value?.mode === 'replace' ||
    (draft.value?.mode === 'create' && editorPool.value === 'avatars'),
)
const drawerDirty = computed(() => {
  const editor = draft.value
  if (editor?.mode === 'edit') return editor.label !== rowName(editor.row)
  return !!file.value || (editor?.mode === 'create' && !!editor.label)
})
const sampleNickname = computed(() => {
  const editor = draft.value
  const entryPool = editorPool.value
  if (!editor || !('label' in editor) || !entryPool || entryPool === 'avatars') return ''
  const label = editor.label.trim()
  const other = snapshot.value?.[entryPool === 'adjectives' ? 'nouns' : 'adjectives'].find(
    (term) => term.enabled,
  )?.text
  if (!label || !other) return ''
  return entryPool === 'adjectives' ? `${label}的${other}` : `${other}的${label}`
})

watch(file, (selected, _, onCleanup) => {
  if (!selected) {
    previewUrl.value = ''
    return
  }
  const url = URL.createObjectURL(selected)
  previewUrl.value = url
  onCleanup(() => URL.revokeObjectURL(url))
})

function switchPool(value: RandomPool) {
  if (value === pool.value) return
  pool.value = value
  query.value = ''
  status.value = 'all'
  error.value = ''
}

function setError(message: string) {
  error.value = message
  errorRevision.value++
}

function errorMessage(failure: unknown) {
  if (failure instanceof RandomProfileError) {
    switch (failure.code) {
      case 'RANDOM_PROFILE_POOL_EMPTY':
        return '每类至少保留一项启用配置，请先启用另一项。'
      case 'RANDOM_PROFILE_NICKNAME_TOO_LONG':
        return '和当前启用词条拼接后会超过 40 个字符，请缩短词条。'
      case 'RANDOM_PROFILE_DUPLICATE_WORD':
        return '已有相同词条，请编辑现有词条。'
      case 'RANDOM_PROFILE_IMAGE_REJECTED':
        return '图片未通过校验或安全扫描，请更换图片。'
    }
  }
  if (failure instanceof ApiError) {
    if (failure.status === 409) return '配置已变化，请刷新列表并重新编辑。'
    if ([400, 413, 415, 422].includes(failure.status)) return '请核对填写内容和图片格式。'
  }
  return reviewErrorMessage(failure)
}

async function load() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  await workspace.run(
    (signal) => readRandomProfiles(admin.session?.token ?? '', signal),
    (value) => {
      snapshot.value = value
      if (attempt.value) setError('已刷新列表，保存结果尚未确认，请使用原请求重试。')
    },
    (failure) => setError(errorMessage(failure)),
    () => {
      busy.value = false
    },
  )
}

function openEditor(value: Editor) {
  error.value = ''
  draft.value = value
}

function closeEditor() {
  draft.value = null
  error.value = ''
}

function pickImage(event: Event) {
  const editor = draft.value
  if (!editor || !('file' in editor) || !(event.target instanceof HTMLInputElement)) return
  if (busy.value || attempt.value) return
  error.value = ''
  const selected = event.target.files?.[0]
  if (!selected) return
  if (
    !['image/jpeg', 'image/png'].includes(selected.type) ||
    selected.size < 1 ||
    selected.size > maxRandomAvatarBytes
  ) {
    editor.file = null
    setError('请选择不超过 2 MiB 的 JPG 或 PNG 图片。')
    event.target.value = ''
    return
  }
  editor.file = selected
}

function validWord(target: WordRow['pool'], value: string, enabled: boolean, id?: string) {
  const current = snapshot.value
  if (!current) return false
  if (current[target].some((item) => item.id !== id && item.text === value)) {
    setError('已有相同词条，请编辑现有词条。')
    return false
  }
  const other = target === 'nouns' ? current.adjectives : current.nouns
  if (
    enabled &&
    other.some(
      (item) => item.enabled && [...`${value}的${item.text}`].length > maxRandomNicknameLength,
    )
  ) {
    setError('和当前启用词条拼接后会超过 40 个字符，请缩短词条。')
    return false
  }
  return true
}

function changeEntry(row: Row, name: string, enabled: boolean): RandomProfileCommand | null {
  if (row.pool === 'avatars') return { type: 'editAvatar', item: row, name, enabled }
  if (!validWord(row.pool, name, enabled, row.id)) return null
  return { type: 'editWord', pool: row.pool, item: row, text: name, enabled }
}

function editorCommand(editor: Editor): RandomProfileCommand | null {
  if (editor.mode === 'replace') {
    if (editor.file) return { type: 'replaceImage', item: editor.row, file: editor.file }
    setError('请先选择要更换的图片。')
    return null
  }
  const value = editor.label.trim()
  const target = editor.mode === 'create' ? editor.pool : editor.row.pool
  const limit = target === 'avatars' ? maxRandomAvatarNameLength : maxRandomWordLength
  if (!value || [...value].length > limit) {
    setError(`请输入 1 至 ${limit} 个字符。`)
    return null
  }
  if (editor.mode === 'edit') {
    if (value === rowName(editor.row)) {
      closeEditor()
      return null
    }
    return changeEntry(editor.row, value, editor.row.enabled)
  }
  if (target === 'avatars') {
    if (editor.file) return { type: 'createAvatar', name: value, file: editor.file }
    setError('请先选择要上传的图片。')
    return null
  }
  return validWord(target, value, true) ? { type: 'createWord', pool: target, text: value } : null
}

function mergeEntry<T extends RandomAvatar | RandomWord>(items: T[], receipt: T): T[] {
  if (items.some((item) => item.id === receipt.id))
    return items.map((item) =>
      item.id === receipt.id && item.version < receipt.version ? receipt : item,
    )
  return [receipt, ...items]
}

async function save(command?: RandomProfileCommand) {
  if (busy.value) return
  if (!attempt.value) {
    const value = command ?? (draft.value && editorCommand(draft.value))
    if (!value) return
    attempt.value = { key: globalThis.crypto.randomUUID(), command: value }
  }
  const active = attempt.value
  error.value = ''
  busy.value = true
  await run(
    () =>
      workspace.run(
        (signal) =>
          submitRandomProfile(admin.session?.token ?? '', active.command, active.key, signal),
        (receipt) => {
          const current = snapshot.value
          if (current) {
            if ('name' in receipt)
              snapshot.value = { ...current, avatars: mergeEntry(current.avatars, receipt) }
            else if ('pool' in active.command) {
              const target = active.command.pool
              snapshot.value = { ...current, [target]: mergeEntry(current[target], receipt) }
            }
          }
          attempt.value = null
          closeEditor()
        },
        (failure) => {
          const known =
            failure instanceof ApiError &&
            [400, 404, 409, 413, 415, 422, 429].includes(failure.status)
          if (known) attempt.value = null
          setError(known ? errorMessage(failure) : '保存结果尚未确认，请使用原请求重试。')
        },
        () => {
          busy.value = false
        },
      ),
    '已保存，小程序下次抽取时生效。',
  )
}

async function toggle(row: Row) {
  if (row.enabled && snapshot.value?.[row.pool].filter((item) => item.enabled).length === 1) {
    setError(`请先启用另一项，再停用最后一个已启用${poolLabel.value}。`)
    return
  }
  const command = changeEntry(row, rowName(row), !row.enabled)
  if (command) await save(command)
}

async function draw() {
  if (busy.value) return
  drawOpen.value = true
  busy.value = true
  error.value = ''
  await run(
    () =>
      workspace.run(
        (signal) => drawRandomProfile(admin.session?.token ?? '', drawn.value, signal),
        (value) => {
          drawn.value = value
        },
        (failure) => setError(errorMessage(failure)),
        () => {
          busy.value = false
        },
      ),
    '已抽取一组随机资料。',
  )
}

function closeDraw() {
  drawOpen.value = false
  drawn.value = null
  error.value = ''
}

onBeforeRouteLeave(async () =>
  attempt.value
    ? !busy.value
    : !drawerDirty.value || (await confirmDiscardChanges('离开将放弃尚未保存的配置。')),
)
onMounted(() => {
  void load()
})
</script>

<template>
  <main class="experience-page" aria-label="随机资料管理">
    <WorkspaceHeading
      title="随机资料"
      description="小程序从已启用的头像、形容词和名词中各抽取一项。"
    >
      <button
        type="button"
        class="business-primary"
        :disabled="!snapshot || busy || !!attempt"
        @click="draw"
      >
        试抽一组
      </button>
    </WorkspaceHeading>
    <FloatingNotice
      v-if="feedback.message && !error"
      :message="feedback.message"
      :tone="feedback.tone"
      :revision="feedback.revision"
    />
    <section
      class="experience-panel experience-table-panel random-profile-panel"
      aria-label="素材配置"
    >
      <div class="random-pool-tabs" role="group" aria-label="素材分类">
        <button
          v-for="tab in pools"
          :key="tab.key"
          type="button"
          :aria-pressed="pool === tab.key"
          :class="{ 'business-primary': pool === tab.key }"
          :disabled="busy || !!attempt"
          @click="switchPool(tab.key)"
        >
          {{ tab.label }} <span v-if="snapshot">{{ snapshot[tab.key].length }}</span>
        </button>
      </div>
      <div class="experience-toolbar random-profile-toolbar">
        <label
          >搜索{{ poolLabel
          }}<input
            v-model="query"
            type="search"
            :placeholder="pool === 'avatars' ? '输入头像名称' : '输入词条'"
        /></label>
        <label
          >状态<select v-model="status">
            <option value="all">全部</option>
            <option value="enabled">已启用</option>
            <option value="disabled">已停用</option>
          </select></label
        >
        <button type="button" :disabled="busy" @click="run(load, '随机资料已刷新。')">
          {{ attempt ? '重新读取列表' : '刷新列表' }}
        </button>
        <button
          type="button"
          class="business-primary"
          :disabled="!snapshot || busy || !!attempt"
          @click="openEditor({ mode: 'create', pool, label: '', file: null })"
        >
          {{ pool === 'avatars' ? '上传头像' : `新增${poolLabel}` }}
        </button>
      </div>
      <FloatingNotice
        v-if="error && !draft && !drawOpen"
        :message="error"
        :revision="errorRevision"
        tone="error"
      />
      <div v-if="attempt && !draft" role="status">
        <p>保存结果待确认，可以读取列表核对配置或继续使用原请求。</p>
        <button type="button" :disabled="busy" @click="save()">原样重试</button>
      </div>
      <div
        class="business-table random-profile-table"
        tabindex="0"
        aria-label="可横向滚动的素材列表"
        :aria-busy="busy"
      >
        <table>
          <thead>
            <tr>
              <th v-if="pool === 'avatars'" scope="col">预览</th>
              <th scope="col">{{ pool === 'avatars' ? '名称' : '词条' }}</th>
              <th scope="col">状态</th>
              <th scope="col">更新时间</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in pageRows" :key="row.id">
              <td v-if="row.pool === 'avatars'">
                <img
                  class="random-avatar-thumb"
                  :src="row.image_path"
                  :alt="row.name"
                  width="48"
                  height="48"
                  loading="lazy"
                />
              </td>
              <td>{{ rowName(row) }}</td>
              <td>
                <span
                  :class="['random-entry-status', { 'random-entry-status--active': row.enabled }]"
                  >{{ row.enabled ? '已启用' : '已停用' }}</span
                >
              </td>
              <td>
                <time :datetime="row.updated_at">{{ displayBeijingTime(row.updated_at) }}</time>
              </td>
              <td>
                <div class="random-row-actions">
                  <button
                    type="button"
                    :disabled="busy || !!attempt"
                    @click="openEditor({ mode: 'edit', row, label: rowName(row) })"
                  >
                    编辑
                  </button>
                  <button
                    v-if="row.pool === 'avatars'"
                    type="button"
                    :disabled="busy || !!attempt"
                    @click="openEditor({ mode: 'replace', row, file: null })"
                  >
                    更换图片
                  </button>
                  <button type="button" :disabled="busy || !!attempt" @click="toggle(row)">
                    {{ row.enabled ? '停用' : '启用' }}
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="!pageRows.length">
              <td :colspan="pool === 'avatars' ? 5 : 4">
                {{
                  !snapshot && busy
                    ? '正在加载…'
                    : snapshot
                      ? '没有符合条件的配置。'
                      : '暂未读取到配置。'
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <LocalPagination
        v-if="snapshot"
        v-model:page="page"
        v-model:size="pageSize"
        :total="rows.length"
        :disabled="busy"
      />
    </section>
    <WorkspaceDrawer
      :open="!!draft"
      :title="editorTitle"
      :busy="busy"
      :dirty="!attempt && drawerDirty"
      :guard-route="false"
      presentation="dialog"
      @close="closeEditor"
    >
      <form
        v-if="draft"
        id="random-profile-editor"
        class="experience-editor random-profile-editor"
        @submit.prevent="save()"
      >
        <label v-if="draft.mode !== 'replace'">
          {{ editorPool === 'avatars' ? '头像名称' : poolLabel }}
          <input v-model="draft.label" required :disabled="busy || !!attempt" />
        </label>
        <p v-if="sampleNickname" class="experience-muted">
          昵称预览 <strong>{{ sampleNickname }}</strong>
        </p>
        <div v-if="uploadsImage" class="random-image-editor">
          <div v-if="draft.mode === 'replace' || previewUrl" class="random-image-previews">
            <figure v-if="draft.mode === 'replace'">
              <img :src="draft.row.image_path" alt="当前头像" width="88" height="88" />
              <figcaption>当前头像</figcaption>
            </figure>
            <figure v-if="previewUrl">
              <img :src="previewUrl" alt="待上传图片" width="88" height="88" />
              <figcaption>待上传图片</figcaption>
            </figure>
          </div>
          <label
            >选择图片<input
              type="file"
              accept="image/jpeg,image/png"
              :disabled="busy || !!attempt"
              @change="pickImage"
          /></label>
          <p class="experience-muted">支持 JPG、PNG，最大 2 MiB。通过安全扫描后保存。</p>
        </div>
        <FloatingNotice v-if="error" :message="error" :revision="errorRevision" tone="error" />
      </form>
      <template #footer
        ><div class="drawer-actions">
          <button type="button" data-overlay-close :disabled="busy">
            {{ attempt ? '返回列表' : '取消' }}
          </button>
          <button v-if="attempt" type="button" :disabled="busy" @click="load()">
            重新读取列表
          </button>
          <button
            type="submit"
            form="random-profile-editor"
            class="business-primary"
            :disabled="busy"
          >
            {{ busy ? '正在保存…' : attempt ? '原样重试' : '保存' }}
          </button>
        </div></template
      >
    </WorkspaceDrawer>
    <WorkspaceDrawer
      :open="drawOpen"
      title="试抽随机资料"
      :busy="busy"
      presentation="dialog"
      :guard-route="false"
      @close="closeDraw"
    >
      <div v-if="drawn" class="random-draw-preview" aria-live="polite">
        <img :src="drawn.image_path" alt="抽取的头像" width="104" height="104" />
        <strong>{{ drawn.nickname }}</strong>
        <p v-if="!drawn.can_reroll" class="experience-muted">当前只有一组可用组合。</p>
      </div>
      <p v-else-if="busy" role="status">正在抽取…</p>
      <FloatingNotice v-if="error" :message="error" :revision="errorRevision" tone="error" />
      <template #footer
        ><div class="drawer-actions">
          <button type="button" data-overlay-close :disabled="busy">关闭</button>
          <button
            type="button"
            class="business-primary"
            :disabled="busy || drawn?.can_reroll === false"
            @click="draw"
          >
            {{ drawn ? '换一组' : '重试' }}
          </button>
        </div></template
      >
    </WorkspaceDrawer>
  </main>
</template>

<style scoped>
.random-profile-panel {
  display: grid;
  gap: 16px;
}
.random-pool-tabs,
.random-row-actions,
.random-image-previews {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.random-pool-tabs span {
  margin-inline-start: 4px;
  font-variant-numeric: tabular-nums;
}
.random-profile-toolbar {
  margin: 0;
}
.random-profile-toolbar label,
.random-image-editor,
.random-image-editor label {
  display: grid;
  gap: 6px;
}
.random-profile-table table {
  min-width: 600px;
}
.random-profile-table td {
  overflow-wrap: anywhere;
}
.random-avatar-thumb,
.random-image-previews img,
.random-draw-preview img {
  display: block;
  border-radius: 12px;
  object-fit: cover;
  background: var(--surface-muted);
}
.random-entry-status {
  color: var(--text-secondary);
  white-space: nowrap;
}
.random-entry-status--active {
  color: var(--text-primary);
  font-weight: 600;
}
.random-profile-editor p,
.random-image-previews figure,
.random-draw-preview p {
  margin: 0;
}
.random-image-previews figure {
  text-align: center;
}
.random-image-previews figcaption {
  margin-top: 4px;
  color: var(--text-secondary);
}
.random-draw-preview {
  display: grid;
  justify-items: center;
  gap: 10px;
  min-height: 140px;
  text-align: center;
}
.random-draw-preview img {
  border-radius: 50%;
}
</style>
