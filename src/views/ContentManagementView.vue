<script setup lang="ts">
import { computed } from 'vue'
import BusinessToolbar from '@/components/BusinessToolbar.vue'
import FloatingNotice from '@/components/FloatingNotice.vue'
import { useContentManagement } from '@/composables/useContentManagement'
import type { ContentKind } from '@/services/content-management'
import { displayBeijingTime } from '@/utils/admin-time'

const props = defineProps<{ kind: ContentKind }>()
const wishes = computed(() => props.kind === 'wishes')
const title = computed(() => (wishes.value ? '心愿管理' : '悄悄话管理'))
const states: Record<string, string> = {
  draft: '草稿',
  scanning: '扫描中',
  pending_review: '待审核',
  review_pending: '待审核',
  rejected: '已驳回',
  ready: '待上架',
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
  open,
  close,
  download,
} = useContentManagement(() => props.kind)
</script>

<template>
  <main class="panel workflow" :aria-label="title">
    <template v-if="workspace.allowed()">
      <form id="content-management-filters" class="business-filters" @submit.prevent="search">
        <label>公开标题或正文<input v-model="draft.keyword" maxlength="80" /></label>
        <label>
          状态
          <select v-model="draft.state">
            <option value="">全部</option>
            <option v-for="value in availableStates" :key="value" :value="value">
              {{ states[value] }}
            </option>
          </select>
        </label>
        <template v-if="wishes">
          <label>许愿人昵称<input v-model="draft.requester" maxlength="80" /></label>
          <label>应愿人昵称<input v-model="draft.helper" maxlength="80" /></label>
        </template>
        <label>创建起始日期<input v-model="draft.from" type="date" /></label>
        <label>创建结束日期<input v-model="draft.until" type="date" /></label>
      </form>
      <BusinessToolbar :label="`${title}操作栏`">
        <template #tools>
          <button type="submit" form="content-management-filters">查询 / 从首页刷新</button>
        </template>
      </BusinessToolbar>
      <p v-if="dirty">条件已修改，请重新查询后翻页。</p>
      <FloatingNotice v-if="error" :message="error" tone="error">{{ error }}</FloatingNotice>
      <FloatingNotice v-if="notice" :message="notice" tone="info">{{ notice }}</FloatingNotice>
      <p v-if="busy" role="status">正在加载内容…</p>
      <p v-if="!busy && !error && !items.length">
        {{ next ? '当前页没有符合条件的内容，可继续查看下一页。' : '未找到符合条件的内容。' }}
      </p>
      <div v-if="items.length" class="business-table">
        <table>
          <caption>
            查询结果按创建时间倒序，时间均为北京时间
          </caption>
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
      <div v-if="history.length || next" class="row">
        <button type="button" :disabled="busy || dirty || !history.length" @click="page(false)">
          上一页
        </button>
        <button type="button" :disabled="busy || dirty || !next" @click="page(true)">下一页</button>
      </div>
      <section v-if="selected" class="workflow" aria-label="内容详情">
        <div class="row">
          <h2>{{ wishes ? '心愿故事链路' : '悄悄话详情' }}</h2>
          <button type="button" @click="close">关闭详情</button>
        </div>
        <template v-if="detail">
          <h3>{{ detail.title || '暂无公开标题' }}</h3>
          <p>状态 {{ states[detail.state] ?? detail.state }}</p>
          <p v-if="wishes">
            许愿人 {{ detail.requester || '—' }}，应愿人 {{ detail.helper || '—' }}
          </p>
          <p v-if="detail.matchedAt">应愿时间 {{ displayBeijingTime(detail.matchedAt) }}</p>
          <p v-if="detail.publishedAt">公开时间 {{ displayBeijingTime(detail.publishedAt) }}</p>
          <section v-if="detail.original">
            <h4>{{ wishes ? '许愿正文' : '正文' }}</h4>
            <p v-if="detail.original.author">{{ detail.original.author }}</p>
            <p v-if="detail.original.notice">{{ detail.original.notice }}</p>
            <p class="publication-body">{{ detail.original.body }}</p>
          </section>
          <p v-else>暂无可公开正文。</p>
          <section v-if="detail.story">
            <h4>还愿故事</h4>
            <p v-if="detail.story.notice">{{ detail.story.notice }}</p>
            <p class="publication-body">{{ detail.story.body }}</p>
          </section>
          <section v-if="!wishes && detail.original">
            <h4>公开评论</h4>
            <p v-if="!detail.comments.length">当前页暂无公开评论。</p>
            <ul v-else>
              <li v-for="(item, index) in detail.comments" :key="index">
                <p>{{ item.author }}</p>
                <p v-if="item.notice">{{ item.notice }}</p>
                <p class="publication-body">{{ item.body }}</p>
              </li>
            </ul>
            <div v-if="commentsPage > 0 || detail.commentsMore" class="row">
              <button
                type="button"
                :disabled="busy || commentsPage === 0"
                @click="open(detail.id, commentsPage - 1)"
              >
                上一页评论
              </button>
              <button
                type="button"
                :disabled="busy || !detail.commentsMore"
                @click="open(detail.id, commentsPage + 1)"
              >
                下一页评论
              </button>
            </div>
          </section>
          <div v-if="admin.can('super_admin')">
            <button type="button" :disabled="busy || !detail.exportable" @click="download">
              导出公众号草稿（Markdown）
            </button>
            <p v-if="!detail.exportable">当前状态下暂无可导出的公开素材。</p>
            <p v-else-if="!wishes">草稿最多包含最早的 250 条公开评论。</p>
          </div>
        </template>
      </section>
    </template>
  </main>
</template>

<style scoped>
.publication-body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
