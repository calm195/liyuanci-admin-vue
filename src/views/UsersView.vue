<script setup lang="ts">
import UserRestrictionActions from '@/components/UserRestrictionActions.vue'
import { ElDrawer } from 'element-plus'
import 'element-plus/theme-chalk/el-drawer.css'
import 'element-plus/theme-chalk/el-overlay.css'
import { useUsers } from '@/composables/useUsers'
import { useAdminStore } from '@/stores/admin'
import { restrictions, verifications } from '@/types/users'
const {
  draft,
  items,
  next,
  history,
  busy,
  error,
  dirty,
  selected,
  detail,
  loading,
  detailError,
  penalties,
  penaltyNext,
  penaltyHistory,
  penaltyBusy,
  penaltyError,
  workspace,
  search,
  page,
  open,
  close,
  loadPenalties,
  historyPage,
  navigate,
  refreshSelected,
} = useUsers()
const admin = useAdminStore()
const verificationLabels = {
  unverified: '未认证',
  pending: '待审核',
  verified: '已认证',
  rejected: '已驳回',
}
const restrictionLabels = { normal: '正常', muted: '禁言', banned: '封禁' }
const penaltyLabels = { warning: '警告', mute: '禁言', ban: '封禁' }
const statusLabels = { active: '有效记录', expired: '已到期', revoked: '已撤销' }
function time(value: string | null) {
  return value === null
    ? '—'
    : new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        dateStyle: 'medium',
        timeStyle: 'medium',
        hour12: false,
      }).format(new Date(value))
}
</script>
<template>
  <main class="panel workflow">
    <p class="eyebrow">用户管理</p>
    <h1>平台用户</h1>
    <template v-if="workspace.allowed()">
      <form class="user-filters" @submit.prevent="search">
        <label>用户 ID<input v-model="draft.user_id" autocomplete="off" /></label>
        <label>昵称关键词<input v-model="draft.nickname" autocomplete="off" /></label>
        <label
          >认证状态<select v-model="draft.verification">
            <option value="">全部</option>
            <option v-for="value in verifications" :key="value" :value="value">
              {{ verificationLabels[value] }}
            </option>
          </select></label
        >
        <label
          >限制状态<select v-model="draft.restriction">
            <option value="">全部</option>
            <option v-for="value in restrictions" :key="value" :value="value">
              {{ restrictionLabels[value] }}
            </option>
          </select></label
        >
        <label
          >每页数量<select v-model.number="draft.limit">
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
          </select></label
        >
        <button type="submit">查询 / 从首页刷新</button>
      </form>
      <p>昵称按当前普通资料包含匹配，最多50个字符；时间均为北京时间。</p>
      <p v-if="dirty">条件已修改，请重新查询后翻页。</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="busy" role="status">正在查询用户…</p>
      <p v-else-if="!error && !items.length">未找到符合条件的用户</p>
      <div v-else-if="items.length" class="users-table">
        <table>
          <caption>
            当前查询结果，按注册时间倒序
          </caption>
          <thead>
            <tr>
              <th scope="col">昵称 / 用户 ID</th>
              <th scope="col">认证状态</th>
              <th scope="col">当前限制</th>
              <th scope="col">注册时间</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id">
              <td>
                {{ item.display_name ?? '未设置' }}<br /><small>{{ item.id }}</small>
              </td>
              <td>{{ verificationLabels[item.verification] }}</td>
              <td>
                {{ restrictionLabels[item.restriction]
                }}<span v-if="item.muted_until"><br />至 {{ time(item.muted_until) }}</span>
              </td>
              <td>{{ time(item.created_at) }}</td>
              <td>
                <button :aria-label="`查看用户 ${item.id}`" @click="open(item.id)">查看详情</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="workflow-actions">
        <button :disabled="busy || dirty || !history.length" @click="page(false)">上一页</button
        ><button :disabled="busy || dirty || !next" @click="page(true)">下一页</button>
      </div>
      <ElDrawer
        :model-value="!!selected"
        title="用户详情"
        size="min(48rem, 100vw)"
        :close-on-click-modal="false"
        @close="close"
      >
        <button @click="close">关闭详情</button>
        <p v-if="loading" role="status">正在读取用户详情…</p>
        <p v-if="detailError" role="alert">{{ detailError }}</p>
        <button v-if="detailError" @click="open(selected)">重试详情</button>
        <template v-if="detail">
          <h2>{{ detail.display_name ?? '未设置' }}</h2>
          <p>{{ detail.id }}</p>
          <p>
            {{ verificationLabels[detail.verification] }} ·
            {{ restrictionLabels[detail.restriction] }}
            <span v-if="detail.muted_until">至 {{ time(detail.muted_until) }}</span>
          </p>
          <p>状态查询时间：{{ time(detail.as_of) }}</p>
          <UserRestrictionActions
            v-if="admin.can('super_admin')"
            :key="detail.id"
            :user-id="detail.id"
            @changed="refreshSelected"
            @missing="refreshSelected"
          />
          <h3>可见的有效限制</h3>
          <p v-if="!detail.active_penalties.length">
            暂无当前权限下可见的有效处罚摘要；账号限制以以上状态为准。
          </p>
          <ul v-else>
            <li v-for="item in detail.active_penalties" :key="item.id">
              {{ penaltyLabels[item.kind] }} · {{ time(item.starts_at) }} 至
              {{ time(item.ends_at) }}
            </li>
          </ul>
          <div class="workflow-actions">
            <button
              v-if="detail.allowed_actions.includes('open_case_workspace')"
              @click="navigate('/safety/reports')"
            >
              进入案件工作台</button
            ><button
              v-if="detail.allowed_actions.includes('open_appeal_workspace')"
              @click="navigate('/safety/appeals')"
            >
              进入申诉工作台
            </button>
          </div>
          <section
            v-if="detail.allowed_actions.includes('view_penalties')"
            aria-label="处罚历史"
            :aria-busy="penaltyBusy"
          >
            <h3>权限范围内的处罚历史</h3>
            <p v-if="penaltyBusy" role="status">正在读取处罚历史…</p>
            <p v-else-if="penaltyError" role="alert">{{ penaltyError }}</p>
            <button v-if="penaltyError" @click="loadPenalties">重试处罚历史</button>
            <p v-else-if="!penaltyBusy && !penalties.length">暂无可见处罚记录</p>
            <ul class="workflow-list">
              <li v-for="item in penalties" :key="item.id">
                <p>
                  {{ penaltyLabels[item.kind] }} · {{ statusLabels[item.status] }} ·
                  {{ item.reason ?? '无安全摘要' }}
                </p>
                <p>{{ time(item.starts_at) }} 至 {{ time(item.ends_at) }}</p>
                <button
                  v-if="item.case_link?.kind === 'ordinary_report'"
                  @click="navigate('/safety/penalties', { report: item.case_link.id })"
                >
                  查看普通举报案件
                </button>
                <template
                  v-if="item.case_link?.kind === 'ordinary_review' && admin.can('review_operator')"
                  ><p>审核任务编号：{{ item.case_link.id }}，进入工作台后按编号选择。</p>
                  <button @click="navigate('/moderation')">进入内容审核</button></template
                >
                <button
                  v-if="item.appeal_id"
                  @click="navigate('/safety/appeals', { appeal: item.appeal_id })"
                >
                  查看申诉
                </button>
              </li>
            </ul>
            <div class="workflow-actions">
              <button :disabled="penaltyBusy || !penaltyHistory.length" @click="historyPage(false)">
                历史上一页</button
              ><button :disabled="penaltyBusy || !penaltyNext" @click="historyPage(true)">
                历史下一页
              </button>
            </div>
          </section>
        </template>
      </ElDrawer>
    </template>
    <p v-else role="alert">当前会话无权查看平台用户，请重新登录或联系管理员。</p>
  </main>
</template>
<style scoped>
.user-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: end;
}
.user-filters label {
  display: grid;
  gap: 0.4rem;
}
input,
select {
  padding: 0.65rem;
  font: inherit;
  max-width: 100%;
}
.users-table {
  overflow-x: auto;
}
table {
  min-width: 48rem;
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  padding: 0.8rem;
  text-align: left;
  border-bottom: 1px solid var(--control-border);
}
small {
  overflow-wrap: anywhere;
}
</style>
