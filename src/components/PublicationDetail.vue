<script setup lang="ts">
import ContentImages from '@/components/ContentImages.vue'
import type { ContentDetail } from '@/services/content-management'
import { displayBeijingTime } from '@/utils/admin-time'
const props = defineProps<{
  detail: ContentDetail
  wishes: boolean
  stateLabel: string
  commentsPage: number
  busy: boolean
}>()
defineEmits<{ page: [page: number] }>()
function replyAuthor(id: string) {
  return props.detail.comments.find((comment) => comment.id === id)?.author ?? '上文'
}
</script>

<template>
  <article>
    <div class="publication-stats" aria-label="互动统计">
      <div v-if="wishes && detail.supportCount !== undefined">
        <strong>{{ detail.supportCount }}</strong
        ><span>支持</span>
      </div>
      <div v-if="!wishes && detail.hugCount !== undefined">
        <strong>{{ detail.hugCount }}</strong
        ><span>抱抱</span>
      </div>
      <div v-if="wishes && detail.applicationCount !== undefined">
        <strong>{{ detail.applicationCount }}</strong
        ><span>应愿</span>
      </div>
      <div v-if="detail.commentCount !== undefined">
        <strong>{{ detail.commentCount }}</strong
        ><span>评论</span>
      </div>
      <div v-if="detail.viewCount !== undefined">
        <strong>{{ detail.viewCount }}</strong
        ><span>浏览</span>
      </div>
    </div>
    <section class="experience-section" :aria-label="wishes ? '许愿正文' : '正文'">
      <h3 class="publication-title">{{ detail.title || '暂无公开标题' }}</h3>
      <div class="publication-overview">
        <span class="experience-badge" :data-status="detail.state">{{ stateLabel }}</span
        ><span class="experience-muted">{{
          detail.original?.author || detail.requester || '匿名内容'
        }}</span>
      </div>
      <dl class="publication-dates">
        <template v-if="detail.publishedAt"
          ><dt>公开时间</dt>
          <dd>{{ displayBeijingTime(detail.publishedAt) }}</dd></template
        >
        <template v-if="detail.expiresAt"
          ><dt>到期时间</dt>
          <dd>{{ displayBeijingTime(detail.expiresAt) }}</dd></template
        >
        <template v-if="wishes && detail.matchedAt"
          ><dt>应愿时间</dt>
          <dd>{{ displayBeijingTime(detail.matchedAt) }}</dd></template
        >
      </dl>

      <template v-if="detail.original">
        <p v-if="detail.original.notice" class="banner">{{ detail.original.notice }}</p>
        <p class="publication-body">{{ detail.original.body }}</p>
        <ContentImages v-if="detail.original.images?.length" :images="detail.original.images" />
      </template>
      <p v-else class="experience-muted">暂无可公开正文。</p>
    </section>
    <section v-if="detail.story" class="experience-section">
      <h3>还愿故事</h3>
      <p v-if="detail.story.notice" class="banner">{{ detail.story.notice }}</p>
      <p class="publication-body">{{ detail.story.body }}</p>
    </section>
    <section v-if="detail.original" class="experience-section">
      <h3>评论与回复</h3>
      <p v-if="!detail.comments.length" class="experience-muted">当前页暂无公开评论。</p>
      <ol v-else class="publication-comments">
        <li
          v-for="(item, index) in detail.comments"
          :key="item.id ?? index"
          :class="{ 'publication-reply': item.rootId }"
        >
          <div class="publication-comment-heading">
            <strong>{{ item.author }}</strong
            ><span v-if="item.kind === 'author_supplement'" class="experience-badge">作者补充</span
            ><span v-else-if="item.rootId" class="experience-muted">楼内回复</span>
          </div>
          <p v-if="item.replyToId" class="experience-muted">
            回复 {{ replyAuthor(item.replyToId) }}
          </p>
          <p v-if="item.notice" class="banner">{{ item.notice }}</p>
          <p class="publication-body">{{ item.body }}</p>
        </li>
      </ol>
      <div v-if="commentsPage > 0 || detail.commentsMore" class="business-pagination">
        <button :disabled="busy || commentsPage === 0" @click="$emit('page', commentsPage - 1)">
          上一页评论
        </button>
        <span class="experience-muted">第 {{ commentsPage + 1 }} 页</span>
        <button :disabled="busy || !detail.commentsMore" @click="$emit('page', commentsPage + 1)">
          下一页评论
        </button>
      </div>
    </section>
  </article>
</template>

<style scoped>
.publication-stats + .experience-section {
  padding-top: 0;
}
.publication-overview {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}
.experience-section .publication-title {
  font-size: 20px;
  line-height: 30px;
  margin: 0 0 12px;
  overflow-wrap: anywhere;
}
.publication-stats {
  display: flex;
  gap: 16px;
  padding: 0 0 24px;
  margin: 0 0 24px;
  border-bottom: 1px solid var(--border-color);
}
.publication-stats:empty {
  display: none;
}
.publication-stats > div {
  display: flex;
  flex-direction: column-reverse;
  flex: 1;
  gap: 4px;
}
.publication-stats strong {
  font-size: 22px;
  line-height: 30px;
}
.publication-stats span {
  color: var(--text-secondary);
  font-size: 13px;
}
.publication-dates {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px 20px;
  font-size: 13px;
  margin-bottom: 16px;
}
.publication-dates dt {
  color: var(--text-secondary);
}
.publication-dates dd {
  margin: 0;
}
.publication-body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.9;
}
.publication-comments {
  list-style: none;
  margin: 0;
  padding: 0;
}
.publication-comments li {
  padding: 16px 0;
  border-bottom: 1px solid var(--border-color);
}
.publication-comments li:last-child {
  border-bottom: 0;
}
.publication-comments .publication-reply {
  margin-left: 20px;
  margin-block: 12px;
  padding: 12px 16px;
  border: 0;
  border-radius: 8px;
  background: var(--page-background);
}
.publication-comment-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
</style>
