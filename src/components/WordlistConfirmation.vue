<script setup lang="ts">
import type { Wordlist, WordlistInput, WordlistPublish, WordlistKind } from '@/types/wordlists'
defineProps<{
  confirmation: WordlistInput | { item: Wordlist; input: WordlistPublish }
  writing: boolean
  labels: Record<WordlistKind, string>
}>()
defineEmits<{ submit: []; cancel: [] }>()
</script>
<template>
  <section class="workflow-box" aria-label="词库操作确认">
    <h2>{{ 'entries' in confirmation ? '确认创建草稿' : '确认发布版本' }}</h2>
    <p>
      {{ labels['entries' in confirmation ? confirmation.kind : confirmation.item.kind] }}
    </p>
    <template v-if="'entries' in confirmation">
      <p>
        分类基准：{{ confirmation.expected_version }}；完整词条 {{ confirmation.entries.length }} 条
      </p>
      <ul>
        <li v-for="(entry, index) in confirmation.entries" :key="index">{{ entry }}</li>
      </ul>
      <p>创建后尚未发布，不改变当前生效版本。</p>
    </template>
    <p v-else>
      {{ confirmation.item.id }} · 草稿资源版本 {{ confirmation.input.expected_version }} · 分类基准
      {{ confirmation.input.expected_head_version }} · 创建时生效版
      {{ confirmation.item.base_effective_id ?? '无' }}；发布后归档旧生效版，不自动全量重扫历史。
    </p>
    <button :disabled="writing" @click="$emit('submit')">
      {{ writing ? '正在提交…' : '确认提交' }}
    </button>
    <button :disabled="writing" @click="$emit('cancel')">返回修改</button>
  </section>
</template>
