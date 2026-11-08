<script setup lang="ts">
import BusinessToolbar from '@/components/BusinessToolbar.vue'
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
const error = ref('')
const errorRevision = ref(0)
const notice = ref('')
let attempt: { item: ReportTypeItem; version: number; key: string } | null = null
const workspace = useAdminWorkspace(() => {
  snapshot.value = { version: 0, items: [] }
  draft.value = null
  attempt = null
  error.value = ''
  notice.value = ''
  busy.value = false
  uncertain.value = false
}, 'super_admin')
async function load(manual = false) {
  if (busy.value) return
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
  attempt = null
  error.value = ''
  notice.value = ''
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
onMounted(() => {
  void load()
})
</script>
<template>
  <main class="panel workflow" aria-label="举报类型管理">
    <h1>举报类型管理</h1>
    <RouterLink to="/dictionaries">管理展示字典</RouterLink>
    <p>新增类型默认未发布。已使用的代码不能改名或删除；停用仅停止新举报选择，保留历史记录。</p>
    <BusinessToolbar label="举报类型操作"
      ><button :disabled="busy" @click="load(true)">刷新类型</button>
      <button :disabled="busy || uncertain || snapshot.version < 1" @click="edit()">
        新增类型
      </button></BusinessToolbar
    >
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
            <td>{{ item.published ? '已发布' : '未发布' }}</td>
            <td><button :disabled="busy || uncertain" @click="edit(item)">编辑</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <form v-if="draft" class="business-card dictionary-editor" @submit.prevent="save">
      <h2>{{ creating ? '新增举报类型' : '编辑举报类型' }}</h2>
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
      <div class="business-dialog-actions">
        <button :disabled="busy">{{ busy ? '正在保存…' : uncertain ? '原样重试' : '保存' }}</button>
        <button type="button" :disabled="busy || uncertain" @click="draft = null">取消</button>
      </div>
      <p v-if="error">{{ error }}</p>
    </form>
  </main>
</template>
