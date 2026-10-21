<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useAdminStore } from '@/stores/admin'
import { ApiError, accountsIntegrationEnabled } from '@/services/admin'
import { createAccountsClient } from '@/services/accounts'
import { reviewErrorMessage, useAdminWorkspace } from '@/composables/useAdminWorkspace'
import { roles } from '@/types/admin'
import type { AdminAccount, Role } from '@/types/admin'

const admin = useAdminStore()
const owner = admin.session
const items = ref<AdminAccount[]>([])
const cursor = ref<string | null>(null)
const nextCursor = ref<string | null>(null)
const history = ref<(string | null)[]>([])
const selected = ref<AdminAccount | null>(null)
const loginName = ref('')
const selectedRoles = ref<Role[]>([])
const reason = ref('')
const busy = ref(false)
const error = ref('')
const notice = ref('')
const confirming = ref(false)
let attempt: { fingerprint: string; key: string } | null = null
const roleLabels: Record<Role, string> = {
  review_operator: '审核运营',
  crisis_operator: '危机处置人员',
  super_admin: '超级管理员',
}
function resetForm() {
  selected.value = null
  loginName.value = ''
  selectedRoles.value = []
  reason.value = ''
  confirming.value = false
  attempt = null
}
function clear() {
  items.value = []
  cursor.value = null
  nextCursor.value = null
  history.value = []
  resetForm()
  error.value = ''
  notice.value = ''
  busy.value = false
}
const workspace = useAdminWorkspace(clear, 'super_admin')
const client = createAccountsClient(owner?.token ?? '', workspace.allowed)
const enabled = accountsIntegrationEnabled
const valid = computed(
  () => (selected.value !== null || !!loginName.value.trim()) && !!reason.value.trim(),
)
const canOperate = () => enabled && workspace.allowed() && !busy.value
watch(
  [loginName, selectedRoles, reason],
  () => {
    confirming.value = false
  },
  { deep: true },
)
function edit(account: AdminAccount) {
  if (!canOperate()) return
  resetForm()
  selected.value = { ...account, roles: [...account.roles] }
  selectedRoles.value = [...account.roles]
  error.value = ''
  notice.value = ''
}
async function load(target: string | null = null, previous: (string | null)[] = []) {
  if (!canOperate()) return
  busy.value = true
  error.value = ''
  resetForm()
  items.value = []
  nextCursor.value = null
  await workspace.run(
    (signal) => client.list(target, signal),
    (page) => {
      items.value = page.items
      cursor.value = target
      nextCursor.value = page.next_cursor
      history.value = previous
    },
    (cause) => {
      error.value = reviewErrorMessage(cause)
    },
    () => {
      busy.value = false
    },
  )
}
async function nextPage() {
  if (nextCursor.value !== null) await load(nextCursor.value, [...history.value, cursor.value])
}
async function previousPage() {
  if (history.value.length) await load(history.value.at(-1) ?? null, history.value.slice(0, -1))
}
function confirm() {
  if (canOperate() && valid.value) confirming.value = true
}
async function submit() {
  if (!canOperate() || !valid.value || !confirming.value) return
  const target = selected.value
  const input = { roles: [...selectedRoles.value], reason: reason.value.trim() }
  const fingerprint = JSON.stringify([
    target?.id ?? null,
    target?.version ?? null,
    loginName.value,
    input,
  ])
  if (attempt?.fingerprint !== fingerprint)
    attempt = { fingerprint, key: globalThis.crypto.randomUUID() }
  const key = attempt.key
  busy.value = true
  error.value = ''
  let refresh = false
  await workspace.run(
    (signal) =>
      target
        ? client.replaceRoles(
            target.id,
            { ...input, expected_version: target.version },
            key,
            signal,
          )
        : client.create({ ...input, login_name: loginName.value }, key, signal),
    (account) => {
      notice.value = target
        ? `账号 ${account.login_name} 的角色已更新`
        : `账号 ${account.login_name} 已创建；初始口令请通过管理员指定渠道获取`
      resetForm()
      if (account.id === owner?.account.id) {
        owner.account = account
        if (!admin.authenticated) admin.clear('后台账号不可用，请重新登录')
        else if (!admin.can('super_admin')) admin.forbidden++
      }
      refresh = true
    },
    (cause) => {
      confirming.value = false
      if (cause instanceof ApiError && (cause.status === 409 || cause.status === 404)) {
        error.value =
          '账号版本、状态或操作标识发生冲突；请核对刷新后的列表，重新选择目标并确认，不会自动重试'
        // 创建冲突时保留相同输入的操作标识，不能盲目换键再次创建。
        if (target) resetForm()
        refresh = true
      } else error.value = reviewErrorMessage(cause)
    },
    () => {
      busy.value = false
    },
  )
  if (refresh && enabled && workspace.allowed()) {
    const savedError = error.value
    const savedAttempt = attempt
    const savedName = loginName.value
    const savedRoles = [...selectedRoles.value]
    const savedReason = reason.value
    await load()
    if (workspace.allowed() && savedError) {
      error.value = savedError + (error.value ? `；列表刷新失败：${error.value}` : '')
      if (!target) {
        loginName.value = savedName
        selectedRoles.value = savedRoles
        reason.value = savedReason
        attempt = savedAttempt
      }
    }
  }
}
onMounted(() => {
  if (enabled) void load()
})
</script>

