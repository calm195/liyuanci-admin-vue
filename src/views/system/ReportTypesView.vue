<script setup lang="ts">
import { confirmDiscardChanges } from '@/components/confirmDiscardChanges'
import WorkspaceHeading from '@/components/WorkspaceHeading.vue'
import WorkspaceDrawer from '@/components/WorkspaceDrawer.vue'
import { onBeforeRouteLeave } from 'vue-router'
import './dictionary-management.css'
import { onMounted, ref } from 'vue'
import { useAdminStore } from '@/stores/admin'
import { ApiError } from '@/services/admin'
import { readReportTypes, saveReportType } from '@/services/report-types'
import type { ReportTypeItem, ReportTypesSnapshot } from '@/services/report-types'
import { useAdminWorkspace, reviewErrorMessage } from '@/composables/useAdminWorkspace'
import FloatingNotice from '@/components/FloatingNotice.vue'
const admin = useAdminStore()
const snapshot = ref<ReportTypesSnapshot>({ version: 0, items: [] })
const draft = ref<ReportTypeItem | null>(null)
const creating = ref(false)
const busy = ref(false)
const uncertain = ref(false)
const inlineAction = ref(false)
let originalDraft = ''
const error = ref('')
const errorRevision = ref(0)
const notice = ref('')
let attempt: { item: ReportTypeItem; version: number; key: string } | null = null
const workspace = useAdminWorkspace(() => {
  snapshot.value = { version: 0, items: [] }
  draft.value = null
  originalDraft = JSON.stringify(draft.value)
  inlineAction.value = false
  attempt = null
  error.value = ''
  notice.value = ''
  busy.value = false
  uncertain.value = false
}, 'super_admin')
async function load(manual = false) {
  if (busy.value || (manual && uncertain.value)) return
  busy.value = true
  error.value = ''
  notice.value = ''
  await workspace.run(
    (signal) => readReportTypes(admin.session?.token ?? '', signal),
    (value) => {
      snapshot.value = value
      if (manual) {
        draft.value = null
        attempt = null
        uncertain.value = false
        notice.value = '举报类型已刷新，请核对当前内容'
      }
    },
    (failure) => {
      error.value = reviewErrorMessage(failure)
    },
    () => {
      busy.value = false
    },
  )
}
function edit(item?: ReportTypeItem) {
  if (busy.value || uncertain.value || snapshot.value.version < 1) return
  creating.value = !item
  draft.value = item ? { ...item } : { code: '', label: '', published: false }
  originalDraft = JSON.stringify(draft.value)
  inlineAction.value = false
  attempt = null
  error.value = ''
  notice.value = ''
}
async function toggleState(item: ReportTypeItem) {
  if (busy.value || uncertain.value || draft.value) return
  edit(item)
  draft.value = { ...item, published: !item.published }
  inlineAction.value = true
  await save()
  if (!uncertain.value) draft.value = null
}
async function save() {
  const item = draft.value
  if (!item || busy.value) return
  errorRevision.value++
  error.value = ''
  notice.value = ''
  if (
    !/^[A-Za-z0-9_-]{1,32}$/.test(item.code) ||
    !item.label.trim() ||
    [...item.label.trim()].length > 80
  ) {
    error.value = '代码须为1至32位字母、数字、下划线或连字符，名称须为1至80个字符'
    return
  }
  if (creating.value && snapshot.value.items.some((existing) => existing.code === item.code)) {
    error.value = '该代码已存在，请编辑已有类型'
    return
  }
  if (!uncertain.value || !attempt)
    attempt = {
      item: { ...item, label: item.label.trim() },
      version: snapshot.value.version,
      key: globalThis.crypto.randomUUID(),
    }
  const current = attempt
  busy.value = true
  await workspace.run(
    (signal) =>
      saveReportType(
        admin.session?.token ?? '',
        current.item,
        current.version,
        current.key,
        signal,
      ),
    (value) => {
      snapshot.value = value
      draft.value = null
      attempt = null
      uncertain.value = false
      notice.value = '举报类型已保存，发布状态已更新'
    },
    (failure) => {
      uncertain.value = !(
        failure instanceof ApiError && [400, 401, 403, 404, 409, 422].includes(failure.status)
      )
      error.value = uncertain.value
        ? '保存结果尚未确认，请原样重试或重新读取核对结果'
        : reviewErrorMessage(failure)
      if (!uncertain.value) attempt = null
    },
    () => {
      busy.value = false
    },
  )
}
onBeforeRouteLeave(
  async () =>
    !busy.value &&
    !uncertain.value &&
    (!draft.value ||
      inlineAction.value ||
      JSON.stringify(draft.value) === originalDraft ||
      (await confirmDiscardChanges('离开将放弃尚未保存的配置。'))),
)
onMounted(() => {
  void load()
})
</script>
<template>
  <main class="experience-page" aria-label="举报类型管理">
    <WorkspaceHeading
      title="举报类型"
      description="新增类型默认未发布；已使用代码保持稳定，停用保留历史记录。"
    >
      <button
        class="business-primary"
        :disabled="busy || uncertain || snapshot.version < 1"
        @click="edit()"
      >
        新增类型
      </button>
    </WorkspaceHeading>
    <section class="experience-panel experience-table-panel">
      <div class="experience-toolbar">
        <button :disabled="busy || uncertain" @click="load(true)">刷新类型</button
        ><RouterLink to="/dictionaries">管理展示字典</RouterLink
        ><span class="experience-muted">当前版本：{{ snapshot.version }}</span>
      </div>
      <FloatingNotice v-if="busy" message="正在处理举报类型…" tone="pending" />
      <FloatingNotice v-if="error" :message="error" :revision="errorRevision" tone="error" />
      <FloatingNotice v-if="notice" :message="notice" tone="success" />
      <div class="business-table dictionary-table" tabindex="0" aria-label="可横向滚动的字典列表">
        <table>
          <thead>
            <tr>
              <th>代码</th>
              <th>名称</th>
              <th>发布状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in snapshot.items" :key="item.code">
              <td>{{ item.code }}</td>
              <td>{{ item.label }}</td>
              <td>
                <button
                  class="inline-switch"
                  role="switch"
                  :aria-checked="item.published"
                  :aria-label="`发布 ${item.label}`"
                  :disabled="busy || uncertain || !!draft"
                  @click="toggleState(item)"
                >
                  <span aria-hidden="true"></span></button
                ><span>{{ item.published ? '已发布' : '未发布' }}</span>
              </td>
              <td><button :disabled="busy || uncertain" @click="edit(item)">编辑</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <section
      v-if="inlineAction && uncertain"
      class="experience-panel"
      aria-label="待核实的状态切换"
    >
      <p>状态切换结果尚未确认，请使用原请求核实。</p>
      <button :disabled="busy" @click="save">原样重试</button>
    </section>
    <WorkspaceDrawer
      :guard-route="false"
      presentation="dialog"
      :open="!!draft && !inlineAction"
      :dirty="!!draft && JSON.stringify(draft) !== originalDraft"
      :title="creating ? '新增举报类型' : '编辑举报类型'"
      :busy="busy || uncertain"
      @close="draft = null"
    >
      <p v-if="uncertain" class="experience-inline-error">
        保存结果尚未确认，请保持原请求重试，取得明确结果后再关闭或离开。
      </p>
      <form v-if="draft" id="dictionary-editor" class="experience-editor" @submit.prevent="save">
        <label
          >代码<input
            v-model="draft.code"
            required
            maxlength="32"
            :disabled="!creating || busy || uncertain"
        /></label>
        <label
          >名称<input v-model="draft.label" required maxlength="80" :disabled="busy || uncertain"
        /></label>
        <label class="dictionary-toggle"
          ><input
            v-model="draft.published"
            type="checkbox"
            :disabled="busy || uncertain"
          />发布供用户选择</label
        >
        <p v-if="error">{{ error }}</p>
      </form>
      <template #footer
        ><div class="drawer-actions">
          <button data-overlay-close :disabled="busy || uncertain" @click="draft = null">
            取消
          </button>
          <button class="business-primary" form="dictionary-editor" type="submit" :disabled="busy">
            {{ busy ? '正在保存…' : uncertain ? '原样重试' : '保存' }}
          </button>
        </div></template
      >
    </WorkspaceDrawer>
  </main>
</template>
