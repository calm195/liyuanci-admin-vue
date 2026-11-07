<script setup lang="ts">
import FloatingNotice from '@/components/FloatingNotice.vue'
import BusinessToolbar from '@/components/BusinessToolbar.vue'
import { onMounted } from 'vue'
import { usePrivacyHandoff } from '@/composables/usePrivacyHandoff'
import { RouterLink } from 'vue-router'
import { ElDialog } from 'element-plus'
import 'element-plus/theme-chalk/el-dialog.css'
import 'element-plus/theme-chalk/el-overlay.css'
import { crisisStatusLabel } from '@/composables/useCrisisReview'
import { validDeletionId } from '@/services/privacy'
import { useEvidenceDeletion } from '@/composables/useEvidenceDeletion'
const {
  editorOpen,
  evidenceId,
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
  reset,
  startProcessing,
  cancelProcessing,
  closeProcessing,
} = useEvidenceDeletion()
const {
  open: openPrivacy,
  pending: privacyPending,
  error: privacyError,
  consume,
} = usePrivacyHandoff()
onMounted(() => {
  const id = consume()
  if (id && workspace.allowed()) {
    evidenceId.value = id
    void loadTarget()
  }
})
</script>
<template>
  <main class="panel workflow" aria-label="证据删除">
    <template v-if="workspace.allowed()">
      <p class="banner">删除作用于该证据所属的整个保留范围，无法撤回。受理不代表物理清理完成。</p>
      <p>可从授权危机案件进入，或输入已知证据条目标识查询元信息。信息仅保留在当前页面内存中。</p>
      <FloatingNotice v-if="error" :message="error" tone="error">{{ error }}</FloatingNotice>
      <p v-if="busy" role="status">正在处理请求…</p>
      <section class="business-card" aria-label="证据删除">
        <h2>读取并核对证据</h2>
        <BusinessToolbar label="查询操作栏">
          <template #tools>
            <button :disabled="busy || editorOpen" @click="reset">清空页面</button>
          </template>
        </BusinessToolbar>
        <form @submit.prevent="loadTarget">
          <fieldset :disabled="busy || editorOpen">
            <legend>已知证据条目标识</legend>
            <label for="delete-evidence-id">证据条目标识</label>
            <input
              id="delete-evidence-id"
              v-model="evidenceId"
              type="password"
              autocomplete="off"
              spellcheck="false"
            />
            <button :disabled="!validDeletionId(evidenceId.trim())" type="submit">
              读取证据元信息
            </button>
          </fieldset>
        </form>
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
        <p v-if="target">关联案件状态仅用于核对范围。清理状态请前往回执查询。</p>
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
                    @click="openPrivacy('/deletion-receipts', accepted.id)"
                  >
                    前往回执查询
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
      <RouterLink v-if="!accepted" to="/deletion-receipts">前往回执查询</RouterLink>
      <ElDialog
        v-if="editorOpen"
        v-model="editorOpen"
        title="处理证据删除"
        width="min(40rem, calc(100vw - 2rem))"
        class="business-dialog workflow"
        top="2rem"
        :close-on-click-modal="false"
        :before-close="closeProcessing"
        :show-close="!busy"
      >
        <template v-if="target">
          <p>危机限定证据 · 证据范围版本 {{ target.version }}</p>
          <FloatingNotice v-if="error" :message="error" tone="error">{{ error }}</FloatingNotice>
          <form @submit.prevent="prepare">
            <fieldset :disabled="busy || confirmation">
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
            <button :disabled="busy" @click="confirmation = false">返回修改</button>
          </section>
          <button :disabled="busy" @click="cancelProcessing">取消处理</button>
        </template>
      </ElDialog>
    </template>
  </main>
</template>
