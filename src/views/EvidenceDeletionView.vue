<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { ElDrawer } from 'element-plus'
import 'element-plus/theme-chalk/el-drawer.css'
import 'element-plus/theme-chalk/el-overlay.css'
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
</script>
<template>
  <main class="panel workflow">
    <p class="eyebrow">隐私管理 / 超级管理员</p>
    <h1>证据删除</h1>
    <template v-if="workspace.allowed()">
      <p class="banner">删除作用于该证据所属的整个保留范围，无法撤回。受理不代表物理清理完成。</p>
      <p>
        按已知证据 ID 读取元信息，核对后显式处理。后台未提供证据列表；信息仅保留在当前页面内存中。
      </p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="busy" role="status">正在处理请求…</p>
      <button :disabled="busy || editorOpen" @click="reset">清空页面</button>
      <section class="workflow-box" aria-label="证据删除">
        <h2>读取并核对证据</h2>
        <form @submit.prevent="loadTarget">
          <fieldset :disabled="busy || editorOpen">
            <legend>已知证据条目标识</legend>
            <label for="delete-evidence-id">证据条目 ID</label>
            <input
              id="delete-evidence-id"
              v-model="evidenceId"
              autocomplete="off"
              spellcheck="false"
            />
            <button :disabled="!validDeletionId(evidenceId.trim())" type="submit">
              读取证据元信息
            </button>
          </fieldset>
        </form>
        <template v-if="target">
          <p>证据条目：{{ target.id }} · 关联危机案件：{{ target.case_id }}</p>
          <p>证据范围版本：{{ target.version }} · 案件状态：{{ target.status }}</p>
          <p>不展示正文或学号。此处使用证据范围版本，关联案件状态不能代替清理状态。</p>
          <button :disabled="busy || editorOpen" @click="startProcessing">处理证据删除</button>
        </template>
      </section>
      <p v-if="accepted" role="status">
        已受理，尚未确认清理完成。待办：{{ accepted.id }} · 待办版本：{{ accepted.version }}
      </p>
      <RouterLink to="/deletion-receipts">前往回执查询</RouterLink>
      <ElDrawer
        v-if="editorOpen"
        v-model="editorOpen"
        title="处理证据删除"
        size="min(40rem, 100vw)"
        :close-on-click-modal="false"
        :before-close="closeProcessing"
        :show-close="!busy"
      >
        <template v-if="target">
          <p>{{ target.id }} · 证据范围版本 {{ target.version }}</p>
          <p v-if="error" role="alert">{{ error }}</p>
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
            <p>
              证据条目：{{ target.id }} · 关联案件：{{ target.case_id }} · 范围版本：{{
                target.version
              }}
            </p>
            <p class="workflow-body">删除理由：{{ reason }}</p>
            <p>将停止该范围的证据读取并进入异步清理，不能撤回，也不会解除普通内容的危机限制。</p>
            <button :disabled="busy" @click="submit">确认删除证据范围</button>
            <button :disabled="busy" @click="confirmation = false">返回修改</button>
          </section>
          <button :disabled="busy" @click="cancelProcessing">取消处理</button>
        </template>
      </ElDrawer>
    </template>
  </main>
</template>
