<script setup lang="ts">
import { ElDrawer } from 'element-plus'
import 'element-plus/theme-chalk/el-drawer.css'
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
} = useWhisperEvidence()
</script>
<template>
  <main class="panel workflow">
    <p class="eyebrow">隐私管理 / 超级管理员</p>
    <h1>树洞证据</h1>
    <template v-if="workspace.allowed()">
      <p class="banner">
        删除作用于整个限定证据范围，无法撤回。受理不代表清理完成，也不会恢复普通内容。
      </p>
      <p>
        仅按已知范围或删除任务 ID 查询元信息，不展示原始证据、正文或学号；信息仅保存在当前页面内存。
      </p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <p v-if="busy" role="status">正在处理请求…</p>
      <button :disabled="busy || editorOpen" @click="reset">清空页面</button>
      <section class="workflow-box" aria-label="树洞证据范围">
        <h2>读取证据范围</h2>
        <form @submit.prevent="loadTarget">
          <fieldset :disabled="busy || editorOpen">
            <legend>已知证据范围</legend>
            <label for="whisper-evidence-id">证据范围 ID</label
            ><input
              id="whisper-evidence-id"
              v-model="evidenceId"
              autocomplete="off"
              spellcheck="false"
            />
            <button type="submit" :disabled="!validWhisperId(evidenceId)">读取证据范围</button>
          </fieldset>
        </form>
        <template v-if="target"
          ><p>证据范围：{{ target.id }} · 范围版本 {{ target.version }}</p>
          <p>{{ target.state === 'retained' ? '证据保留中' : '证据范围正在删除' }}</p>
          <button v-if="canDelete" :disabled="busy || editorOpen" @click="startProcessing">
            处理证据删除
          </button>
          <p v-else>当前不能受理删除，请按已有删除任务查询或重新读取范围。</p>
        </template>
      </section>
      <section class="workflow-box" aria-label="树洞证据删除进度">
        <h2>查询删除任务</h2>
        <p v-if="acceptedId" role="status">
          已受理任务：{{ acceptedId }}；请查询后核对是否清理完成。
        </p>
        <form @submit.prevent="query">
          <fieldset :disabled="busy || editorOpen">
            <legend>已知删除任务</legend>
            <label for="whisper-job-id">删除任务 ID（不是证据范围 ID）</label
            ><input id="whisper-job-id" v-model="jobId" autocomplete="off" spellcheck="false" />
            <button type="submit" :disabled="!validWhisperId(jobId)">查询删除进度</button>
          </fieldset>
        </form>
        <section v-if="progress" aria-label="树洞证据清理结果" role="status">
          <p>任务：{{ progress.id }}</p>
          <p v-if="progress.status === 'completed'">证据范围清理已完成（后端确认）。</p>
          <p v-else>证据范围正在清理，尚未全部完成；请稍后手动查询。</p>
        </section>
      </section>
      <ElDrawer
        v-if="editorOpen"
        v-model="editorOpen"
        title="处理树洞证据删除"
        size="min(40rem, 100vw)"
        :close-on-click-modal="false"
        :close-on-press-escape="false"
        :before-close="closeProcessing"
        :show-close="!busy && !uncertain"
      >
        <template v-if="target"
          ><p>{{ target.id }} · 范围版本 {{ target.version }}</p>
          <p v-if="error" role="alert">{{ error }}</p>
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
            <p>{{ target.id }} · 范围版本 {{ target.version }}</p>
            <p class="workflow-body">理由：{{ reason }}</p>
            <p>将停止该范围读取并进入异步清理，不能撤回，不会解除危机或隐私屏障。</p>
            <button :disabled="busy || !canDelete" @click="submit">
              {{ busy ? '正在提交…' : uncertain ? '使用原请求重试' : '确认删除证据范围' }}
            </button>
            <button :disabled="busy || uncertain" @click="back">返回修改</button>
          </section>
          <button :disabled="busy || uncertain" @click="cancelProcessing">取消处理</button>
        </template>
      </ElDrawer>
    </template>
  </main>
</template>
