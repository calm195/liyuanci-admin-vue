<script setup lang="ts">
import BusinessToolbar from '@/components/BusinessToolbar.vue'
import { onMounted } from 'vue'
import { usePrivacyHandoff } from '@/composables/usePrivacyHandoff'
import { validDeletionId, validDeletionReceipt } from '@/services/privacy'
import { useDeletionReceipts } from '@/composables/useDeletionReceipts'
const { busy, error, jobId, handle, progress, progressKind, workspace, retryHint, query, reset } =
  useDeletionReceipts()
const privacy = usePrivacyHandoff()
onMounted(() => {
  const id = privacy.consume()
  if (id && workspace.allowed()) {
    jobId.value = id
    void query('job')
  }
})
</script>
<template>
  <main class="panel workflow" aria-label="回执查询">
    <p>查询刚受理的证据清理任务，也可输入已知待办标识或完整匿名回执。查询不会触发删除。</p>
    <template v-if="workspace.allowed()">
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="busy" role="status">正在查询清理进度…</p>
      <section class="business-card" aria-label="删除进度查询">
        <h2>查询清理进度</h2>
        <BusinessToolbar label="查询操作栏">
          <template #tools>
            <button :disabled="busy" @click="reset">清空页面</button>
          </template>
        </BusinessToolbar>
        <form @submit.prevent="query('job')">
          <fieldset :disabled="busy">
            <legend>后台证据删除待办</legend>
            <label for="delete-job-id">删除待办标识</label>
            <input
              id="delete-job-id"
              v-model="jobId"
              type="password"
              autocomplete="off"
              spellcheck="false"
            />
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
          <h3>清理结果</h3>
          <div class="business-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">查询来源</th>
                  <th scope="col">清理状态</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{{ progressKind }}</td>
                  <td>
                    {{
                      progress.status === 'completed'
                        ? '清理已完成（后端确认）。'
                        : '正在清理，尚未全部完成；请稍后手动刷新查询。'
                    }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="retryHint">{{ retryHint }}</p>
        </section>
      </section>
    </template>
  </main>
</template>
