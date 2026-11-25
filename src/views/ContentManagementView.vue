<script setup lang="ts">
import NumberedPagination from '@/components/NumberedPagination.vue'
import { useAutoSearch } from '@/composables/useAutoSearch'
import { useOperationFeedback } from '@/composables/useOperationFeedback'
import { computed } from 'vue'
import WorkspaceHeading from '@/components/WorkspaceHeading.vue'
import WorkspaceDrawer from '@/components/WorkspaceDrawer.vue'
import PublicationDetail from '@/components/PublicationDetail.vue'
import FloatingNotice from '@/components/FloatingNotice.vue'
import { useContentManagement } from '@/composables/useContentManagement'
import type { ContentKind } from '@/services/content-management'
import { displayBeijingTime } from '@/utils/admin-time'

const props = defineProps<{ kind: ContentKind }>()
const wishes = computed(() => props.kind === 'wishes')
const title = computed(() => (wishes.value ? '心愿内容' : '悄悄话内容'))
const states: Record<string, string> = {
  draft: '草稿',
  scanning: '扫描中',
  pending_review: '待审核',
  review_pending: '待审核',
  rejected: '已驳回',
  ready: '审核通过（历史待上架）',
  published: '已公开',
  matching: '应愿中',
  realized: '已实现',
  fulfilled: '已还愿',
  withdrawn: '已撤回',
  expired: '已过期',
  cancelled: '已取消',
  isolated: '已隔离',
  restricted: '受限',
}
const availableStates = computed(() =>
  wishes.value
    ? [
        'draft',
        'pending_review',
        'rejected',
        'ready',
        'published',
        'matching',
        'realized',
        'fulfilled',
        'withdrawn',
        'expired',
      ]
    : [
        'draft',
        'scanning',
        'review_pending',
        'rejected',
        'published',
        'withdrawn',
        'cancelled',
        'isolated',
        'restricted',
      ],
)
const {
  admin,
  workspace,
  draft,
  dirty,
  items,
  detail,
  selected,
  commentsPage,
  next,
  history,
  busy,
  error,
  notice,
  search,
  page,
  pageNumber,
  total,
  turn,
  open,
  close,
  download,
} = useContentManagement(() => props.kind)
const { feedback: readFeedback, run: runRead } = useOperationFeedback(() => Boolean(error.value))
const automaticSearch = useAutoSearch(search, () => workspace.allowed())
</script>

