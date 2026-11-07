<script setup lang="ts">
import FloatingNotice from '@/components/FloatingNotice.vue'
import LocalPagination from '@/components/LocalPagination.vue'
import { useLocalPagination } from '@/composables/useLocalPagination'
import { computed, ref } from 'vue'
import { useWordlists } from '@/composables/useWordlists'
import type { WordlistKind } from '@/types/wordlists'

const { items, heads, busy, error, workspace, labels, load, status } = useWordlists()
const filter = ref<WordlistKind | ''>('')
const rows = computed(() =>
  items.value.filter((item) => !filter.value || item.kind === filter.value),
)
const { pageSize, page, pages, pageRows } = useLocalPagination(rows)
</script>

<template>
  <main class="panel workflow" aria-label="词库发布记录">
    <template v-if="workspace.allowed()">
      <h2>发布记录</h2>
      <p>查看草稿、生效版和归档版。可将归档版本恢复为新草稿，试跑并确认发布。</p>
      <FloatingNotice v-if="error" :message="error" tone="error">{{ error }}</FloatingNotice>
      <p v-if="busy" role="status">正在读取词库版本…</p>
      <div class="business-filters">
        <label>
          词库
          <select v-model="filter">
            <option value="">全部</option>
            <option v-for="head in heads" :key="head.kind" :value="head.kind">
              {{ labels[head.kind] }}
            </option>
          </select>
        </label>
        <button type="button" :disabled="busy" @click="load">刷新发布记录</button>
      </div>
      <p v-if="!busy && !rows.length">暂无版本记录</p>
      <div v-else-if="rows.length" class="business-table">
        <table>
          <thead>
            <tr>
              <th scope="col">词库</th>
              <th scope="col">状态</th>
              <th scope="col">资源版本</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in pageRows" :key="item.id">
              <th scope="row">{{ labels[item.kind] }}</th>
              <td>{{ status(item.status) }}</td>
              <td>{{ item.version }} · {{ item.id }}</td>
              <td>
                <RouterLink :to="{ name: 'wordlist-detail', params: { id: item.id } }">
                  {{ item.status === 'archived' ? '查看或恢复' : '查看版本' }}
                </RouterLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <LocalPagination
        v-model:page="page"
        v-model:size="pageSize"
        :pages="pages"
        :disabled="busy"
      />
    </template>
  </main>
</template>
