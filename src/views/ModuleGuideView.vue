<script setup lang="ts">
import { confirmDiscardChanges } from '@/components/confirmDiscardChanges'
import WorkspaceHeading from '@/components/WorkspaceHeading.vue'
import FloatingNotice from '@/components/FloatingNotice.vue'
import { computed, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ApiError } from '@/services/admin'
import { useAdminStore } from '@/stores/admin'
import { reviewErrorMessage, useAdminWorkspace } from '@/composables/useAdminWorkspace'
import { readModuleGuide, saveModuleGuide, publishModuleGuide } from '@/services/moduleGuide'
import type { GuideModule, ModuleGuide } from '@/types/moduleGuide'

const admin = useAdminStore()
const token = admin.session?.token ?? ''
const guide = ref<ModuleGuide | null>(null)
const form = ref<GuideModule[]>([])
const busy = ref(false)
const selectedIndex = ref(0)
const editing = ref(false)
const conflicted = ref(false)
const readingIndex = ref(0)
const reading = computed(() => guide.value?.published_modules[readingIndex.value])
const visibleModules = computed(() =>
  editing.value ? form.value : (guide.value?.published_modules ?? []),
)
const moduleIcons: Record<string, string> = {
  wishes: 'fish',
  whispers: 'chat',
  matchmaking: 'heart',
  resources: 'book',
  capsules: 'clock',
  chat: 'chat',
}
function moduleIcon(item: GuideModule) {
  return new URL(`../assets/icons/${moduleIcons[item.module] ?? 'book'}.svg`, import.meta.url).href
}
function startEditing() {
  if (!busy.value && !pending.value) editing.value = true
}
async function finishEditing() {
  if (busy.value || pending.value) return
  if (dirty.value && !(await confirmDiscardChanges('返回阅读将放弃尚未保存的说明。'))) return
  form.value = (guide.value?.modules ?? []).map((item) => ({ ...item }))
  editing.value = false
}
function selectModule(index: number) {
  if (editing.value) selectedIndex.value = index
  else readingIndex.value = index
}
const moduleNames: Record<string, string> = {
  matchmaking: '包分配',
  wishes: '心愿',
  whispers: '树洞',
  capsules: '时光胶囊',
  resources: '资料广场',
  chat: '聊天',
}
function moduleName(item: GuideModule) {
  return moduleNames[item.module] ?? (item.title || '新模块')
}

const error = ref('')
const notice = ref('')
const pending = ref<{
  kind: 'save' | 'publish'
  key: string
  version: number
  modules: GuideModule[]
} | null>(null)
const workspace = useAdminWorkspace(() => {
  guide.value = null
  form.value = []
  pending.value = null
  editing.value = false
  conflicted.value = false
  busy.value = false
  error.value = ''
  notice.value = ''
}, 'super_admin')
const dirty = computed(
  () => JSON.stringify(form.value) !== JSON.stringify(guide.value?.modules ?? []),
)
const valid = computed(
  () =>
    form.value.length > 0 &&
    form.value.every(
      (item) =>
        /^[a-z_]{1,40}$/u.test(item.module) &&
        !!item.title.trim() &&
        [...item.title].length <= 40 &&
        !!item.body.trim() &&
        [...item.body].length <= 2000,
    ) &&
    new Set(form.value.map((item) => item.module)).size === form.value.length,
)

