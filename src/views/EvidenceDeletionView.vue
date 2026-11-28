<script setup lang="ts">
import WorkspaceDrawer from '@/components/WorkspaceDrawer.vue'
import WorkspaceHeading from '@/components/WorkspaceHeading.vue'
import { useOperationFeedback } from '@/composables/useOperationFeedback'
import FloatingNotice from '@/components/FloatingNotice.vue'
import { onMounted } from 'vue'
import { usePrivacyHandoff } from '@/composables/usePrivacyHandoff'
import { RouterLink } from 'vue-router'
import { crisisStatusLabel } from '@/composables/useCrisisReview'
import { useEvidenceDeletion } from '@/composables/useEvidenceDeletion'
const {
  editorOpen,
  uncertain,
  canReload,
  target,
  reason,
  confirmation,
  busy,
  error,
  accepted,
  workspace,
  reasonBytes,
  canPrepare,
  loadTarget,
  prepare,
  submit,
  startProcessing,
  cancelProcessing,
} = useEvidenceDeletion()
const {
  open: openPrivacy,
  pending: privacyPending,
  error: privacyError,
  consume,
} = usePrivacyHandoff()
onMounted(() => {
  const selection = consume()
  if (selection?.path === '/evidence-deletion' && workspace.allowed()) void loadTarget(selection)
})
const { feedback: readFeedback, run: runRead } = useOperationFeedback(() => Boolean(error.value))
</script>
<template>
  <FloatingNotice
    v-if="readFeedback.message"
    :message="readFeedback.message"
    :tone="readFeedback.tone"
    :revision="readFeedback.revision"
  />
  <FloatingNotice v-if="accepted" message="删除任务已受理，请继续核对清理进度" tone="success" />
  <main class="experience-page workflow privacy-workspace" aria-label="证据删除">
    <WorkspaceHeading title="证据删除" description="从危机案件选中证据后核对删除范围与当前版本。" />
    <template v-if="workspace.allowed()">
      <p class="banner">删除作用于该证据所属的整个保留范围，无法撤回。受理不代表物理清理完成。</p>
      <FloatingNotice v-if="error" :message="error" tone="error">{{ error }}</FloatingNotice>
      <p v-if="busy" role="status">正在处理请求…</p>
      <section class="experience-panel" aria-label="证据删除">
        <h2>读取并核对证据</h2>
        <button
          v-if="canReload"
          :disabled="busy || editorOpen"
          @click="runRead(() => loadTarget(), '证据元信息已读取')"
        >
          重新读取证据范围
        </button>
        <template v-else-if="!accepted">
          <p>请从普通危机案件详情点选证据。</p>
          <RouterLink to="/crisis">前往危机工作台</RouterLink>
        </template>
        <div v-if="target" class="business-table">
          <table>
            <thead>
              <tr>
                <th scope="col">证据类型</th>
                <th scope="col">关联案件状态</th>
                <th scope="col">证据范围版本</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>危机限定证据</td>
                <td>{{ crisisStatusLabel(target.status) }}</td>
                <td>{{ target.version }}</td>
                <td>
                  <button :disabled="busy || editorOpen" @click="startProcessing">
                    处理证据删除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="target">关联案件状态仅用于核对范围。清理状态请前往删除任务列表。</p>
      </section>
      <section v-if="accepted" aria-label="证据删除受理回执" role="status">
        <p>已受理，尚未确认清理完成。</p>
        <div class="business-table">
          <table>
            <thead>
              <tr>
                <th scope="col">任务类型</th>
                <th scope="col">待办版本</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>危机证据清理</td>
                <td>{{ accepted.version }}</td>
                <td>
                  <button
                    :disabled="privacyPending"
                    @click="
                      openPrivacy({
                        path: '/deletion-receipts',
                        task: { id: accepted.id, source_module: 'legacy' },
                      })
                    "
                  >
                    查看删除任务
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <FloatingNotice v-if="privacyError" :message="privacyError" tone="error">{{
        privacyError
      }}</FloatingNotice>
      <RouterLink v-if="!accepted" to="/deletion-receipts">查看删除任务</RouterLink>
      <WorkspaceDrawer
        v-if="editorOpen"
        presentation="dialog"
        :open="editorOpen"
        :busy="busy || uncertain"
        title="处理证据删除"
        class="business-dialog workflow"
        @close="cancelProcessing"
      >
        <template v-if="target">
          <p>危机限定证据 · 证据范围版本 {{ target.version }}</p>
          <FloatingNotice v-if="error" :message="error" tone="error">{{ error }}</FloatingNotice>
          <form class="experience-editor" @submit.prevent="prepare">
            <fieldset :disabled="busy || confirmation || uncertain">
              <legend>删除理由</legend>
              <label for="delete-reason">理由（最多 2000 个 UTF-8 字节）</label>
              <textarea id="delete-reason" v-model="reason" rows="4" autocomplete="off"></textarea>
              <p>{{ reasonBytes }} / 2000 字节</p>
              <button type="submit" :disabled="!canPrepare">核对删除范围</button>
            </fieldset>
          </form>
          <section v-if="confirmation" aria-label="最终删除确认">
            <h3>确认删除整个证据范围</h3>
            <p>危机限定证据 · 证据范围版本 {{ target.version }}</p>
            <p class="workflow-body">删除理由：{{ reason }}</p>
            <p>将停止该范围的证据读取并进入异步清理，不能撤回，也不会解除普通内容的危机限制。</p>
            <button :disabled="busy" @click="submit">确认删除证据范围</button>
            <button :disabled="busy || uncertain" @click="confirmation = false">返回修改</button>
          </section>
          <button data-overlay-close :disabled="busy || uncertain" @click="cancelProcessing">
            取消处理
          </button>
        </template>
      </WorkspaceDrawer>
    </template>
  </main>
</template>