<template>
  <FloatingNotice
    v-if="readFeedback.message"
    :message="readFeedback.message"
    :tone="readFeedback.tone"
    :revision="readFeedback.revision"
  />
  <main class="panel workflow experience-page" :aria-label="title">
    <template v-if="workspace.allowed()">
      <WorkspaceHeading
        :title="title"
        :description="
          wishes
            ? '查看公开内容与互动上下文，按权限进行处理。'
            : '查看公开心事与暖心回应，守护匿名表达。'
        "
      />
      <section class="experience-panel experience-table-panel" aria-label="内容查询">
        <form
          id="content-management-filters"
          @input="automaticSearch.input"
          @change="automaticSearch.change"
          @compositionstart="automaticSearch.start"
          @compositionend="automaticSearch.end"
          @submit="automaticSearch.cancel"
          @submit.prevent="runRead(() => search(), '查询已完成')"
        >
          <div class="experience-filters">
            <label class="content-search"
              >公开标题或正文<input v-model="draft.keyword" maxlength="80"
            /></label>
            <label>
              状态
              <select v-model="draft.state">
                <option value="">全部</option>
                <option v-for="value in availableStates" :key="value" :value="value">
                  {{ states[value] }}
                </option>
              </select>
            </label>
            <button type="submit" class="business-primary">刷新</button>
          </div>
          <details class="content-advanced">
            <summary>更多筛选</summary>
            <div class="experience-filters">
              <template v-if="wishes">
                <label>许愿人昵称<input v-model="draft.requester" maxlength="80" /></label>
                <label>应愿人昵称<input v-model="draft.helper" maxlength="80" /></label>
              </template>
              <label>创建起始日期<input v-model="draft.from" type="date" /></label>
              <label>创建结束日期<input v-model="draft.until" type="date" /></label>
            </div>
          </details>
        </form>
        <FloatingNotice v-if="error" :message="error" tone="error">{{ error }}</FloatingNotice>
        <FloatingNotice v-if="notice" :message="notice" tone="info">{{ notice }}</FloatingNotice>
        <p v-if="busy" role="status">正在加载内容…</p>
        <p v-if="!busy && !error && !items.length" class="experience-empty">
          {{ next ? '当前页没有符合条件的内容，可继续查看下一页。' : '未找到符合条件的内容。' }}
        </p>
        <div v-if="items.length" class="business-table">
          <table>
            <thead>
              <tr>
                <th scope="col">公开标题</th>
                <th scope="col">状态</th>
                <th v-if="wishes" scope="col">许愿人</th>
                <th v-if="wishes" scope="col">应愿人</th>
                <th scope="col">创建时间</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in items" :key="item.id">
                <td>{{ item.title || '暂无公开标题' }}</td>
                <td>{{ states[item.state] ?? item.state }}</td>
                <td v-if="wishes">{{ item.requester || '—' }}</td>
                <td v-if="wishes">{{ item.helper || '—' }}</td>
                <td>{{ displayBeijingTime(item.createdAt) }}</td>
                <td><button type="button" @click="open(item.id)">查看详情</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <NumberedPagination
          v-if="total !== null"
          :page="pageNumber"
          :page-size="20"
          :total="total"
          :disabled="busy || dirty"
          fixed-size
          @turn="turn"
        />
        <div v-else class="business-pagination" aria-label="内容分页">
          <span class="experience-muted">按创建时间倒序 · 北京时间</span>
          <button type="button" :disabled="busy || dirty || !history.length" @click="page(false)">
            上一页
          </button>
          <span>第 {{ history.length + 1 }} 页</span>
          <button type="button" :disabled="busy || dirty || !next" @click="page(true)">
            下一页
          </button>
        </div>
      </section>
      <WorkspaceDrawer
        :open="!!selected"
        :title="wishes ? '心愿详情' : '悄悄话详情'"
        @close="close"
      >
        <p v-if="busy" role="status">正在读取内容…</p>
        <p v-if="error" role="alert" class="experience-inline-error">{{ error }}</p>
        <button v-if="selected && !detail && !busy" @click="open(selected)">重试详情</button>
        <PublicationDetail
          v-if="detail"
          :detail="detail"
          :wishes="wishes"
          :state-label="states[detail.state] ?? detail.state"
          :comments-page="commentsPage"
          :busy="busy"
          @page="open(detail.id, $event)"
        />
        <template #footer
          ><div class="drawer-actions">
            <button data-overlay-close @click="close">关闭详情</button>
            <button
              v-if="admin.can('super_admin') && detail"
              class="business-primary"
              :disabled="busy || !detail.exportable"
              @click="download"
            >
              导出公众号草稿（Markdown）
            </button>
          </div>
          <p
            v-if="detail && admin.can('super_admin') && !detail.exportable"
            class="experience-muted"
          >
            当前状态下暂无可导出的公开素材。
          </p>
          <p v-else-if="detail && !wishes && admin.can('super_admin')" class="experience-muted">
            草稿最多包含最早的 250 条公开评论。
          </p></template
        >
      </WorkspaceDrawer>
    </template>
  </main>
</template>

<style scoped>
img {
  max-width: 100%;
  max-height: 320px;
  object-fit: contain;
}
.publication-body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.content-search {
  flex: 1;
  min-width: 180px;
}
.content-advanced {
  margin-top: 16px;
  color: var(--text-secondary);
  font-size: 13px;
}
.content-advanced summary {
  cursor: pointer;
  width: fit-content;
}
.content-advanced .experience-filters {
  margin-top: 16px;
}
</style>
