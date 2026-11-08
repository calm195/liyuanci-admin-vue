<script setup lang="ts">
import { useOperationFeedback } from '@/composables/useOperationFeedback'
import FloatingNotice from '@/components/FloatingNotice.vue'
import { computed, ref } from 'vue'
import WordlistMatches from '@/components/WordlistMatches.vue'
import { createWordlistTransport } from '@/services/content-transport'
import { reviewErrorMessage, useAdminWorkspace } from '@/composables/useAdminWorkspace'
import { useAdminStore } from '@/stores/admin'
import type { WordlistMatch, WordlistPreview } from '@/types/wordlists'

const props = defineProps<{ id: string; disabled: boolean }>()
const text = ref('')
const submitted = ref('')
const result = ref<WordlistPreview | null>(null)
function matchKey({ word, source, kind, label, disposition, start, end }: WordlistMatch) {
  return JSON.stringify([word, source, kind, label, disposition, start, end])
}
const differences = computed(() => {
  if (!result.value) return null
  const { effective, draft } = result.value
  const effectiveKeys = new Set(effective.matches.map(matchKey))
  const draftKeys = new Set(draft.matches.map(matchKey))
  return {
    added: draft.matches.filter((match) => !effectiveKeys.has(matchKey(match))),
    removed: effective.matches.filter((match) => !draftKeys.has(matchKey(match))),
  }
})
const busy = ref(false)
const error = ref('')
const workspace = useAdminWorkspace(() => {
  text.value = ''
  submitted.value = ''
  result.value = null
  busy.value = false
  error.value = ''
})
const client = createWordlistTransport(useAdminStore().session?.token ?? '', workspace.allowed)
const routes: Record<string, string> = {
  crisis: '危机',
  school: '涉校',
  ordinary_violation: '普通违规',
}
async function run() {
  const sample = text.value
  if (busy.value || props.disabled || !sample.trim()) return
  busy.value = true
  error.value = ''
  result.value = null
  await workspace.run(
    (signal) => client.preview(props.id, sample, signal),
    (value) => {
      submitted.value = sample
      result.value = value
    },
    (cause) => {
      error.value = reviewErrorMessage(cause)
    },
    () => {
      busy.value = false
    },
  )
}
const { feedback: readFeedback, run: runRead } = useOperationFeedback(() => Boolean(error.value))
</script>

<template>
  <FloatingNotice
    v-if="readFeedback.message"
    :message="readFeedback.message"
    :tone="readFeedback.tone"
    :revision="readFeedback.revision"
  />
  <section aria-label="发布前试跑">
    <h3>发布前试跑</h3>
    <p>
      用同一份测试文本对照生效版和草稿版，查看命中及预计审核流转。私信和胶囊中的涉校命中按普通复核处理。
    </p>
    <form @submit.prevent="runRead(() => run(), '查询已完成')">
      <fieldset :disabled="busy || disabled">
        <label>
          测试文本
          <textarea v-model="text" rows="3" maxlength="4000" required />
        </label>
        <button type="submit" :disabled="!text.trim()">
          {{ busy ? '正在试跑…' : '运行试跑' }}
        </button>
      </fieldset>
    </form>
    <FloatingNotice v-if="error" :message="error" tone="error">{{ error }}</FloatingNotice>
    <div v-if="result && differences && text === submitted" aria-live="polite">
      <p v-if="result.effective.truncated || result.draft.truncated">
        命中结果超过展示上限，差异仅基于已返回的命中记录。
      </p>
      <p>
        相对当前生效版新增 {{ differences.added.length }} 条、消失
        {{ differences.removed.length }} 条。
      </p>
      <details v-if="differences.added.length || differences.removed.length">
        <summary>查看命中差异</summary>
        <h4>新增命中</h4>
        <WordlistMatches :matches="differences.added" :body="submitted" />
        <h4>消失命中</h4>
        <WordlistMatches :matches="differences.removed" :body="submitted" />
      </details>
      <section v-for="version in ['effective', 'draft'] as const" :key="version">
        <h4>{{ version === 'effective' ? '当前生效版' : '待发布草稿' }}</h4>
        <p>
          预计流转
          {{
            result[version].routes.map((route) => routes[route] ?? route).join('、') || '无复核流转'
          }}
        </p>
        <WordlistMatches :matches="result[version].matches" :body="submitted" />
      </section>
    </div>
  </section>
</template>
