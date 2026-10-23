<script setup lang="ts">
import { useWordlists } from '@/composables/useWordlists'

const {
  busy,
  writing,
  error,
  notice,
  workspace,
  labels,
  load,
  items,
  heads,
  loaded,
  status,
  canPublish,
} = useWordlists()
</script>
<template>
  <main class="panel workflow">
    <h1>词单列表</h1>
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
      <template v-if="loaded">
        <h2>分类基准与当前生效版</h2>
        <ul aria-label="词库基准">
          <li v-for="head in heads" :key="head.kind">
            {{ labels[head.kind] }} · 分类基准 {{ head.version }} · 生效版
            {{ head.effective_id ?? '无' }}
          </li>
        </ul>
        <h2>版本列表</h2>
        <p v-if="!items.length">暂无词库版本</p>
        <ul class="workflow-list">
          <li v-for="item in items" :key="item.id">
            {{ labels[item.kind] }} · {{ item.id }} · 资源版本 {{ item.version }} ·
            {{ status(item.status) }} · 创建时生效版 {{ item.base_effective_id ?? '无' }}
            <RouterLink :to="{ name: 'wordlist-detail', params: { id: item.id } }"
              >查看 {{ item.id }}</RouterLink
            >
            <p v-if="item.status === 'draft' && !canPublish(item)">
              创建基准已被替代，请基于当前生效版创建新快照。
            </p>
          </li>
        </ul>
      </template>
    </template>
  </main>
</template>
