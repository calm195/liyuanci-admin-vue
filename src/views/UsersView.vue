<script setup lang="ts">
import { useOperationFeedback } from '@/composables/useOperationFeedback'
import { useDictionariesStore } from '@/stores/dictionaries'
import FloatingNotice from '@/components/FloatingNotice.vue'
import BusinessToolbar from '@/components/BusinessToolbar.vue'
import UserRestrictionActions from '@/components/UserRestrictionActions.vue'
import { useUsers } from '@/composables/useUsers'
import { useAdminStore } from '@/stores/admin'
import { restrictions, verifications } from '@/types/users'
import { displayBeijingTime } from '@/utils/admin-time'
const {
  draft,
  items,
  next,
  history,
  busy,
  error,
  notice,
  dirty,
  workspace,
  search,
  page,
  refreshRestrictions,
} = useUsers()
const admin = useAdminStore()
const dictionaries = useDictionariesStore()
const { feedback: readFeedback, run: runRead } = useOperationFeedback(() => Boolean(error.value))
</script>
<template>
  <FloatingNotice
    v-if="readFeedback.message"
    :message="readFeedback.message"
    :tone="readFeedback.tone"
    :revision="readFeedback.revision"
  />
  <main class="panel workflow" aria-label="平台用户">
    <template v-if="workspace.allowed()">
      <form
        id="user-filters"
        class="business-filters"
        @submit.prevent="runRead(() => search(), '查询已完成')"
      >
        <label>用户 ID<input v-model="draft.user_id" type="password" autocomplete="off" /></label>
        <label>昵称关键词<input v-model="draft.nickname" autocomplete="off" /></label>
        <label
          >认证状态<select v-model="draft.verification">
            <option value="">全部</option>
            <option v-for="value in verifications" :key="value" :value="value">
              {{ dictionaries.label('verification_status', value) }}
            </option>
          </select></label
        >
        <label
          >限制状态<select v-model="draft.restriction">
            <option value="">全部</option>
            <option v-for="value in restrictions" :key="value" :value="value">
              {{ dictionaries.label('restriction_status', value) }}
            </option>
          </select></label
        >
        <label
          >每页数量<select v-model.number="draft.limit" :disabled="busy" @change="search">
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
          </select></label
        >
      </form>
      <BusinessToolbar label="平台用户操作栏">
        <template #tools>
          <button type="submit" form="user-filters">查询 / 从首页刷新</button>
        </template>
      </BusinessToolbar>
      <p>昵称按当前普通资料包含匹配，最多50个字符；时间均为北京时间。</p>
      <p v-if="dirty">条件已修改，请重新查询后翻页。</p>
      <FloatingNotice v-if="error" :message="error" tone="error">{{ error }}</FloatingNotice>
      <FloatingNotice v-if="notice" :message="notice" tone="info">{{ notice }}</FloatingNotice>
      <p v-if="busy" role="status">正在查询用户…</p>
      <p v-else-if="!error && !items.length">未找到符合条件的用户</p>
      <div v-else-if="items.length" class="business-table">
        <table>
          <caption>
            当前查询结果，按注册时间倒序
          </caption>
          <thead>
            <tr>
              <th scope="col">昵称</th>
              <th scope="col">认证状态</th>
              <th scope="col">当前限制</th>
              <th scope="col">注册时间</th>
              <th v-if="admin.can('super_admin')" scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id">
              <td>
                {{ item.display_name ?? '未设置' }}
              </td>
              <td>{{ dictionaries.label('verification_status', item.verification) }}</td>
              <td>
                {{ dictionaries.label('restriction_status', item.restriction)
                }}<span v-if="item.muted_until"
                  ><br />至 {{ displayBeijingTime(item.muted_until) }}</span
                >
              </td>
              <td>{{ displayBeijingTime(item.created_at) }}</td>
              <td v-if="admin.can('super_admin')">
                <UserRestrictionActions
                  :user-id="item.id"
                  :display-name="item.display_name ?? '未设置昵称'"
                  :restriction="item.restriction"
                  @changed="refreshRestrictions('限制状态已更新')"
                  @missing="refreshRestrictions('该用户已不可访问，列表已刷新')"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="business-pagination" role="group" aria-label="分页操作">
        <button :disabled="busy || dirty || !history.length" @click="page(false)">上一页</button
        ><button :disabled="busy || dirty || !next" @click="page(true)">下一页</button>
      </div>
    </template>
    <p v-else role="alert">当前会话无权查看平台用户，请重新登录或联系管理员。</p>
  </main>
</template>
<style scoped>
input,
select {
  padding: 0.65rem;
  font: inherit;
  max-width: 100%;
}
</style>
