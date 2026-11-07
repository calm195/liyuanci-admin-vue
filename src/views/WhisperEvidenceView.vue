<script setup lang="ts">
import FloatingNotice from '@/components/FloatingNotice.vue'
import BusinessToolbar from '@/components/BusinessToolbar.vue'
import { onMounted } from 'vue'
import { usePrivacyHandoff } from '@/composables/usePrivacyHandoff'
import { ElDialog } from 'element-plus'
import 'element-plus/theme-chalk/el-dialog.css'
import 'element-plus/theme-chalk/el-overlay.css'
import { useWhisperEvidence, validWhisperId } from '@/composables/useWhisperEvidence'
const {
  evidenceId,
  target,
  jobId,
  acceptedId,
  progress,
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
  reset,
  loadTarget,
  startProcessing,
  cancelProcessing,
  closeProcessing,
  check,
  back,
  submit,
  query,
  queryAccepted,
} = useWhisperEvidence()
const privacy = usePrivacyHandoff()
onMounted(() => {
  const id = privacy.consume()
  if (id && workspace.allowed()) {
    evidenceId.value = id
    void loadTarget()
  }
})
</script>
<template>
  <main class="panel workflow" aria-label="树洞证据">
    <template v-if="workspace.allowed()">
      <p class="banner">
        删除作用于整个限定证据范围，无法撤回。受理不代表清理完成，也不会恢复普通内容。
      </p>
      <p>
        可从授权树洞危机进入，或输入已知范围及任务标识查询元信息。仅保留当前页面内存中的查询结果。
      </p>
      <FloatingNotice v-if="error" :message="error" tone="error">{{ error }}</FloatingNotice>
      <FloatingNotice v-if="notice" :message="notice" tone="info">{{ notice }}</FloatingNotice>
      <p v-if="busy" role="status">正在处理请求…</p>
      <section class="business-card" aria-label="树洞证据范围">
        <h2>读取证据范围</h2>
        <BusinessToolbar label="查询操作栏">
          <template #tools>
            <button :disabled="busy || editorOpen" @click="reset">清空页面</button>
          </template>
        </BusinessToolbar>
        <form @submit.prevent="loadTarget">
          <fieldset :disabled="busy || editorOpen">
            <legend>已知证据范围</legend>
            <label for="whisper-evidence-id">证据范围标识</label
            ><input
              id="whisper-evidence-id"
              v-model="evidenceId"
              type="password"
              autocomplete="off"
              spellcheck="false"
            />
            <button type="submit" :disabled="!validWhisperId(evidenceId)">读取证据范围</button>
          </fieldset>
        </form>
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
                  <span v-else>请按已有删除任务查询或重新读取范围。</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section class="business-card" aria-label="树洞证据删除进度">
        <h2>查询删除任务</h2>
        <div v-if="acceptedId" class="workflow-actions">
          <FloatingNotice message="删除任务已受理，待核对清理进度。" tone="info" />
          <button :disabled="busy || editorOpen" @click="queryAccepted">查询刚受理的任务</button>
        </div>
        <form @submit.prevent="query">
          <fieldset :disabled="busy || editorOpen">
            <legend>已知删除任务</legend>
            <label for="whisper-job-id">删除任务标识</label
            ><input
              id="whisper-job-id"
              v-model="jobId"
              type="password"
              autocomplete="off"
              spellcheck="false"
            />
            <button type="submit" :disabled="!validWhisperId(jobId)">查询删除进度</button>
          </fieldset>
        </form>
        <section v-if="progress" aria-label="树洞证据清理结果" role="status">
          <h3>清理结果</h3>
          <div class="business-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">任务类型</th>
                  <th scope="col">清理状态</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>树洞证据清理</td>
                  <td>
                    {{
                      progress.status === 'completed'
                        ? '证据范围清理已完成（后端确认）。'
                        : '证据范围正在清理，尚未全部完成；请稍后手动查询。'
                    }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </section>
      <ElDialog
        v-if="editorOpen"
        v-model="editorOpen"
        title="处理树洞证据删除"
        width="min(40rem, calc(100vw - 2rem))"
        class="business-dialog workflow"
        top="2rem"
        :close-on-click-modal="false"
        :close-on-press-escape="false"
        :before-close="closeProcessing"
        :show-close="!busy && !uncertain"
      >
        <template v-if="target"
          ><p>树洞限定证据 · 范围版本 {{ target.version }}</p>
          <FloatingNotice v-if="error" :message="error" tone="error">{{ error }}</FloatingNotice>
          <form @submit.prevent="check">
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
          <button :disabled="busy || uncertain" @click="cancelProcessing">取消处理</button>
        </template>
      </ElDialog>
    </template>
  </main>
</template>
