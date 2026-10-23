<script setup lang="ts">
import { useWordlists } from '@/composables/useWordlists'
import WordlistConfirmation from '@/components/WordlistConfirmation.vue'
const props = defineProps<{ id: string }>()
const {
  busy,
  writing,
  error,
  notice,
  workspace,
  labels,
  load,
  loaded,
  heads,
  detail,
  detailBusy,
  status,
  confirmation,
  publish,
  canPublish,
  submit,
} = useWordlists(props.id)
</script>
<template>
  <main class="panel workflow">
    <h1>词单详情</h1>
    <nav class="workflow-actions" aria-label="词库页面导航">
      <RouterLink to="/wordlists">词单列表</RouterLink>
      <RouterLink to="/wordlists/drafts/new">创建草稿</RouterLink>
    </nav>
    <template v-if="workspace.allowed()">
      <p class="banner">发布将切换当前生效词库，提交前请核对分类和完整词条。</p>
      <p>
        创建使用分类基准，首次也须读取；词条为完整不可变快照。发布核对草稿资源版本、分类基准和创建时生效版，替代版本授权只读，不可直接重发。仅用于后续新扫描及正常重提，不自动全量重扫历史。
      </p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="notice" role="status">{{ notice }}</p>

      <button :disabled="busy || writing" @click="load">刷新词库</button>
      <p v-if="busy" role="status">正在读取词库版本…</p>
      <p v-if="detailBusy" role="status">正在读取完整词条…</p>
      <section v-if="detail" class="workflow-box" aria-label="词库只读详情">
        <h2>完整快照（只读）</h2>
        <p>
          {{ labels[detail.kind] }} · {{ detail.id }} · 资源版本 {{ detail.version }} ·
          {{ status(detail.status) }}
        </p>
        <p>创建时生效版 {{ detail.base_effective_id ?? '无' }}；归档不等于物理删除或无限期保留。</p>
        <p v-for="head in heads.filter((item) => item.kind === detail?.kind)" :key="head.kind">
          分类基准 {{ head.version }} · 当前生效版 {{ head.effective_id ?? '无' }}
        </p>
        <ul>
          <li v-for="(entry, index) in detail.entries" :key="index">{{ entry }}</li>
        </ul>
        <p v-if="!detail.entries.length">空词条快照</p>
        <button
          v-if="loaded && canPublish(detail)"
          :disabled="writing || !!confirmation"
          @click="publish(detail)"
        >
          发布 {{ detail.id }}
        </button>
        <p v-else-if="loaded && detail.status === 'draft'">
          创建基准已被替代，请基于当前生效版创建新快照。
        </p>
      </section>
      <WordlistConfirmation
        v-if="confirmation"
        :confirmation="confirmation"
        :writing="writing"
        :labels="labels"
        @submit="submit"
        @cancel="confirmation = null"
      />
    </template>
  </main>
</template>
