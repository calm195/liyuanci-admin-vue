<script setup lang="ts">
import WorkspaceDrawer from '@/components/WorkspaceDrawer.vue'
import WorkspaceHeading from '@/components/WorkspaceHeading.vue'
import { useOperationFeedback } from '@/composables/useOperationFeedback'
import FloatingNotice from '@/components/FloatingNotice.vue'
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { usePrivacyHandoff } from '@/composables/usePrivacyHandoff'
import { useWhisperEvidence } from '@/composables/useWhisperEvidence'
const {
  canReload,
  target,
  acceptedId,
  busy,
  error,
  notice,
  editorOpen,
  reason,
  confirmation,
  confirming,
  uncertain,
  workspace,
  canDelete,
  valid,
  loadTarget,
  startProcessing,
  cancelProcessing,
  check,
  back,
  submit,
} = useWhisperEvidence()
const {
  open: openPrivacy,
  pending: privacyPending,
  error: privacyError,
  consume,
} = usePrivacyHandoff()
onMounted(() => {
  const selection = consume()
  if (selection?.path === '/whispers/evidence' && workspace.allowed()) void loadTarget(selection.id)
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
  <main class="experience-page workflow privacy-workspace" aria-label="树洞证据">
    <WorkspaceHeading
      title="树洞证据"
      description="从树洞危机案件选中证据后核对删除范围与当前版本。"
    />
    <template v-if="workspace.allowed()">
      <p class="banner">
        删除作用于整个限定证据范围，无法撤回。受理不代表清理完成，也不会恢复普通内容。
      </p>
      <FloatingNotice v-if="error" :message="error" tone="error">{{ error }}</FloatingNotice>
      <FloatingNotice v-if="notice" :message="notice" tone="info">{{ notice }}</FloatingNotice>
      <p v-if="busy" role="status">正在处理请求…</p>
      <section class="experience-panel" aria-label="树洞证据范围">
        <h2>读取证据范围</h2>
        <button
          v-if="canReload"
          :disabled="busy || editorOpen"
          @click="runRead(() => loadTarget(), '证据范围已读取')"
        >
          重新读取证据范围
        </button>
        <template v-else-if="!acceptedId">
          <p>请从树洞危机案件详情点选证据。</p>
          <RouterLink to="/whispers/crises">前往树洞危机</RouterLink>
        </template>
        <div v-if="target" class="business-table">
          <table>
            <thead>
              <tr>
                <th scope="col">证据类型</th>
                <th scope="col">保留状态</th>
                <th scope="col">范围版本</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>树洞限定证据</td>
                <td>{{ target.state === 'retained' ? '证据保留中' : '证据范围正在删除' }}</td>
                <td>范围版本 {{ target.version }}</td>
                <td>
                  <button v-if="canDelete" :disabled="busy || editorOpen" @click="startProcessing">
                    处理证据删除
                  </button>
                  <span v-else>可在删除任务列表查看进度。</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <FloatingNotice v-if="privacyError" :message="privacyError" tone="error">{{
        privacyError
      }}</FloatingNotice>
      <button
        v-if="acceptedId"
        :disabled="privacyPending"
        @click="
          openPrivacy({
            path: '/deletion-receipts',
            task: { id: acceptedId, source_module: 'whispers' },
          })
        "
      >
        查看删除任务
      </button>
      <RouterLink v-else to="/deletion-receipts">查看删除任务</RouterLink>
      <WorkspaceDrawer
        v-if="editorOpen"
        presentation="dialog"
        :open="editorOpen"
        :busy="busy || uncertain"
        title="处理树洞证据删除"
        class="business-dialog workflow"
        @close="cancelProcessing"
      >
        <template v-if="target"
          ><p>树洞限定证据 · 范围版本 {{ target.version }}</p>
          <FloatingNotice v-if="error" :message="error" tone="error">{{ error }}</FloatingNotice>
          <form class="experience-editor" @submit.prevent="check">
            <fieldset :disabled="busy || confirming || uncertain">
              <legend>删除整个限定证据范围</legend>
              <label for="whisper-delete-reason"
                >删除理由（必填，最多500字，表情按一个字符计算）</label
              ><textarea id="whisper-delete-reason" v-model="reason" required rows="3"></textarea>
              <label for="whisper-delete-confirmation"
                >请输入 DELETE_EVIDENCE_SCOPE 确认删除整个范围</label
              ><input
                id="whisper-delete-confirmation"
                v-model="confirmation"
                autocomplete="off"
                spellcheck="false"
              />
              <button type="submit" :disabled="!valid">核对删除范围</button>
            </fieldset>
          </form>
          <section v-if="confirming" class="workflow-box" aria-label="树洞证据最终确认">
            <h3>确认删除整个证据范围</h3>
            <p>树洞限定证据 · 范围版本 {{ target.version }}</p>
            <p class="workflow-body">理由：{{ reason }}</p>
            <p>将停止该范围读取并进入异步清理，不能撤回，不会解除危机或隐私屏障。</p>
            <button :disabled="busy || !canDelete" @click="submit">
              {{ busy ? '正在提交…' : uncertain ? '使用原请求重试' : '确认删除证据范围' }}
            </button>
            <button :disabled="busy || uncertain" @click="back">返回修改</button>
          </section>
          <button data-overlay-close :disabled="busy || uncertain" @click="cancelProcessing">
            取消处理
          </button>
        </template>
      </WorkspaceDrawer>
    </template>
  </main>
</template>
