<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useAdminStore } from '@/stores/admin'
import { useAdminWorkspace, reviewErrorMessage } from '@/composables/useAdminWorkspace'
import { readHotItems } from '@/services/dashboard'
import type { HotKind, HotItem } from '@/services/dashboard'

const props = defineProps<{ kind: HotKind; title: string; revision: number }>()
const admin = useAdminStore()
const items = ref<HotItem[]>([])
const busy = ref(false)
const error = ref('')
let request = new AbortController()
const workspace = useAdminWorkspace(() => {
  request.abort()
  items.value = []
  busy.value = false
  error.value = ''
}, null)

async function load() {
  request.abort()
  const current = new AbortController()
  request = current
  items.value = []
  busy.value = true
  error.value = ''
  await workspace.run(
    (signal) =>
      readHotItems(
        admin.session?.token ?? '',
        props.kind,
        AbortSignal.any([signal, current.signal]),
      ),
    (result) => {
      if (!current.signal.aborted) items.value = result
    },
    (cause) => {
      if (!current.signal.aborted) error.value = reviewErrorMessage(cause)
    },
    () => {
      if (!current.signal.aborted) busy.value = false
    },
  )
}
onMounted(load)
watch(() => props.revision, load)
</script>

<template>
  <section class="hot-list" :aria-label="title">
    <h2>{{ title }}</h2>
    <p v-if="busy" role="status">正在读取热点…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <p v-else-if="!items.length">最近七天暂无上榜内容</p>
    <ol v-else>
      <li v-for="item in items" :key="item.id">
        <strong>{{ item.title }}</strong>
        <p class="summary">{{ item.body }}</p>
        <small>
          热度 {{ item.heatScore }}
          <template v-if="item.supportCount !== undefined">
            · 支持 {{ item.supportCount }}</template
          >
        </small>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.hot-list {
  min-width: 0;
  padding: 1rem;
  border: 1px solid var(--line, #ddd);
  border-radius: 0.75rem;
}
.hot-list ol {
  padding-inline-start: 1.5rem;
}
.hot-list li + li {
  margin-block-start: 0.75rem;
}
.hot-list strong,
.summary {
  overflow-wrap: anywhere;
}
.summary {
  display: -webkit-box;
  overflow: hidden;
  margin: 0.2rem 0;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
</style>