function accept(value: ModuleGuide) {
  selectedIndex.value = Math.min(selectedIndex.value, Math.max(0, value.modules.length - 1))
  guide.value = value
  form.value = value.modules.map((item) => ({ ...item }))
}
async function load(manual = false) {
  if (busy.value || pending.value) return
  if (
    manual &&
    dirty.value &&
    !conflicted.value &&
    !(await confirmDiscardChanges('重新读取将放弃尚未保存的说明。'))
  )
    return
  const preserved = conflicted.value ? form.value.map((item) => ({ ...item })) : null
  busy.value = true
  error.value = ''
  notice.value = ''
  await workspace.run(
    (signal) => readModuleGuide(token, signal),
    (value) => {
      accept(value)
      if (preserved) form.value = preserved
      conflicted.value = false
      pending.value = null
    },
    (failure) => {
      error.value = reviewErrorMessage(failure)
    },
    () => {
      busy.value = false
    },
  )
}
function remove(index: number) {
  form.value.splice(index, 1)
  selectedIndex.value = Math.max(0, Math.min(selectedIndex.value, form.value.length - 1))
}
function add() {
  if (busy.value || pending.value || form.value.length >= 12) return
  form.value.push({ module: '', title: '', body: '' })
  selectedIndex.value = form.value.length - 1
}
async function submit(kind: 'save' | 'publish') {
  if (
    busy.value ||
    pending.value ||
    !guide.value ||
    conflicted.value ||
    !valid.value ||
    (kind === 'publish' && dirty.value)
  )
    return
  pending.value = {
    kind,
    key: globalThis.crypto.randomUUID(),
    version: guide.value.version,
    modules: form.value.map((item) => ({ ...item })),
  }
  await retry()
}
async function retry() {
  const operation = pending.value
  if (busy.value || !operation) return
  busy.value = true
  error.value = ''
  notice.value = ''
  await workspace.run(
    (signal) =>
      operation.kind === 'save'
        ? saveModuleGuide(
            token,
            { expected_version: operation.version, modules: operation.modules },
            operation.key,
            signal,
          )
        : publishModuleGuide(token, operation.version, operation.key, signal),
    (value) => {
      accept(value)
      pending.value = null
      notice.value =
        operation.kind === 'save'
          ? '草稿已保存，可以核对后发布。'
          : '说明已发布，小程序可读取最新版本。'
    },
    (failure) => {
      error.value = reviewErrorMessage(failure)
      if (failure instanceof ApiError && [400, 401, 403, 404, 409, 422].includes(failure.status)) {
        conflicted.value = failure.status === 409
        pending.value = null
      }
    },
    () => {
      busy.value = false
    },
  )
}
onBeforeRouteLeave(
  async () =>
    !busy.value &&
    !pending.value &&
    (!dirty.value || (await confirmDiscardChanges('离开将放弃尚未保存的说明。'))),
)
onMounted(() => {
  void load()
})
</script>
<template>
  <main class="experience-page workflow" aria-label="模块使用说明">
    <WorkspaceHeading
      :title="editing ? '编辑模块说明' : '模块使用说明'"
      description="维护清晰的模块指引，让每一次使用都有方向。"
    >
      <button
        v-if="!editing"
        class="business-primary"
        :disabled="busy || !!pending || !guide"
        @click="startEditing"
      >
        编辑说明
      </button>
      <template v-else>
        <button :disabled="busy || !!pending" @click="finishEditing">返回阅读</button>
        <button :disabled="busy || !!pending || form.length >= 12" @click="add">
          添加模块说明
        </button>
      </template>
    </WorkspaceHeading>
    <template v-if="workspace.allowed()">
      <FloatingNotice v-if="error" :message="error" tone="error" />
      <FloatingNotice v-if="notice" :message="notice" tone="info" />
      <p v-if="busy" role="status">正在处理说明…</p>
      <div class="workflow-actions">
        <button :disabled="busy || !!pending" @click="load(true)">重新读取草稿与发布内容</button>
        <button v-if="pending" :disabled="busy" @click="retry">原样重试</button>
      </div>
      <p v-if="pending">操作结果待确认，请保留原请求重试，确认结果前不能修改或离开。</p>
      <p v-if="conflicted" role="alert">
        说明版本已变化，输入已保留。请重新读取当前版本，核对后再保存。
      </p>
      <template v-if="guide">
        <nav class="guide-navigation" aria-label="说明模块">
          <button
            v-for="(item, index) in visibleModules"
            :key="`${item.module}:${index}`"
            type="button"
            :aria-pressed="(editing ? selectedIndex : readingIndex) === index"
            @click="selectModule(index)"
          >
            <img :src="moduleIcon(item)" alt="" width="22" height="22" />
            <span
              >{{ moduleName(item) }}<small>{{ item.title || '模块指引' }}</small></span
            >
            <span class="guide-selected" aria-hidden="true">{{
              (editing ? selectedIndex : readingIndex) === index ? '✓' : ''
            }}</span>
          </button>
        </nav>
        <section v-if="!editing" class="experience-panel guide-reading" aria-label="已发布说明预览">
          <p class="experience-muted">
            {{
              guide.published_version ? `当前发布版本 ${guide.published_version}` : '尚未发布说明'
            }}
          </p>
          <article v-if="reading">
            <h2>{{ reading.title }}</h2>
            <p class="guide-body">{{ reading.body }}</p>
          </article>
          <p v-else>暂无已发布内容，编辑并发布后将展示在这里。</p>
        </section>
        <form v-else class="experience-panel experience-editor" @submit.prevent="submit('save')">
          <p>
            草稿版本 {{ guide.version }} ·
            {{ guide.published_version ? `已发布版本 ${guide.published_version}` : '尚未发布' }}
          </p>
          <fieldset :disabled="busy || !!pending || conflicted">
            <legend>说明草稿</legend>
            <section
              v-for="(item, index) in form"
              v-show="index === selectedIndex"
              :key="index"
              class="guide-module"
            >
              <h2>{{ moduleName(item) }}</h2>
              <label
                >模块<select v-model="item.module" required>
                  <option value="" disabled>请选择模块</option>
                  <option v-for="(name, key) in moduleNames" :key="key" :value="key">
                    {{ name }}
                  </option>
                  <option v-if="item.module && !moduleNames[item.module]" :value="item.module">
                    {{ item.title || '其他模块' }}
                  </option>
                </select></label
              >
              <label
                >标题（最多40字）<input v-model="item.title" required autocomplete="off"
              /></label>
              <label
                >使用说明（最多2000字）<textarea v-model="item.body" required rows="12" />
              </label>
              <button type="button" @click="remove(index)">移除此项说明</button>
            </section>
            <p v-if="!form.length">尚未填写模块说明，请添加后保存。</p>
            <p class="experience-muted">
              切换模块保留未保存输入；保存提交全部模块。每个模块只能使用一次，最多12项。
            </p>
            <div class="workflow-actions">
              <button class="business-primary" type="submit" :disabled="!valid || !dirty">
                保存草稿
              </button>
              <button type="button" :disabled="!valid || dirty" @click="submit('publish')">
                发布当前草稿
              </button>
            </div>
            <p v-if="dirty">草稿已修改，请先保存并核对后再发布。</p>
          </fieldset>
          <section aria-label="已发布说明预览">
            <h3>当前发布版本</h3>
            <p v-if="!guide.published_version">尚未发布说明。</p>
            <article v-for="item in guide.published_modules" :key="item.module">
              <h4>{{ item.title }}</h4>
              <p class="guide-body">{{ item.body }}</p>
            </article>
          </section>
        </form>
      </template>
    </template>
    <p v-else role="alert">当前会话无权配置模块说明，请联系管理员。</p>
  </main>
</template>
<style scoped>
.guide-navigation {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.guide-navigation button {
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  padding: 18px;
  min-width: 0;
  white-space: normal;
}
.guide-navigation button[aria-pressed='true'] {
  background: var(--selected-surface);
  border-color: var(--accent-color);
  color: var(--accent-color);
}
.guide-navigation img {
  flex-shrink: 0;
}
.guide-navigation span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.guide-navigation small {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-secondary);
}
.guide-selected {
  margin-left: auto;
}
.guide-reading {
  min-height: 300px;
}
.guide-reading h2 {
  font-size: 23px;
  margin-block: 20px;
}
.guide-body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.9;
}
fieldset {
  display: grid;
  gap: 20px;
  border: 0;
  padding: 16px 0;
  min-width: 0;
}
.guide-module {
  display: grid;
  gap: 12px;
  min-width: 0;
}
label {
  display: grid;
  gap: 6px;
}
input,
select,
textarea {
  font: inherit;
  padding: 10px;
  width: 100%;
}
@media (max-width: 1150px) {
  .guide-navigation {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 420px) {
  .guide-navigation {
    grid-template-columns: 1fr;
  }
}
</style>
