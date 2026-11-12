<script setup lang="ts">
import { wordlistRuleCategories } from '@/types/wordlists'
import WordlistPreview from '@/components/WordlistPreview.vue'
import type { WordlistConfirmation, WordlistKind } from '@/types/wordlists'
defineProps<{
  confirmation: WordlistConfirmation
  writing: boolean
  labels: Record<WordlistKind, string>
}>()
defineEmits<{ submit: []; cancel: [] }>()
</script>
<template>
  <section class="workflow-box" aria-label="词库操作确认">
    <h2>
      {{
        'item' in confirmation
          ? '确认发布版本'
          : 'restore' in confirmation
            ? '确认恢复历史版本'
            : '确认创建草稿'
      }}
    </h2>
    <p>
      {{
        labels[
          'entries' in confirmation
            ? confirmation.kind
            : 'item' in confirmation
              ? confirmation.item.kind
              : 'restore' in confirmation
                ? confirmation.restore.kind
                : 'builtin'
        ]
      }}
    </p>
    <template v-if="'entries' in confirmation">
      <p>
        分类基准：{{ confirmation.expected_version }}；完整词条 {{ confirmation.entries.length }} 条
      </p>
      <ul>
        <li v-for="(entry, index) in confirmation.entries" :key="index">{{ entry }}</li>
      </ul>
      <ul v-if="confirmation.rules?.length">
        <li v-for="rule in confirmation.rules" :key="rule.entry">
          {{ rule.entry }} · {{ wordlistRuleCategories[rule.category] ?? rule.category }} ·
          {{ rule.match_mode === 'word' ? '完整词匹配' : '包含匹配' }} ·
          {{ rule.action === 'hint' ? '提示' : '人工复核' }}
          <span v-if="rule.aliases.length"> · 变体：{{ rule.aliases.join('、') }}</span>
        </li>
      </ul>
      <p>创建后尚未发布，不改变当前生效版本。</p>
    </template>
    <p v-else-if="'item' in confirmation">
      草稿资源版本 {{ confirmation.input.expected_version }} · 分类基准
      {{ confirmation.input.expected_head_version }} · 创建时生效版
      {{
        confirmation.item.base_effective_id ? '已有版本' : '无'
      }}；发布后归档旧生效版，不自动全量重扫历史。
    </p>
    <p v-else-if="'restore' in confirmation">
      将归档版 {{ confirmation.restore.id }} 复制为新草稿。当前生效版继续使用，直到新草稿发布。
    </p>
    <p v-else>将 {{ confirmation.builtin.overrides.length }} 条内置词条调整保存为草稿。</p>
    <WordlistPreview
      v-if="'item' in confirmation"
      :id="confirmation.item.id"
      :key="confirmation.item.id"
      :disabled="writing"
    />
    <button :disabled="writing" @click="$emit('submit')">
      {{ writing ? '正在提交…' : '确认提交' }}
    </button>
    <button :disabled="writing" @click="$emit('cancel')">返回修改</button>
  </section>
</template>
