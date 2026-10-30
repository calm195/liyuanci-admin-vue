<script setup lang="ts">
import { ElDrawer } from 'element-plus'
import 'element-plus/theme-chalk/el-drawer.css'
import 'element-plus/theme-chalk/el-overlay.css'
import { useResources } from '@/composables/useResources'
import { feedbackLabels, resourceStatuses, resourceStatusLabels } from '@/types/resources'
const {
  filters,
  items,
  categories,
  next,
  history,
  busy,
  loading,
  writing,
  categoriesBusy,
  error,
  categoryError,
  detailError,
  notice,
  selected,
  detail,
  mode,
  form,
  reason,
  conflict,
  pending,
  dirty,
  workspace,
  search,
  page,
  open,
  create,
  close,
  edit,
  offline,
  refresh,
  save,
  publish,
  confirmOffline,
  runPending,
  loadCategories,
  cancelEditing,
} = useResources()
function time(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: false,
  }).format(new Date(value))
}
</script>
<template>
  <main class="panel workflow resource-workspace">
    <p class="eyebrow">内容管理</p>
    <h1>资料管理</h1>
    <template v-if="workspace.allowed()">
      <form class="resource-filters" @submit.prevent="search">
        <label
          >关键词<input v-model="filters.q" autocomplete="off" placeholder="搜索标题或简介"
        /></label>
        <label
          >分类<select v-model="filters.category_id">
            <option value="">全部分类</option>
            <option v-for="item in categories" :key="item.id" :value="item.id">
              {{ item.name }}
            </option>
          </select></label
        >
        <label
          >状态<select v-model="filters.status">
            <option value="">全部状态</option>
            <option v-for="status in resourceStatuses" :key="status" :value="status">
              {{ resourceStatusLabels[status] }}
            </option>
          </select></label
        >
        <button type="submit">查询 / 从首页刷新</button
        ><button type="button" :disabled="writing" @click="create">新建资料</button>
      </form>
      <p v-if="categoryError" role="alert">
        {{ categoryError }} <button @click="loadCategories">重新读取分类</button>
      </p>
      <p v-if="categoriesBusy">正在读取分类…</p>
      <p v-if="dirty">条件已修改，请重新查询后翻页。</p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="busy" role="status">正在读取资料…</p>
      <p v-else-if="!error && !items.length">暂无符合条件的资料</p>
      <div v-if="items.length" class="resource-table">
        <table>
          <caption>
            按创建时间倒序；时间为北京时间
          </caption>
          <thead>
            <tr>
              <th>标题 / 简介</th>
              <th>分类 / 状态</th>
              <th>当前版本反馈</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id">
              <td>
                {{ item.title }}
                <p>{{ item.description_excerpt }}</p>
              </td>
              <td>{{ item.category.name }} · {{ resourceStatusLabels[item.status] }}</td>
              <td>
                <span v-for="(label, kind) in feedbackLabels" :key="kind"
                  >{{ label }} {{ item.feedback_summary[kind] }}
                </span>
              </td>
              <td>{{ time(item.updated_at) }}</td>
              <td>
                <button
                  :aria-label="`查看资料 ${item.id}`"
                  :disabled="writing"
                  @click="open(item.id)"
                >
                  查看详情
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="workflow-actions">
        <button :disabled="busy || dirty || !history.length" @click="page(false)">上一页</button
        ><button :disabled="busy || dirty || !next" @click="page(true)">下一页</button>
      </div>
      <ElDrawer
        :model-value="!!selected"
        :title="
          mode === 'create'
            ? '新建资料'
            : mode === 'edit'
              ? '编辑资料'
              : mode === 'offline'
                ? '确认下架'
                : '资料详情'
        "
        size="min(46rem, 100vw)"
        :close-on-click-modal="false"
        :close-on-press-escape="false"
        :show-close="false"
      >
        <button :disabled="writing" @click="close">关闭</button>
        <p v-if="loading" role="status">正在读取详情…</p>
        <p v-if="detailError" role="alert">{{ detailError }}</p>
        <p v-if="pending">操作结果尚待确认，输入已锁定。请保留原操作重试。</p>
        <button v-if="pending" :disabled="writing" @click="runPending">原样重试</button>
        <button
          v-if="selected !== 'new' && !pending"
          :disabled="writing || loading"
          @click="refresh"
        >
          重新读取并核对
        </button>
        <p v-if="conflict">请重新读取，核对当前内容与本地输入后再确认保存。</p>
        <template v-if="detail && mode === 'detail'">
          <h2>{{ detail.title }}</h2>
          <p>{{ detail.category.name }} · {{ resourceStatusLabels[detail.status] }}</p>
          <p class="resource-text">{{ detail.description || '暂无简介' }}</p>
          <p class="resource-text">下载链接：{{ detail.download_url }}</p>
          <p>提取码：{{ detail.extraction_code ?? '无提取码' }}</p>
          <p>内容版本 {{ detail.content_version }} · 更新于 {{ time(detail.updated_at) }}</p>
          <p>反馈仅针对当前内容版本，不代表下载次数。</p>
          <ul>
            <li v-for="(label, kind) in feedbackLabels" :key="kind">
              {{ label }}：{{ detail.feedback_summary[kind] }}
            </li>
          </ul>
          <p>总反馈：{{ detail.feedback_summary.total }}</p>
          <p v-if="detail.visibility_blocked">此资料当前不可发布，请联系有权处理的人员核对。</p>
          <div class="workflow-actions">
            <button
              v-if="detail.allowed_actions.includes('update')"
              :disabled="writing || !!pending"
              @click="edit"
            >
              编辑</button
            ><button
              v-if="detail.allowed_actions.includes('publish')"
              :disabled="writing || !!pending"
              @click="publish"
            >
              上架</button
            ><button
              v-if="detail.allowed_actions.includes('offline')"
              :disabled="writing || !!pending"
              @click="offline(false)"
            >
              下架</button
            ><button
              v-if="detail.allowed_actions.includes('offline')"
              :disabled="writing || !!pending"
              @click="offline(true)"
            >
              下架后编辑
            </button>
          </div>
        </template>
        <button
          v-if="mode !== 'detail' && mode !== 'create'"
          :disabled="writing || !!pending"
          @click="cancelEditing"
        >
          取消编辑 / 返回详情
        </button>
        <form
          v-if="mode === 'create' || mode === 'edit'"
          class="resource-form"
          @submit.prevent="save"
        >
          <fieldset :disabled="writing || !!pending || loading">
            <label>标题（1–100字）<input v-model="form.title" required autocomplete="off" /></label
            ><label
              >分类<select v-model="form.category_id" required>
                <option value="" disabled>请选择已启用分类</option>
                <option v-for="item in categories" :key="item.id" :value="item.id">
                  {{ item.name }}
                </option>
              </select></label
            ><label>简介（最多2000字）<textarea v-model="form.description" rows="5" /></label
            ><label
              >下载链接（HTTP/HTTPS）<input
                v-model="form.download_url"
                required
                autocomplete="off" /></label
            ><label
              >提取码（可选）<input v-model="form.extraction_code" autocomplete="off"
            /></label>
            <p v-if="mode === 'edit'">保存实质内容变更后，旧版反馈将清除。保存后仍需显式上架。</p>
            <button
              type="submit"
              :disabled="
                conflict || (mode === 'edit' && !detail?.allowed_actions.includes('update'))
              "
            >
              {{ mode === 'create' ? '保存草稿' : '确认保存' }}
            </button>
          </fieldset>
        </form>
        <form v-if="mode === 'offline'" class="resource-form" @submit.prevent="confirmOffline">
          <p>下架后学生暂不可查看；取消编辑或保存失败也不会恢复上架。</p>
          <fieldset :disabled="writing || !!pending || loading">
            <label>下架理由（1–500字）<textarea v-model="reason" required rows="4" /></label
            ><button
              type="submit"
              :disabled="conflict || !detail?.allowed_actions.includes('offline')"
            >
              确认下架
            </button>
          </fieldset>
        </form>
      </ElDrawer>
    </template>
    <p v-else role="alert">当前会话无权管理资料，请重新登录或联系管理员。</p>
  </main>
</template>
<style scoped>
.resource-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: end;
}
label {
  display: grid;
  gap: 0.4rem;
}
input,
select,
textarea {
  padding: 0.65rem;
  font: inherit;
  max-width: 100%;
}
.resource-table {
  overflow-x: auto;
}
table {
  min-width: 48rem;
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  padding: 0.8rem;
  text-align: left;
  border-bottom: 1px solid var(--control-border);
}
.resource-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
fieldset {
  display: grid;
  gap: 1rem;
  border: 0;
  padding: 1rem 0;
  min-width: 0;
}
</style>
