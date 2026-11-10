<script setup lang="ts">
import FloatingNotice from '@/components/FloatingNotice.vue'
import { computed, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
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
async function load() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  await workspace.run(
    (signal) => readModuleGuide(token, signal),
    (value) => {
      accept(value)
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
    },
    () => {
      busy.value = false
    },
  )
}
onBeforeRouteLeave(
  () => !busy.value && (!dirty.value || globalThis.confirm('说明尚未保存，确认离开？')),
)
onMounted(load)
</script>
<template>
  <main class="panel workflow" aria-label="模块使用说明">
    <template v-if="workspace.allowed()">
      <p>认证通过后，小程序展示已发布说明；用户也可以在个人中心重新阅读。</p>
      <FloatingNotice v-if="error" :message="error" tone="error">{{ error }}</FloatingNotice>
      <FloatingNotice v-if="notice" :message="notice" tone="info">{{ notice }}</FloatingNotice>
      <p v-if="busy" role="status">正在处理说明…</p>
      <div class="workflow-actions">
        <button :disabled="busy" @click="load">重新读取草稿与发布内容</button>
        <button v-if="pending" :disabled="busy" @click="retry">原样重试</button>
      </div>
      <p v-if="pending">操作结果待确认。可原样重试，或重新读取后核对服务器内容。</p>
      <template v-if="guide">
        <p>
          草稿版本 {{ guide.version }} ·
          {{ guide.published_version ? `已发布版本 ${guide.published_version}` : '尚未发布' }}
        </p>
        <form @submit.prevent="submit('save')">
          <fieldset :disabled="busy || !!pending">
            <legend>说明草稿</legend>
            <div class="guide-columns">
              <nav class="guide-navigation" aria-label="说明模块">
                <button
                  v-for="(item, index) in form"
                  :key="index"
                  type="button"
                  :aria-current="selectedIndex === index ? 'true' : undefined"
                  @click="selectedIndex = index"
                >
                  {{ moduleName(item) }}
                </button>
              </nav>
              <div>
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
                    >使用说明（最多2000字）<textarea v-model="item.body" required rows="5" />
                  </label>
                  <button type="button" @click="remove(index)">移除此项说明</button>
                </section>
              </div>
            </div>
            <p v-if="!form.length">尚未填写模块说明，请添加后保存。</p>
            <p>
              点击左侧模块编辑说明。切换模块会保留当前未保存的输入，保存将提交所有修改。每个模块只能使用一次，最多12项。
            </p>
            <div class="workflow-actions">
              <button type="button" :disabled="form.length >= 12" @click="add">添加模块说明</button>
              <button type="submit" :disabled="!valid || !dirty">保存草稿</button>
              <button type="button" :disabled="!valid || dirty" @click="submit('publish')">
                发布当前草稿
              </button>
            </div>
            <p v-if="dirty">草稿已修改，请先保存并核对后再发布。</p>
          </fieldset>
        </form>
        <section aria-label="已发布说明预览">
          <h2>已发布说明预览</h2>
          <p v-if="!guide.published_version">尚未发布说明。</p>
          <article v-for="item in guide.published_modules" :key="item.module">
            <h3>{{ item.title }}</h3>
            <p class="guide-body">{{ item.body }}</p>
          </article>
        </section>
      </template>
    </template>
    <p v-else role="alert">当前会话无权配置模块说明，请联系管理员。</p>
  </main>
</template>
<style scoped>
fieldset {
  display: grid;
  gap: 1rem;
  border: 0;
  padding: 1rem 0;
  min-width: 0;
}
.guide-module {
  display: grid;
  gap: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 0.75rem;
  padding: 1rem;
}
label {
  display: grid;
  gap: 0.4rem;
}
input,
select,
textarea {
  font: inherit;
  padding: 0.65rem;
  width: 100%;
  box-sizing: border-box;
}
.guide-body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>

<style scoped>
.guide-columns {
  display: grid;
  grid-template-columns: minmax(9rem, 14rem) minmax(0, 1fr);
  gap: 1.5rem;
}
.guide-navigation {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.guide-navigation button {
  text-align: left;
  padding: 0.8rem;
}
.guide-navigation button[aria-current='true'] {
  color: var(--text-primary);
  background: var(--surface-muted);
  font-weight: 700;
  border-color: var(--text-primary);
}
@media (max-width: 640px) {
  .guide-columns {
    grid-template-columns: 1fr;
  }
  .guide-navigation {
    flex-direction: row;
    flex-wrap: wrap;
  }
}
</style>
