<script setup lang="ts">
import NumberedPagination from '@/components/NumberedPagination.vue'
import PageSizeSelect from '@/components/PageSizeSelect.vue'
import { useAutoSearch } from '@/composables/useAutoSearch'
import { useOperationFeedback } from '@/composables/useOperationFeedback'
import { useDictionariesStore } from '@/stores/dictionaries'
import FloatingNotice from '@/components/FloatingNotice.vue'
import WorkspaceHeading from '@/components/WorkspaceHeading.vue'
import WorkspaceDrawer from '@/components/WorkspaceDrawer.vue'
import { ref, watch } from 'vue'
import type { UserSummary } from '@/types/users'
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
  pageNumber,
  total,
  turn,
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
const selected = ref<UserSummary | null>(null)
watch(
  [items, () => admin.session, () => admin.forbidden],
  () => {
    selected.value = null
  },
  { flush: 'sync' },
)
const { feedback: readFeedback, run: runRead } = useOperationFeedback(() => Boolean(error.value))
const automaticSearch = useAutoSearch(search, () => workspace.allowed())
function resizePage(size: number) {
  draft.limit = size
  return search()
}
</script>
<template>
  <FloatingNotice
    v-if="readFeedback.message"
    :message="readFeedback.message"
    :tone="readFeedback.tone"
    :revision="readFeedback.revision"
  />
  <main class="experience-page" aria-label="平台用户">
    <WorkspaceHeading title="平台用户" description="按账号 ID、昵称或状态查询。" />
    <template v-if="workspace.allowed()">
      <section class="experience-panel experience-table-panel">
        <form
          id="user-filters"
          class="experience-filters"
          @input="automaticSearch.input"
          @change="automaticSearch.change"
          @compositionstart="automaticSearch.start"
          @compositionend="automaticSearch.end"
          @submit="automaticSearch.cancel"
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
          <button type="submit" :disabled="busy">刷新</button>
        </form>
        <FloatingNotice v-if="error" :message="error" tone="error">{{ error }}</FloatingNotice>
        <FloatingNotice v-if="notice" :message="notice" tone="info">{{ notice }}</FloatingNotice>
        <p v-if="busy" role="status">正在查询用户…</p>
        <p v-else-if="!error && !items.length" class="experience-empty">未找到符合条件的用户</p>
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
                <th scope="col">操作</th>
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
                <td>
                  <button @click="selected = item">查看资料</button>
                  <UserRestrictionActions
                    v-if="admin.can('super_admin')"
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
        <NumberedPagination
          v-if="total !== null"
          :page="pageNumber"
          :total="total"
          :page-size="draft.limit"
          :disabled="busy || dirty"
          @turn="turn"
          @resize="resizePage"
        />
        <div v-else class="business-pagination" role="group" aria-label="分页操作">
          <PageSizeSelect v-model="draft.limit" :disabled="busy" @change="search" />
          <button :disabled="busy || dirty || !history.length" @click="page(false)">上一页</button
          ><button :disabled="busy || dirty || !next" @click="page(true)">下一页</button>
        </div>
      </section>
      <WorkspaceDrawer
        :open="!!selected"
        :title="selected?.display_name ?? '用户资料'"
        @close="selected = null"
      >
        <dl v-if="selected" class="experience-definition">
          <dt>昵称</dt>
          <dd>{{ selected.display_name ?? '未设置' }}</dd>
          <dt>认证状态</dt>
          <dd>{{ dictionaries.label('verification_status', selected.verification) }}</dd>
          <dt>当前限制</dt>
          <dd>{{ dictionaries.label('restriction_status', selected.restriction) }}</dd>
          <template v-if="selected.muted_until"
            ><dt>禁言至</dt>
            <dd>{{ displayBeijingTime(selected.muted_until) }}</dd></template
          >
          <dt>注册时间</dt>
          <dd>{{ displayBeijingTime(selected.created_at) }}</dd>
          <dt>查询快照时间</dt>
          <dd>{{ displayBeijingTime(selected.as_of) }}</dd>
        </dl>
        <template #footer
          ><div class="drawer-actions">
            <button data-overlay-close @click="selected = null">关闭</button>
          </div></template
        >
      </WorkspaceDrawer>
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
