<script setup lang="ts">
import type { ReviewDetail } from '@/types/whispers'
import { whisperKindLabels, whisperStatusLabels } from '@/composables/useWhisperReviews'
defineProps<{
  detail: ReviewDetail | null
  selectedId: string
  loading: boolean
  error: string
  locked: boolean
  canDecide: boolean
  canEscalate: boolean
}>()
defineEmits<{ retry: []; close: []; process: [task: 'decision' | 'crisis'] }>()
</script>
<template>
  <section aria-label="树洞案件详情" :aria-busy="loading">
    <h2>案件详情</h2>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">正在读取案件…</p>
    <button v-if="selectedId && !loading" :disabled="locked" @click="$emit('retry')">
      重新读取案件
    </button>
    <template v-if="detail">
      <button :disabled="locked" @click="$emit('close')">关闭案件</button>
      <p>{{ whisperKindLabels[detail.source.kind] }} · {{ whisperStatusLabels[detail.status] }}</p>
      <p>
        {{ detail.id }} · 案件版本 {{ detail.version }} · 正文版本
        {{ detail.source.content_version }}
      </p>
      <p v-if="detail.source.kind === 'whisper_capsule'" class="banner">
        私密胶囊：仅因当前安全命中案件授权读取，请勿复制或传播正文。审核通过仍需满足解锁时间与安全条件。
      </p>
      <p v-if="detail.source.kind === 'whisper_nickname'">以下为当前命中版本的候选昵称。</p>
      <p v-if="detail.school_related" class="banner">
        涉及学校官方内容：未经证实。人工通过后仍以当前业务条件决定是否公开。
      </p>
      <p v-if="detail.privacy_recheck" class="banner">
        本案件需要隐私复核，内容通过不能替代隐私屏障检查。
      </p>
      <blockquote class="workflow-body">{{ detail.body }}</blockquote>
      <div class="workflow-actions">
        <button v-if="canDecide" :disabled="locked" @click="$emit('process', 'decision')">
          处理树洞审核
        </button>
        <button v-if="canEscalate" :disabled="locked" @click="$emit('process', 'crisis')">
          升级危机
        </button>
      </div>
      <p v-if="!canDecide && !canEscalate">当前案件只读，没有可执行的处理动作。</p>
    </template>
    <p v-else-if="!loading && !selectedId">选择案件，按需读取当前命中版本正文。</p>
  </section>
</template>
