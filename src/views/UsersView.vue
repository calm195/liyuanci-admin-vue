<script setup lang="ts">
import NumberedPagination from '@/components/NumberedPagination.vue'
import PageSizeSelect from '@/components/PageSizeSelect.vue'
import { useAutoSearch } from '@/composables/useAutoSearch'
import { useOperationFeedback } from '@/composables/useOperationFeedback'
import { useUserDetail } from '@/composables/useUserDetail'
import { useDictionariesStore } from '@/stores/dictionaries'
import FloatingNotice from '@/components/FloatingNotice.vue'
import WorkspaceHeading from '@/components/WorkspaceHeading.vue'
import WorkspaceDrawer from '@/components/WorkspaceDrawer.vue'
import { computed } from 'vue'
import type { UserPenalty } from '@/types/users'
import UserRestrictionActions from '@/components/UserRestrictionActions.vue'
import { useUsers } from '@/composables/useUsers'
import { useAdminStore } from '@/stores/admin'
import { restrictions, verifications } from '@/types/users'
import { safetyRoles } from '@/types/safety'
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
const {
  selectedUser,
  detail,
  detailBusy,
  detailError,
  canViewPenalties,
  penalties,
  penaltyPage,
  nextPenaltyCursor,
  penaltyBusy,
  penaltyError,
  openUser,
  closeUser,
  turnPenalties,
} = useUserDetail()
const canAccessSafety = computed(() => safetyRoles.some((role) => admin.can(role)))
const penaltyTypes: Record<UserPenalty['kind'], string> = {
  warning: '警告',
  mute: '禁言',
  ban: '封禁',
}
const penaltyStatuses: Record<UserPenalty['status'], string> = {
  active: '生效中',
  expired: '已到期',
  revoked: '已撤销',
}
function penaltyStatus(penalty: UserPenalty) {
  return penalty.kind === 'warning' && penalty.status === 'active'
    ? '未撤销'
    : penaltyStatuses[penalty.status]
}
function penaltyEnd(penalty: UserPenalty) {
  if (penalty.ends_at) return displayBeijingTime(penalty.ends_at)
  return penalty.kind === 'ban' ? '无固定到期时间' : '—'
}
async function restrictionChanged() {
  if (selectedUser.value)
    await Promise.all([openUser(selectedUser.value), refreshRestrictions('限制状态已更新')])
}
function restrictionUserMissing() {
  closeUser()
  return refreshRestrictions('该用户已不可访问，列表已刷新')
}
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
    <WorkspaceHeading title="平台用户" description="按昵称、认证状态或限制状态查询。" />
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
                  <button
                    :aria-label="`查看${item.display_name ?? '未设置昵称'}的资料`"
                    @click="openUser(item.id)"
                  >
                    查看资料
                  </button>
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
        :open="!!selectedUser"
        :title="detail?.display_name ?? '用户资料'"
        @close="closeUser"
      >
        <p v-if="detailBusy" role="status">正在读取用户详情…</p>
        <template v-if="detailError">
          <FloatingNotice :message="detailError" tone="error">{{ detailError }}</FloatingNotice>
          <button v-if="selectedUser" @click="openUser(selectedUser)">重新读取用户详情</button>
        </template>
        <dl v-if="detail" class="experience-definition">
          <dt>昵称</dt>
          <dd>{{ detail.display_name ?? '未设置' }}</dd>
          <dt>认证状态</dt>
          <dd>{{ dictionaries.label('verification_status', detail.verification) }}</dd>
          <dt>当前限制</dt>
          <dd>{{ dictionaries.label('restriction_status', detail.restriction) }}</dd>
          <template v-if="detail.muted_until"
            ><dt>禁言至</dt>
            <dd>{{ displayBeijingTime(detail.muted_until) }}</dd></template
          >
          <dt>注册时间</dt>
          <dd>{{ displayBeijingTime(detail.created_at) }}</dd>
          <dt>查询快照时间</dt>
          <dd>{{ displayBeijingTime(detail.as_of) }}</dd>
        </dl>
        <UserRestrictionActions
          v-if="detail && admin.can('super_admin')"
          :key="detail.id"
          :user-id="detail.id"
          :display-name="detail.display_name ?? '未设置昵称'"
          :restriction="detail.restriction"
          @changed="restrictionChanged"
          @missing="restrictionUserMissing"
        />
        <section v-if="canViewPenalties" aria-label="处罚历史" :aria-busy="penaltyBusy">
          <h3>处罚历史</h3>
          <p v-if="penaltyBusy" role="status">正在读取处罚历史…</p>
          <template v-else-if="penaltyError">
            <FloatingNotice :message="penaltyError" tone="error">{{ penaltyError }}</FloatingNotice>
            <button @click="turnPenalties('first')">重新读取处罚历史</button>
          </template>
          <p v-else-if="!penalties.length" class="experience-empty">暂无可查看的处罚记录</p>
          <div v-else class="business-table">
            <table aria-label="处罚历史记录">
              <thead>
                <tr>
                  <th scope="col">处罚类型</th>
                  <th scope="col">状态</th>
                  <th scope="col">开始时间</th>
                  <th scope="col">到期时间</th>
                  <th scope="col">撤销时间</th>
                  <th scope="col">原因摘要</th>
                  <th scope="col">关联处理</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="penalty in penalties" :key="penalty.id">
                  <td>{{ penaltyTypes[penalty.kind] }}</td>
                  <td>{{ penaltyStatus(penalty) }}</td>
                  <td>{{ displayBeijingTime(penalty.starts_at) }}</td>
                  <td>{{ penaltyEnd(penalty) }}</td>
                  <td>{{ penalty.revoked_at ? displayBeijingTime(penalty.revoked_at) : '—' }}</td>
                  <td>{{ penalty.reason ?? '—' }}</td>
                  <td>
                    <div class="penalty-links">
                      <RouterLink
                        v-if="canAccessSafety && penalty.case_link?.kind === 'ordinary_report'"
                        :to="{ path: '/safety/reports', query: { report: penalty.case_link.id } }"
                        >查看举报</RouterLink
                      >
                      <RouterLink
                        v-if="
                          admin.can('review_operator') &&
                          penalty.case_link?.kind === 'ordinary_review'
                        "
                        :to="{ path: '/moderation', query: { case: penalty.case_link.id } }"
                        >查看审核</RouterLink
                      >
                      <RouterLink
                        v-if="canAccessSafety && penalty.appeal_id"
                        :to="{ path: '/safety/appeals', query: { appeal: penalty.appeal_id } }"
                        >查看申诉</RouterLink
                      >
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div
            v-if="!penaltyError && (penalties.length || penaltyPage > 1 || penaltyBusy)"
            class="business-pagination"
            role="group"
            aria-label="处罚历史分页"
          >
            <button :disabled="penaltyBusy || penaltyPage === 1" @click="turnPenalties('previous')">
              上一页
            </button>
            <span>第 {{ penaltyPage }} 页</span>
            <button :disabled="penaltyBusy || !nextPenaltyCursor" @click="turnPenalties('next')">
              下一页
            </button>
          </div>
        </section>
        <template #footer
          ><div class="drawer-actions">
            <button data-overlay-close @click="closeUser">关闭</button>
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
.penalty-links {
  display: flex;
  gap: 0.5rem;
  white-space: nowrap;
}
</style>