<template>
  <main class="panel workflow">
    <h1>后台账号管理</h1>
    <p>仅超级管理员可创建后台账号或完整替换角色。空角色账号仍可登录和本人改密。</p>
    <p v-if="!enabled" role="status">
      账号管理需显式启用隔离联调模式，Mock 环境不连接真实账号接口。
    </p>
    <template v-else-if="workspace.allowed()">
      <p class="banner">隔离接口联调 · 每次请求由服务端核验当前超管权限，尚未完成真实服务验收</p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <section aria-labelledby="accounts-title" :aria-busy="busy">
        <h2 id="accounts-title">后台账号列表</h2>
        <button :disabled="busy" @click="load()">从首页刷新</button>
        <p v-if="busy" role="status">正在处理…</p>
        <p v-else-if="!items.length">暂无后台账号</p>
        <table v-if="items.length">
          <caption>
            账号、角色与当前版本
          </caption>
          <thead>
            <tr>
              <th scope="col">账号</th>
              <th scope="col">状态</th>
              <th scope="col">角色</th>
              <th scope="col">版本</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="account in items" :key="account.id">
              <th scope="row">
                {{ account.login_name
                }}<span v-if="account.id === owner?.account.id">（本人）</span>
              </th>
              <td>{{ account.active ? '启用' : '停用' }}</td>
              <td>{{ account.roles.map((role) => roleLabels[role]).join('、') || '无角色' }}</td>
              <td>{{ account.version }}</td>
              <td>
                <button
                  :disabled="busy"
                  :aria-label="`修改 ${account.login_name} 的角色`"
                  @click="edit(account)"
                >
                  修改角色
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <button :disabled="busy || !history.length" @click="previousPage">上一页</button>
        <button :disabled="busy || nextCursor === null" @click="nextPage">下一页</button>
        <p>列表随账号变化更新；新建后从首页重新读取，不视为冻结快照。</p>
      </section>
      <section aria-labelledby="account-form-title">
        <h2 id="account-form-title">{{ selected ? '修改账号角色' : '创建后台账号' }}</h2>
        <button v-if="selected" :disabled="busy" @click="resetForm">取消修改，返回创建</button>
        <p v-if="selected">
          目标：{{ selected.login_name }} · 版本 {{ selected.version }}；账号名不能在此修改。
        </p>
        <p v-else>初始口令由服务端仓库外策略提供，此页面不设置或显示口令。</p>
        <form @submit.prevent="confirm">
          <fieldset :disabled="busy || confirming">
            <legend>{{ selected ? '完整替换角色' : '新账号资料' }}</legend>
            <template v-if="!selected"
              ><label for="account-login">后台账号名</label
              ><input id="account-login" v-model="loginName" autocomplete="off" required
            /></template>
            <label v-for="role in roles" :key="role"
              ><input v-model="selectedRoles" type="checkbox" :value="role" />{{
                roleLabels[role]
              }}</label
            >
            <label for="account-reason">{{ selected ? '角色修改理由' : '创建理由' }}</label>
            <textarea id="account-reason" v-model="reason" required />
            <button :disabled="!valid">核对并继续</button>
          </fieldset>
        </form>
        <section v-if="confirming" aria-label="确认账号操作">
          <h3>确认{{ selected ? '替换角色' : '创建账号' }}</h3>
          <p>账号：{{ selected?.login_name ?? loginName }}</p>
          <p>新角色：{{ selectedRoles.map((role) => roleLabels[role]).join('、') || '无角色' }}</p>
          <p>理由：{{ reason }}</p>
          <p v-if="selected?.id === owner?.account.id">
            正在修改本人角色；移除超管后将立即离开账号管理。
          </p>
          <button :disabled="busy" @click="submit">确认提交</button>
          <button :disabled="busy" @click="confirming = false">返回修改</button>
        </section>
      </section>
    </template>
  </main>
</template>

<style scoped>
table {
  width: 100%;
  border-collapse: collapse;
  overflow-wrap: anywhere;
}
th,
td {
  text-align: left;
  padding: 0.5rem;
  border-bottom: 1px solid #ccd9d6;
}
textarea {
  display: block;
  width: 100%;
  min-height: 5rem;
}
</style>
