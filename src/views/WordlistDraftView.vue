<script setup lang="ts">
import { useWordlists } from '@/composables/useWordlists'
import { wordlistKinds } from '@/types/wordlists'
import WordlistConfirmation from '@/components/WordlistConfirmation.vue'
const {
  busy,
  writing,
  error,
  notice,
  resultId,
  workspace,
  labels,
  load,
  loaded,
  kind,
  base,
  text,
  confirmation,
  prepare,
  submit,
} = useWordlists()
</script>
<template>
  <main class="panel workflow">
    <h1>创建词单草稿</h1>
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
      <RouterLink v-if="resultId" :to="{ name: 'wordlist-detail', params: { id: resultId } }"
        >查看新草稿 {{ resultId }}</RouterLink
      >

      <button :disabled="busy || writing" @click="load">刷新词库</button>
      <p v-if="busy" role="status">正在读取词库版本…</p>
      <template v-if="loaded">
        <form @submit.prevent="prepare">
          <fieldset :disabled="writing || !!confirmation">
            <legend>创建完整版本</legend>
            <label for="wordlist-kind">分类</label>
            <select id="wordlist-kind" v-model="kind">
              <option v-for="value in wordlistKinds" :key="value" :value="value">
                {{ labels[value] }}
              </option>
            </select>
            <p>
              分类创建基准：{{ base?.version ?? '未读取' }} · 当前生效版
              {{ base?.effective_id ?? '无' }}
            </p>
            <label for="wordlist-entries">完整词条，每行一条；空输入表示空版本</label>
            <textarea id="wordlist-entries" v-model="text" rows="5"></textarea>
            <button type="submit">核对草稿</button>
          </fieldset>
        </form>
        <WordlistConfirmation
          v-if="confirmation"
          :confirmation="confirmation"
          :writing="writing"
          :labels="labels"
          @submit="submit"
          @cancel="confirmation = null"
        />
      </template>
    </template>
  </main>
</template>
