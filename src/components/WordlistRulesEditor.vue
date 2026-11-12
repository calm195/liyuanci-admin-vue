<script setup lang="ts">
import { watch } from 'vue'
import { wordlistRuleCategories } from '@/types/wordlists'
import type { WordlistRule } from '@/types/wordlists'
const props = defineProps<{ allowHints: boolean }>()
const rules = defineModel<WordlistRule[]>({ required: true })
watch(
  () => props.allowHints,
  (allowed) => {
    if (!allowed) for (const rule of rules.value) rule.action = 'review'
  },
  { immediate: true },
)
function add() {
  rules.value = [
    ...rules.value,
    {
      entry: '',
      category: 'internet_slang',
      aliases: [],
      match_mode: 'contains',
      action: 'review',
    },
  ]
}
function aliases(index: number, event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return
  const rule = rules.value[index]
  if (rule)
    rule.aliases = [
      ...new Set(
        event.target.value
          .split(/[,，、]/u)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ]
}
</script>
<template>
  <section aria-label="词条匹配与处置规则">
    <h3>匹配与处置规则</h3>
    <p>
      为上方完整词条配置分类和变体。普通情绪表达可选择提示；短缩写建议使用完整词匹配，并在发布前试跑正反例。
    </p>
    <fieldset v-for="(rule, index) in rules" :key="index">
      <legend>规则 {{ index + 1 }}</legend>
      <label>完整快照中的词条<input v-model="rule.entry" maxlength="1000" required /></label>
      <label
        >运营分类<select v-model="rule.category">
          <option v-for="(label, code) in wordlistRuleCategories" :key="code" :value="code">
            {{ label }}
          </option>
        </select></label
      >
      <label
        >拼音缩写或变体，逗号分隔<input
          :value="rule.aliases.join('，')"
          @input="aliases(index, $event)"
      /></label>
      <label
        >匹配方式<select v-model="rule.match_mode">
          <option value="contains">包含匹配</option>
          <option value="word">完整词匹配</option>
        </select></label
      >
      <label
        >处置<select v-model="rule.action">
          <option value="hint" :disabled="!allowHints">提示（仅普通违规词库）</option>
          <option value="review">人工复核</option>
        </select></label
      >
      <button type="button" @click="rules = rules.filter((_, position) => position !== index)">
        移除规则
      </button>
    </fieldset>
    <button type="button" @click="add">添加词条规则</button>
  </section>
</template>
