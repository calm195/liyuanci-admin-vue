<script setup lang="ts">
import { ElDrawer } from 'element-plus'
import 'element-plus/theme-chalk/el-drawer.css'
import 'element-plus/theme-chalk/el-overlay.css'
import { crisisActions } from '@/types/crisis'
import { useCrisisReview } from '@/composables/useCrisisReview'
const {
  editorOpen,
  startProcessing,
  cancelProcessing,
  closeProcessing,
  items,
  nextCursor,
  history,
  listBusy,
  listError,
  detail,
  selected,
  loading,
  error,
  timeline,
  timelineBusy,
  timelineError,
  work,
  workBusy,
  workError,
  evidence,
  evidenceBusy,
  evidenceError,
  showIdentity,
  action,
  reason,
  confirming,
  writing,
  notice,
  receipt,
  workspace,
  evidenceRefs,
  canAct,
  valid,
  actionLabels,
  status,
  eventLabel,
  displayTime,
  hideEvidence,
  loadList,
  refresh,
  page,
  loadTimeline,
  loadWork,
  open,
  readEvidence,
  close,
  confirm,
  submit,
} = useCrisisReview()
</script>
<template>
  <main class="panel workflow">
    <p class="eyebrow">安全治理 / 危机处置</p>
    <h1>危机工作台</h1>
    <p>
      危机隔离和自动待办全天运行；北京时间 8–22
      时为人工窗口，夜间案件按服务端接手时刻交接，不承诺首次响应时限。
    </p>
    <template v-if="workspace.allowed()">
      <p v-if="notice" role="status">{{ notice }}</p>
      <section v-if="receipt" class="workflow-box" aria-label="危机处理回执">
        <h2>处理回执</h2>
        <p>{{ receipt.id }} · {{ status(receipt.status) }} · 案件版本 {{ receipt.version }}</p>
      </section>
      <div class="workflow-grid">
        <section aria-label="危机案件列表" :aria-busy="listBusy">
          <h2>危机案件</h2>
          <button :disabled="listBusy || editorOpen" @click="refresh()">从首页刷新</button>
          <p v-if="listBusy" role="status">正在读取危机案件…</p>
          <div v-else-if="listError" role="alert">
            <p>{{ listError }}</p>
            <button :disabled="editorOpen" @click="loadList">重试列表</button>
          </div>
          <p v-else-if="!items.length">暂无危机案件</p>
          <ul v-else class="workflow-list">
            <li v-for="item in items" :key="item.id">
              <button
                :aria-pressed="selected === item.id"
                :disabled="editorOpen"
                @click="open(item.id)"
              >
                {{ item.id }} · {{ status(item.status) }} · 版本 {{ item.version }}
              </button>
            </li>
          </ul>
          <div class="workflow-actions">
            <button :disabled="listBusy || editorOpen || !history.length" @click="page(false)">
              上一页</button
            ><button :disabled="listBusy || editorOpen || !nextCursor" @click="page(true)">
              下一页
            </button>
          </div>
          <p>列表不展示身份或正文，材料仅在具体案件授权后读取。</p>
        </section>
        <section aria-label="危机案件详情" :aria-busy="loading || writing">
          <h2>案件详情</h2>
          <p v-if="loading" role="status">正在读取授权案件…</p>
          <p v-if="error" role="alert">{{ error }}</p>
          <button v-if="selected && !detail && !loading" @click="open(selected)">重试案件</button>
          <template v-if="detail">
            <button :disabled="editorOpen" @click="close">关闭案件并清除材料</button>
            <p>{{ detail.id }} · {{ status(detail.status) }} · 案件版本 {{ detail.version }}</p>
            <p>
              学号：<span v-if="showIdentity">{{ detail.student_number || '未提供' }}</span
              ><span v-else>已隐藏</span>
            </p>
            <button :disabled="editorOpen" @click="showIdentity = !showIdentity">
              {{ showIdentity ? '隐藏完整学号' : '显示完整学号' }}
            </button>
            <blockquote class="workflow-body">{{ detail.body }}</blockquote>
            <section aria-label="危机投递待办" class="workflow-box" :aria-busy="workBusy">
              <h3>关怀与人员通知待办</h3>
              <button :disabled="workBusy || editorOpen" @click="loadWork">刷新待办</button>
              <p v-if="workBusy" role="status">正在读取待办…</p>
              <p v-if="workError" role="alert">{{ workError }}</p>
              <template v-if="work"
                ><p>
                  服务端接手窗口：{{
                    work.handoff_at ? displayTime(work.handoff_at) : '未提供'
                  }}（北京时间）
                </p>
                <ul>
                  <li v-for="item in work.items" :key="item.id">
                    {{
                      item.kind === 'care'
                        ? '本人关怀投递'
                        : item.kind === 'operator'
                          ? '授权人员通知'
                          : '其他待办'
                    }}
                    · {{ status(item.status) }} · 已尝试 {{ item.attempts }} 次 · 调度时刻
                    {{ displayTime(item.next_at) }}
                  </li>
                </ul>
                <p v-if="!work.items.length">暂无投递待办</p>
              </template>
              <p>通知或关怀投递完成不代表人工已接手；资料与通知依赖缺失时以服务端待办状态为准。</p>
            </section>
            <section aria-label="危机时间线" class="workflow-box" :aria-busy="timelineBusy">
              <h3>案件时间线</h3>
              <button :disabled="timelineBusy || editorOpen" @click="loadTimeline">
                刷新时间线
              </button>
              <p v-if="timelineBusy" role="status">正在读取时间线…</p>
              <p v-if="timelineError" role="alert">{{ timelineError }}</p>
              <ol>
                <li v-for="item in timeline" :key="item.id">
                  <p>
                    {{ eventLabel(item.action) }} ·
                    {{ item.actor === 'system' ? '系统' : item.actor }} ·
                    {{ displayTime(item.at) }}（北京时间）
                  </p>
                  <p v-if="item.reason" class="crisis-text">{{ item.reason }}</p>
                </li>
              </ol>
              <p v-if="!timelineBusy && !timelineError && !timeline.length">暂无动作记录</p>
            </section>
            <section aria-label="限定证据" class="workflow-box">
              <h3>本案限定证据</h3>
              <button
                v-for="evidenceRef in evidenceRefs"
                :key="evidenceRef.id"
                :disabled="evidenceBusy || editorOpen"
                @click="readEvidence(evidenceRef.id)"
              >
                查看证据 {{ evidenceRef.id }}
              </button>
              <p v-if="!evidenceRefs.length">当前案件未提供证据项引用</p>
              <p v-if="evidenceBusy" role="status">正在读取限定证据…</p>
              <p v-if="evidenceError" role="alert">{{ evidenceError }}</p>
              <template v-if="evidence"
                ><p>
                  证据 {{ evidence.id }} · {{ status(evidence.status) }} · 版本
                  {{ evidence.version }}
                </p>
                <p>学号：{{ showIdentity ? evidence.student_number || '未提供' : '已隐藏' }}</p>
                <blockquote class="workflow-body">{{ evidence.body }}</blockquote></template
              >
              <button v-if="evidence || evidenceBusy" @click="hideEvidence">收起证据</button>
              <p>仅包含本案授权文字证据，不读取无关学生卡。</p>
            </section>
            <button v-if="canAct" :disabled="editorOpen || loading" @click="startProcessing">
              处理危机案件
            </button>
            <p v-else>当前状态仅供查看，不能再次处置。</p>
          </template>
          <p v-else-if="!loading && !selected">选择案件，按需读取授权材料。</p>
        </section>
      </div>
      <ElDrawer
        v-if="editorOpen"
        v-model="editorOpen"
        title="处理危机案件"
        size="min(40rem, 100vw)"
        :close-on-click-modal="false"
        :before-close="closeProcessing"
        :show-close="!writing"
      >
        <template v-if="detail">
          <p>{{ detail.id }} · 案件版本 {{ detail.version }}</p>
          <p v-if="error" role="alert">{{ error }}</p>
          <form v-if="canAct" @submit.prevent="confirm">
            <fieldset :disabled="writing || confirming || loading">
              <legend>危机处置</legend>
              <label for="crisis-action">处置动作</label
              ><select id="crisis-action" v-model="action">
                <option v-for="value in crisisActions" :key="value" :value="value">
                  {{ actionLabels[value] }}
                </option>
                <option value="false_positive">{{ actionLabels.false_positive }}</option>
              </select>
              <p v-if="action === 'false_positive'" class="banner">
                误报只解除本案危机限制并转普通人工复核；不会直接公开或送达，不解除其他处罚或隐私屏障。
              </p>
              <p v-if="action === 'resolve'">结束处置保留危机隔离，不自动恢复内容。</p>
              <p v-if="action === 'retry_notification'">
                只请求重试授权人员通知，不表示实际送达或接手。
              </p>
              <label for="crisis-reason">处理理由（必填，最多 2000 个字符）</label
              ><textarea id="crisis-reason" v-model="reason" rows="4" required></textarea
              ><button type="submit" :disabled="!valid">核对处置</button>
            </fieldset>
          </form>
          <p v-else>当前状态仅供查看，不能再次处置。</p>
          <section v-if="confirming" class="workflow-box" aria-label="危机处置确认">
            <h3>确认{{ actionLabels[action] }}</h3>
            <p>{{ detail.id }} · 案件版本 {{ detail.version }}</p>
            <p class="crisis-text">理由：{{ reason.trim() }}</p>
            <p>提交后以服务端状态为准；版本变化须重新核对。</p>
            <div class="workflow-actions">
              <button :disabled="writing" @click="submit">
                {{ writing ? '正在提交…' : '确认提交' }}</button
              ><button :disabled="writing" @click="confirming = false">返回修改</button>
            </div>
          </section>
          <button :disabled="writing" @click="cancelProcessing">取消处理</button>
        </template>
      </ElDrawer>
    </template>
  </main>
</template>
<style scoped>
.crisis-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
