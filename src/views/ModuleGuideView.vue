<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAdminStore } from '@/stores/admin'
import { reviewErrorMessage, useAdminWorkspace } from '@/composables/useAdminWorkspace'
import { readModuleGuide, saveModuleGuide, publishModuleGuide } from '@/services/moduleGuide'
import type { GuideModule, ModuleGuide } from '@/types/moduleGuide'

const admin = useAdminStore()
const token = admin.session?.token ?? ''
const guide = ref<ModuleGuide | null>(null)
const form = ref<GuideModule[]>([])
const busy = ref(false)
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
function add() {
  if (busy.value || pending.value || form.value.length >= 12) return
  form.value.push({ module: '', title: '', body: '' })
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
onMounted(load)
</script>
<template>
  <main class="panel workflow" aria-label="模块使用说明">
    <template v-if="workspace.allowed()">
      <p>认证通过后，小程序展示已发布说明；用户也可以在个人中心重新阅读。</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="notice" role="status">{{ notice }}</p>
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
            <section v-for="(item, index) in form" :key="index" class="guide-module">
              <h2>第 {{ index + 1 }} 项说明</h2>
              <label
                >模块标识<input
                  v-model="item.module"
                  required
                  pattern="[a-z_]{1,40}"
                  autocomplete="off"
                  placeholder="例如 wishes"
              /></label>
              <label
                >标题（最多40字）<input v-model="item.title" required autocomplete="off"
              /></label>
              <label
                >使用说明（最多2000字）<textarea v-model="item.body" required rows="5" />
              </label>
              <button type="button" @click="form.splice(index, 1)">移除此项说明</button>
            </section>
            <p v-if="!form.length">尚未填写模块说明，请添加后保存。</p>
            <p>
              推荐模块标识为
              wishes、whispers、capsules、resources、chat。每个标识只能使用一次，最多12项。
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
