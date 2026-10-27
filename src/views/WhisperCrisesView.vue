<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { ElDrawer } from 'element-plus'
import 'element-plus/theme-chalk/el-drawer.css'
import 'element-plus/theme-chalk/el-overlay.css'
import {
  useWhisperCrises,
  whisperCrisisStatuses,
  whisperCrisisActions,
  whisperDeliveryLabels,
} from '@/composables/useWhisperCrises'
import { whisperKindLabels } from '@/composables/useWhisperReviews'
const {
  items,
  nextCursor,
  listBusy,
  listError,
  listNotice,
  selectedId,
  detail,
  loading,
  error,
  notice,
  outcome,
  editorOpen,
  task,
  reason,
  confirming,
  writing,
  uncertain,
  workspace,
  options,
  admin,
  valid,
  refresh,
  more,
  openCase,
  close,
  startProcessing,
  cancelProcessing,
  closeProcessing,
  check,
  back,
  submit,
} = useWhisperCrises()
</script>
<template>
  <main class="panel workflow">
    <p class="eyebrow">安全治理 / 树洞危机</p>
    <h1>树洞危机</h1>
    <p>仅供危机岗位及超级管理员按授权案件读取限定正文；不提供学生卡或身份反查。</p>
    <template v-if="workspace.allowed()">
      <p v-if="notice" role="status">{{ notice }}</p>
      <p v-if="outcome" role="status">
        危机回执：{{ outcome.id }} · {{ whisperCrisisStatuses[outcome.status] }} · 案件版本
        {{ outcome.version }}
      </p>
      <div class="workflow-grid">
        <section aria-label="树洞危机列表" :aria-busy="listBusy">
          <div class="workflow-actions">
            <h2>危机案件</h2>
            <button :disabled="listBusy || editorOpen" @click="refresh">刷新列表</button>
          </div>
          <p v-if="listBusy" role="status">正在读取危机…</p>
          <p v-if="listError" role="alert">{{ listError }} 请刷新列表或重试加载。</p>
          <p v-if="listNotice" role="status">{{ listNotice }}</p>
          <p v-if="!listBusy && !listError && !items.length">当前页暂无危机</p>
          <ul v-if="items.length" class="workflow-list">
            <li v-for="item in items" :key="item.id">
              <button
                :disabled="editorOpen"
                :aria-pressed="selectedId === item.id"
                @click="openCase(item.id)"
              >
                {{ whisperKindLabels[item.source.kind] }} ·
                {{ whisperCrisisStatuses[item.status] }} · {{ item.id }}
                <span
                  >案件版本 {{ item.version }} · 正文版本 {{ item.source.content_version }} ·
                  交接时间 {{ item.handoff_at }}</span
                >
              </button>
            </li>
          </ul>
          <button v-if="nextCursor !== null" :disabled="listBusy || editorOpen" @click="more">
            {{ listError ? '重试加载' : '加载更多危机' }}
          </button>
        </section>
        <section aria-label="树洞危机详情" :aria-busy="loading">
          <h2>危机详情（只读）</h2>
          <p v-if="error" role="alert">{{ error }}</p>
          <p v-if="loading" role="status">正在读取限定正文…</p>
          <button
            v-if="selectedId && !loading"
            :disabled="editorOpen"
            @click="openCase(selectedId)"
          >
            重新读取危机
          </button>
          <template v-if="detail">
            <button :disabled="editorOpen" @click="close">关闭危机</button>
            <p>
              {{ detail.id }} · {{ whisperCrisisStatuses[detail.status] }} · 案件版本
              {{ detail.version }}
            </p>
            <p>
              {{ whisperKindLabels[detail.source.kind] }} · 正文版本
              {{ detail.source.content_version }} · 交接时间 {{ detail.handoff_at }}
            </p>
            <p v-if="detail.identity_status === 'verified' && detail.student_number !== null">
              已认证学号：{{ detail.student_number }}
            </p>
            <p v-else>尚无认证学号</p>
            <p v-if="detail.source.kind === 'whisper_capsule'" class="banner">
              私密胶囊限定证据，仅用于危机处置；误报后仍须符合到期及复核条件。
            </p>
            <blockquote class="workflow-body">{{ detail.body }}</blockquote>
            <section aria-label="危机投递状态">
              <h3>投递状态</h3>
              <p>关怀消息：{{ whisperDeliveryLabels[detail.care_delivery] }}</p>
              <p>工作人员通知：{{ whisperDeliveryLabels[detail.staff_delivery] }}</p>
              <p>仅重试仍有效的失败待办，不会恢复已取消通知。</p>
            </section>
            <section aria-label="危机时间线">
              <h3>时间线</h3>
              <p v-if="!detail.timeline.length">暂无时间线记录</p>
              <ol>
                <li v-for="(entry, index) in detail.timeline" :key="index">
                  <p>{{ entry.at }} · {{ entry.action }} · {{ entry.operator_label }}</p>
                  <p class="workflow-body">{{ entry.reason ?? '未填写理由' }}</p>
                </li>
              </ol>
            </section>
            <div class="workflow-actions">
              <button
                v-for="option in options"
                :key="option"
                :disabled="editorOpen"
                @click="startProcessing(option)"
              >
                {{ whisperCrisisActions[option] }}
              </button>
            </div>
            <p v-if="!options.length">当前没有可执行的处理动作。</p>
            <p>
              结案不解除隔离；误报只转普通复核，不代表公开，也不会重建已取消、注销或换版的内容。
            </p>
            <section v-if="admin.can('super_admin')" aria-label="限定证据范围">
              <p>证据范围 ID：{{ detail.evidence_scope_id }}</p>
              <RouterLink to="/whispers/evidence">前往树洞证据删除与进度查询</RouterLink>
            </section>
          </template>
          <p v-else-if="!selectedId && !loading">选择危机，按需读取授权限定正文。</p>
        </section>
      </div>
      <ElDrawer
        v-if="editorOpen"
        v-model="editorOpen"
        :title="whisperCrisisActions[task]"
        size="min(40rem, 100vw)"
        :close-on-click-modal="false"
        :close-on-press-escape="false"
        :before-close="closeProcessing"
        :show-close="!writing && !uncertain"
      >
        <template v-if="detail">
          <p>{{ detail.id }} · 案件版本 {{ detail.version }}</p>
          <p v-if="error" role="alert">{{ error }}</p>
          <form @submit.prevent="check">
            <fieldset :disabled="writing || confirming || uncertain">
              <legend>{{ whisperCrisisActions[task] }}</legend>
              <p v-if="task === 'false_positive'">
                误报将转普通复核，不直接公开；私密胶囊仍受预约时间约束。
              </p>
              <p v-if="task === 'resolve'">结案不解除危机隔离。</p>
              <p v-if="task === 'retry_notification'">
                仅重试仍有效的通知待办；已取消通知不能恢复。
              </p>
              <label for="whisper-crisis-reason"
                >处理理由（必填，最多500字，表情按一个字符计算）</label
              >
              <textarea id="whisper-crisis-reason" v-model="reason" required rows="3"></textarea>
              <button type="submit" :disabled="!valid">核对操作</button>
            </fieldset>
          </form>
          <section v-if="confirming" class="workflow-box" aria-label="树洞危机操作确认">
            <h3>确认操作</h3>
            <p>
              {{ whisperCrisisActions[task] }} · {{ detail.id }} · 案件版本 {{ detail.version }}
            </p>
            <p class="workflow-body">理由：{{ reason }}</p>
            <p>以当前服务端状态为准，冲突后不会自动重提。</p>
            <button :disabled="writing || !options.includes(task)" @click="submit">
              {{ writing ? '正在提交…' : uncertain ? '使用原请求重试' : '确认提交' }}
            </button>
            <button :disabled="writing || uncertain" @click="back">返回修改</button>
          </section>
          <button :disabled="writing || uncertain" @click="cancelProcessing">取消处理</button>
        </template>
      </ElDrawer>
    </template>
  </main>
</template>
