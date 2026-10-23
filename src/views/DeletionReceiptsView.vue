<script setup lang="ts">
import { validDeletionId, validDeletionReceipt } from '@/services/privacy'
import { useDeletionReceipts } from '@/composables/useDeletionReceipts'
const { busy, error, jobId, handle, progress, progressKind, workspace, retryHint, query, reset } =
  useDeletionReceipts()
</script>
<template>
  <main class="panel workflow">
    <p class="eyebrow">隐私管理 / 超级管理员</p>
    <h1>回执查询</h1>
    <p>按已知待办 ID 或完整匿名回执查询，后台未提供列表。查询不会触发删除。</p>
    <template v-if="workspace.allowed()">
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="busy" role="status">正在查询清理进度…</p>
      <button :disabled="busy" @click="reset">清空页面</button>
      <section class="workflow-box" aria-label="删除进度查询">
        <h2>查询清理进度</h2>
        <form @submit.prevent="query('job')">
          <fieldset :disabled="busy">
            <legend>后台证据删除待办</legend>
            <label for="delete-job-id">待办 ID（不是证据 ID）</label>
            <input id="delete-job-id" v-model="jobId" autocomplete="off" spellcheck="false" />
            <button type="submit" :disabled="!validDeletionId(jobId.trim())">
              查询证据删除待办
            </button>
          </fieldset>
        </form>
        <form @submit.prevent="query('receipt')">
          <fieldset :disabled="busy">
            <legend>匿名删除回执</legend>
            <label for="delete-receipt">本人主动提供的完整删除回执</label>
            <input
              id="delete-receipt"
              v-model="handle"
              type="password"
              autocomplete="off"
              spellcheck="false"
            />
            <p>回执是访问凭据，请勿复制到网址、日志或截图；查询不携带后台令牌。</p>
            <p v-if="handle.trim() && !validDeletionReceipt(handle.trim())" role="status">
              请填写完整删除回执，包含标识与校验串；待办 ID 不能代替回执。
            </p>
            <button type="submit" :disabled="!validDeletionReceipt(handle.trim())">
              查询匿名删除回执
            </button>
          </fieldset>
        </form>
        <section v-if="progress" aria-label="清理结果" role="status">
          <h3>{{ progressKind }}</h3>
          <p v-if="progress.status === 'completed'">清理已完成（后端确认）。</p>
          <p v-else>正在清理，尚未全部完成；请稍后手动刷新查询。</p>
          <p v-if="retryHint">{{ retryHint }}</p>
        </section>
      </section>
    </template>
  </main>
</template>
