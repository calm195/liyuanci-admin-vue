<script setup lang="ts">
import type { IdentityCase } from '@/types/identity'
defineProps<{
  detail: IdentityCase | null
  selected: string
  status: string
  caseBusy: boolean
  cardBusy: boolean
  cardUrl: string
  caseError: string
  locked: boolean
}>()
defineEmits<{
  retry: []
  close: []
  showCard: []
  hideCard: []
  cardFailed: []
  process: []
}>()
</script>
<template>
  <section aria-labelledby="case-detail-title" :aria-busy="caseBusy">
    <h2 id="case-detail-title">案件详情</h2>
    <p v-if="caseBusy" role="status">正在读取案件…</p>
    <p v-if="caseError" role="alert">{{ caseError }}</p>
    <button v-if="selected && !detail && !caseBusy" @click="$emit('retry')">重试案件</button>
    <template v-if="detail">
      <div class="review-actions">
        <p>{{ detail.id }}</p>
        <button :disabled="locked" @click="$emit('close')">关闭案件</button>
      </div>
      <dl class="identity-fields">
        <dt>姓名</dt>
        <dd>{{ detail.name }}</dd>
        <dt>学号</dt>
        <dd>{{ detail.student_number }}</dd>
        <dt>状态</dt>
        <dd>{{ status }} · 版本 {{ detail.version }}</dd>
      </dl>
      <p class="muted">身份资料仅供当前授权案件使用，离开页面即清除。</p>
      <div class="review-actions">
        <button :disabled="cardBusy || locked" @click="$emit('showCard')">
          {{ cardBusy ? '正在读取…' : '查看学生卡' }}
        </button>
        <button v-if="cardUrl" @click="$emit('hideCard')">收起学生卡</button>
      </div>
      <img
        v-if="cardUrl"
        class="student-card"
        :src="cardUrl"
        alt="当前授权案件的学生卡"
        @error="$emit('cardFailed')"
      />
      <button v-if="detail.status === 'pending'" :disabled="locked" @click="$emit('process')">
        处理身份审核
      </button>
      <p v-else>当前案件不可再次审核。</p>
    </template>
    <p v-else-if="!caseBusy && !selected">选择一个案件，按需读取身份详情和学生卡。</p>
  </section>
</template>
<style scoped>
.review-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin: 1rem 0;
}
.identity-fields {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.5rem 1rem;
}
.identity-fields dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.muted {
  color: var(--text-secondary);
  font-size: 0.9rem;
}
.student-card {
  display: block;
  max-width: 100%;
  margin: 1rem 0;
  border-radius: 12px;
}
</style>
