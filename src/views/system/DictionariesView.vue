<script setup lang="ts">
import BusinessToolbar from '@/components/BusinessToolbar.vue'
import './dictionary-management.css'
import { computed, onMounted, ref } from 'vue'
import { useAdminStore } from '@/stores/admin'
import { useDictionariesStore } from '@/stores/dictionaries'
import { ApiError } from '@/services/admin'
import { saveDictionary, readAdminDictionaries } from '@/services/dictionaries'
import type { DictionaryItem } from '@/services/dictionaries'
import { useAdminWorkspace, reviewErrorMessage } from '@/composables/useAdminWorkspace'
import FloatingNotice from '@/components/FloatingNotice.vue'
const admin = useAdminStore()
const dictionaries = useDictionariesStore()
const selectedType = ref('')
const draft = ref<DictionaryItem | null>(null)
const version = ref(0)
const busy = ref(false)
const error = ref('')
const errorRevision = ref(0)
const notice = ref('')
const uncertain = ref(false)
let attempt: { item: DictionaryItem; version: number; key: string } | null = null
const titles: Record<string, string> = {
  wish_state: '心愿状态',
  resource_feedback: '资料反馈',
  builtin_wordlist_label: '内置词库标签',
  verification_status: '认证状态',
  restriction_status: '账号限制',
  admin_role: '后台角色',
  resource_status: '资料状态',
  whisper_review_status: '树洞审核状态',
  whisper_report_status: '树洞举报状态',
  whisper_crisis_status: '树洞危机状态',
  whisper_delivery_status: '消息投递状态',
}
const workspace = useAdminWorkspace(() => {
  draft.value = null
  busy.value = false
  error.value = ''
  notice.value = ''
  attempt = null
  uncertain.value = false
}, 'super_admin')
const types = computed(() => [...new Set(dictionaries.snapshot.items.map((item) => item.type))])
const items = computed(() =>
  dictionaries.snapshot.items
    .filter((item) => !selectedType.value || item.type === selectedType.value)
    .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code)),
)
async function load(manual = false) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  await workspace.run(
    (signal) => readAdminDictionaries(admin.session?.token ?? '', signal),
    (value) => {
      dictionaries.accept(value)
      if (manual) {
        draft.value = null
        attempt = null
        uncertain.value = false
        notice.value = '字典已刷新，请核对当前名称和版本'
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
function edit(item: DictionaryItem) {
  if (busy.value || uncertain.value) return
  draft.value = { ...item }
  version.value = dictionaries.snapshot.version
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
    !item.label.trim() ||
    [...item.label.trim()].length > 80 ||
    !Number.isSafeInteger(item.sort_order) ||
    item.sort_order < 0 ||
    item.sort_order > 100000
  ) {
    error.value = '名称须为1至80个字符，排序须为0至100000的整数'
    return
  }
  if (!uncertain.value || !attempt)
    attempt = {
      item: { ...item, label: item.label.trim() },
      version: version.value,
      key: globalThis.crypto.randomUUID(),
    }
  const current = attempt
  busy.value = true
  await workspace.run(
    (signal) =>
      saveDictionary(
        admin.session?.token ?? '',
        current.item,
        current.version,
        current.key,
        signal,
      ),
    (value) => {
      dictionaries.accept(value)
      draft.value = null
      attempt = null
      uncertain.value = false
      notice.value = '字典已保存，展示名称已更新'
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
  <main class="panel workflow" aria-label="展示字典管理">
    <h1>展示字典管理</h1>
    <RouterLink to="/report-types">管理举报类型</RouterLink>
    <p>维护名称、排序与启用状态。系统代码保持稳定；此处修改不改变权限、状态流转或处罚规则。</p>
    <BusinessToolbar label="展示字典操作"
      ><button :disabled="busy" @click="load(true)">刷新字典</button></BusinessToolbar
    >
    <FloatingNotice v-if="dictionaries.error" :message="dictionaries.error" tone="error" />
    <FloatingNotice v-if="busy" message="正在处理字典操作…" tone="pending" />
    <FloatingNotice v-if="error" :message="error" :revision="errorRevision" tone="error" />
    <FloatingNotice v-if="notice" :message="notice" tone="success" />
    <div class="business-filters">
      <label
        >字典类型<select v-model="selectedType">
          <option value="">全部</option>
          <option v-for="type in types" :key="type" :value="type">
            {{ titles[type] ?? type }}
          </option>
        </select></label
      >
    </div>
    <p>当前版本：{{ dictionaries.snapshot.version }}</p>
    <div class="business-table dictionary-table" tabindex="0" aria-label="可横向滚动的字典列表">
      <table>
        <thead>
          <tr>
            <th>类型</th>
            <th>代码</th>
            <th>名称</th>
            <th>排序</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="`${item.type}/${item.code}`">
            <td>{{ titles[item.type] ?? item.type }}</td>
            <td>{{ item.code }}</td>
            <td>{{ item.label }}</td>
            <td>{{ item.sort_order }}</td>
            <td>{{ item.enabled ? '启用' : '停用' }}</td>
            <td><button :disabled="busy || uncertain" @click="edit(item)">编辑</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <form v-if="draft" class="business-card dictionary-editor" @submit.prevent="save">
      <h2>编辑 {{ draft.type }} / {{ draft.code }}</h2>
      <label
        >名称<input v-model="draft.label" maxlength="80" required :disabled="busy || uncertain"
      /></label>
      <label
        >排序<input
          v-model.number="draft.sort_order"
          type="number"
          step="1"
          min="0"
          max="100000"
          required
          :disabled="busy || uncertain"
      /></label>
      <label v-if="draft.type === 'resource_feedback'"
        ><input v-model="draft.enabled" type="checkbox" :disabled="busy || uncertain" />启用</label
      >
      <div class="business-dialog-actions">
        <button :disabled="busy">{{ busy ? '正在保存…' : uncertain ? '原样重试' : '保存' }}</button>
        <button type="button" :disabled="busy || uncertain" @click="draft = null">取消</button>
      </div>
      <p v-if="error">{{ error }}</p>
    </form>
  </main>
</template>
