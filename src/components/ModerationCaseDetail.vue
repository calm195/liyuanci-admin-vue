<script setup lang="ts">
import type { ModerationCase } from '@/types/moderation'
defineProps<{
  detail: ModerationCase | null
  selectedId: string
  loading: boolean
  error: string
  status: string
  locked: boolean
  canEscalate: boolean
}>()
defineEmits<{ retry: []; close: []; process: [task: 'decision' | 'crisis'] }>()
</script>
<template>
  <section aria-label="案件详情" :aria-busy="loading">
    <h2>案件详情</h2>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">正在读取案件…</p>
    <button v-if="selectedId && !detail && !loading" @click="$emit('retry')">重试案件</button>
    <template v-if="detail">
      <button :disabled="locked" @click="$emit('close')">关闭案件</button>
      <p>
        {{ detail.id }} · 案件版本 {{ detail.version }} · 正文版本
        {{ detail.content_version }}
      </p>
      <p v-if="detail.school_related === true" class="banner">
        本正文版本涉及学校官方内容：未经证实；仅同版本人工通过后才可按业务条件公开并保留提示。
      </p>
      <p v-else-if="detail.school_related === undefined">
        此响应未提供涉校标记，不据此判断是否涉校。
      </p>
      <blockquote class="workflow-body">{{ detail.body }}</blockquote>
      <p>{{ status }}</p>
      <button v-if="canEscalate" :disabled="locked" @click="$emit('process', 'crisis')">
        升级危机
      </button>
      <button
        v-if="detail.status === 'human_required'"
        :disabled="locked"
        @click="$emit('process', 'decision')"
      >
        处理内容审核
      </button>
      <p v-else>当前状态只读，不能直接再次操作。</p>
    </template>
    <p v-else-if="!loading && !selectedId">选择案件，按需读取精确版本正文。</p>
  </section>
</template>
