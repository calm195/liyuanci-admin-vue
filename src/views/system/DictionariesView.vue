<script setup lang="ts">
import { confirmDiscardChanges } from '@/components/confirmDiscardChanges'
import WorkspaceHeading from '@/components/WorkspaceHeading.vue'
import WorkspaceDrawer from '@/components/WorkspaceDrawer.vue'
import { onBeforeRouteLeave } from 'vue-router'
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
const inlineAction = ref(false)
let originalDraft = ''
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
  if (busy.value || (manual && uncertain.value)) return
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
  originalDraft = JSON.stringify(draft.value)
  inlineAction.value = false
  attempt = null
  error.value = ''
  notice.value = ''
}
async function toggleState(item: DictionaryItem) {
  if (busy.value || uncertain.value || draft.value) return
  edit(item)
  draft.value = { ...item, enabled: !item.enabled }
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
  <main class="experience-page" aria-label="展示字典管理">
    <WorkspaceHeading
      title="展示字典"
      description="维护名称、排序与启用状态；展示名称不改变权限和状态流转规则。"
    />
    <section class="experience-panel experience-table-panel">
      <div class="experience-toolbar">
        <button :disabled="busy || uncertain" @click="load(true)">刷新字典</button
        ><RouterLink to="/report-types">管理举报类型</RouterLink>
      </div>
      <FloatingNotice v-if="dictionaries.error" :message="dictionaries.error" tone="error" />
      <FloatingNotice v-if="busy" message="正在处理字典操作…" tone="pending" />
      <FloatingNotice v-if="error" :message="error" :revision="errorRevision" tone="error" />
      <FloatingNotice v-if="notice" :message="notice" tone="success" />
      <div class="experience-filters">
        <label
          >字典类型<select v-model="selectedType">
            <option value="">全部</option>
            <option v-for="type in types" :key="type" :value="type">
              {{ titles[type] ?? type }}
            </option>
          </select></label
        >
      </div>
      <p class="experience-inline-notice experience-muted">
        当前版本：{{ dictionaries.snapshot.version }}
      </p>
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
              <td>
                <button
                  v-if="item.type === 'resource_feedback'"
                  class="inline-switch"
                  role="switch"
                  :aria-checked="item.enabled"
                  :aria-label="`启用 ${item.label}`"
                  :disabled="busy || uncertain || !!draft"
                  @click="toggleState(item)"
                >
                  <span aria-hidden="true"></span></button
                ><span>{{ item.enabled ? '启用' : '停用' }}</span>
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
      :title="draft ? `编辑 ${draft.type} / ${draft.code}` : '编辑字典'"
      :busy="busy || uncertain"
      @close="draft = null"
    >
      <p v-if="uncertain" class="experience-inline-error">
        保存结果尚未确认，请保持原请求重试，取得明确结果后再关闭或离开。
      </p>
      <form v-if="draft" id="dictionary-editor" class="experience-editor" @submit.prevent="save">
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
          ><input
            v-model="draft.enabled"
            type="checkbox"
            :disabled="busy || uncertain"
          />启用</label
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
