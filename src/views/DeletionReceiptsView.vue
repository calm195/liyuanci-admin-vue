<script setup lang="ts">
import { onMounted } from 'vue'
import FloatingNotice from '@/components/FloatingNotice.vue'
import NumberedPagination from '@/components/NumberedPagination.vue'
import WorkspaceHeading from '@/components/WorkspaceHeading.vue'
import { useAutoSearch } from '@/composables/useAutoSearch'
import { deletionTaskLabel, useDeletionReceipts } from '@/composables/useDeletionReceipts'
import { useOperationFeedback } from '@/composables/useOperationFeedback'
import { usePrivacyHandoff } from '@/composables/usePrivacyHandoff'
import { validDeletionReceipt } from '@/services/privacy'
import { displayBeijingTime } from '@/utils/admin-time'

const {
  busy,
  error,
  handle,
  task,
  progress,
  progressKind,
  workspace,
  retryHint,
  queryTask,
  queryReceipt,
  reset,
  tasks,
  listBusy,
  listError,
  page,
  pageSize,
  total,
  loadTasks,
  resizeTasks,
} = useDeletionReceipts()
const { consume } = usePrivacyHandoff()
onMounted(() => {
  void loadTasks()
  const selection = consume()
  if (selection?.path === '/deletion-receipts' && workspace.allowed())
    void queryTask(selection.task)
})
const { feedback: readFeedback, run: runRead } = useOperationFeedback(() =>
  Boolean(error.value || listError.value),
)
const autoSearch = useAutoSearch(
  () => {
    if (validDeletionReceipt(handle.value.trim())) return queryReceipt()
  },
  () => workspace.allowed() && !busy.value,
)
function clearSearch() {
  autoSearch.cancel()
  reset()
}
function submitReceiptSearch() {
  autoSearch.cancel()
  void runRead(queryReceipt, '查询已完成')
}
</script>

<template>
  <FloatingNotice
    v-if="readFeedback.message"
    :message="readFeedback.message"
    :tone="readFeedback.tone"
    :revision="readFeedback.revision"
  />
  <main class="experience-page workflow privacy-workspace" aria-label="删除任务与回执">
    <WorkspaceHeading title="删除任务与回执" />
    <template v-if="workspace.allowed()">
      <section
        class="experience-panel experience-table-panel"
        aria-label="证据删除任务列表"
        :aria-busy="listBusy"
      >
        <div class="experience-toolbar">
          <h2 class="experience-list-title">证据删除任务</h2>
          <button :disabled="listBusy" @click="runRead(() => loadTasks(), '任务列表已刷新')">
            刷新任务列表
          </button>
        </div>
        <p v-if="listBusy" role="status">正在读取删除任务…</p>
        <FloatingNotice v-if="listError" :message="listError" tone="error">{{
          listError
        }}</FloatingNotice>
        <p v-else-if="!listBusy && !tasks.length" class="experience-empty">暂无删除任务</p>
        <div v-if="tasks.length" class="business-table">
          <table>
            <thead>
              <tr>
                <th scope="col">证据来源</th>
                <th scope="col">受理时间</th>
                <th scope="col">清理状态</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in tasks" :key="item.id">
                <td>{{ deletionTaskLabel(item) }}</td>
                <td>{{ displayBeijingTime(item.created_at) }}</td>
                <td>{{ item.status === 'completed' ? '已完成' : '清理中' }}</td>
                <td>
                  <button :disabled="busy || listBusy" @click="runRead(() => queryTask(item))">
                    查看进度
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <NumberedPagination
          v-if="tasks.length"
          :page="page"
          :page-size="pageSize"
          :total="total"
          :disabled="listBusy"
          @turn="loadTasks"
          @resize="resizeTasks"
        />
      </section>
      <section class="experience-panel" aria-label="匿名删除回执查询">
        <h2>查询匿名回执</h2>
        <form id="receipt-query" class="experience-editor" @submit.prevent="submitReceiptSearch">
          <fieldset :disabled="busy">
            <legend>匿名删除回执</legend>
            <label for="delete-receipt">本人主动提供的完整删除回执</label>
            <input
              id="delete-receipt"
              v-model="handle"
              type="password"
              autocomplete="off"
              spellcheck="false"
              @input="autoSearch.input"
              @compositionstart="autoSearch.start"
              @compositionend="autoSearch.end"
            />
            <p>回执是访问凭据，请勿复制到网址、日志或截图；查询不携带后台令牌。</p>
            <p v-if="handle.trim() && !validDeletionReceipt(handle.trim())" role="status">
              请填写完整删除回执，包含标识与校验串；待办 ID 不能代替回执。
            </p>
            <button type="submit" :disabled="!validDeletionReceipt(handle.trim())">
              查询匿名删除回执
            </button>
            <button type="button" @click="clearSearch">清空查询</button>
          </fieldset>
        </form>
      </section>
      <FloatingNotice v-if="error" :message="error" tone="error">{{ error }}</FloatingNotice>
      <p v-if="busy" role="status">正在查询清理进度…</p>
      <section v-if="progress" class="experience-panel" aria-label="清理结果" role="status">
        <h2>清理结果</h2>
        <p>{{ progressKind }}</p>
        <p>
          {{
            progress.status === 'completed'
              ? '清理已完成（后端确认）。'
              : '正在清理，尚未全部完成；请稍后手动刷新查询。'
          }}
        </p>
        <p v-if="retryHint">{{ retryHint }}</p>
        <button v-if="task" @click="runRead(() => task && queryTask(task))">刷新任务进度</button>
      </section>
    </template>
  </main>
</template>
