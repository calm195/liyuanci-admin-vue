<script setup lang="ts">
import { useAutoSearch } from '@/composables/useAutoSearch'
import { useOperationFeedback } from '@/composables/useOperationFeedback'
import { resourceStatusLabels } from '@/utils/dictionary-labels'

import { computed } from 'vue'
import { useDictionariesStore } from '@/stores/dictionaries'
const dictionaries = useDictionariesStore()
const feedbackLabels = computed(() => ({
  valid: dictionaries.label('resource_feedback', 'valid'),
  link_invalid: dictionaries.label('resource_feedback', 'link_invalid'),
  outdated: dictionaries.label('resource_feedback', 'outdated'),
  incomplete: dictionaries.label('resource_feedback', 'incomplete'),
}))
import FloatingNotice from '@/components/FloatingNotice.vue'
import NumberedPagination from '@/components/NumberedPagination.vue'
import PageSizeSelect from '@/components/PageSizeSelect.vue'
import WorkspaceHeading from '@/components/WorkspaceHeading.vue'
import WorkspaceDrawer from '@/components/WorkspaceDrawer.vue'
import { useResources } from '@/composables/useResources'
import { resourceStatuses } from '@/types/resources'
const {
  filters,
  inlineAction,
  inlineStatus,
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
  source,
  uploadedFile,
  uploadPending,
  selectFile,
  upload,
  reason,
  conflict,
  pending,
  dirty,
  workspace,
  search,
  page,
  pageNumber,
  total,
  turn,
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
const { feedback: readFeedback, run: runRead } = useOperationFeedback(
  () => Boolean(error.value) || Boolean(categoryError.value) || Boolean(detailError.value),
)
const automaticSearch = useAutoSearch(search, () => !writing.value && workspace.allowed())
function resizePage(size: number) {
  filters.limit = size
  return search()
}
</script>
<template>
  <FloatingNotice
    v-if="readFeedback.message"
    :message="readFeedback.message"
    :tone="readFeedback.tone"
    :revision="readFeedback.revision"
  />
  <main class="experience-page resource-workspace" aria-label="资料列表">
    <WorkspaceHeading
      :title="
        selected && mode !== 'detail' && !inlineAction
          ? mode === 'create'
            ? '新建资料'
            : mode === 'offline'
              ? '确认下架'
              : '编辑资料'
          : '资料管理'
      "
      description="管理分类、简介、文件与下载链接；草稿保存后仍需显式上架。"
    >
      <button
        v-if="!selected || mode === 'detail' || inlineAction"
        class="business-primary"
        :disabled="writing || !!pending"
        @click="create"
      >
        新建资料
      </button>
      <button v-else :disabled="writing || !!pending" @click="close">返回资料列表</button>
    </WorkspaceHeading>
    <template v-if="workspace.allowed()">
      <section
        v-if="!selected || mode === 'detail' || inlineAction"
        class="experience-panel experience-table-panel"
      >
        <form
          id="resource-filters"
          class="experience-filters"
          @input="automaticSearch.input"
          @change="automaticSearch.change"
          @compositionstart="automaticSearch.start"
          @compositionend="automaticSearch.end"
          @submit="automaticSearch.cancel"
          @submit.prevent="runRead(() => search(), '查询已完成')"
        >
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
                {{ resourceStatusLabels(status) }}
              </option>
            </select></label
          >
          <button type="submit" :disabled="busy || writing">刷新</button>
        </form>
        <FloatingNotice v-if="categoryError" :message="categoryError" tone="error">
          {{ categoryError }}
          <button @click="runRead(() => loadCategories(), '查询已完成')">重新读取分类</button>
        </FloatingNotice>
        <p v-if="categoriesBusy">正在读取分类…</p>
        <FloatingNotice v-if="notice" :message="notice" tone="info">{{ notice }}</FloatingNotice>
        <FloatingNotice v-if="error" :message="error" tone="error">{{ error }}</FloatingNotice>
        <p v-if="busy" role="status">正在读取资料…</p>
        <p v-else-if="!error && !items.length" class="experience-empty">暂无符合条件的资料</p>
        <div v-if="items.length" class="business-table">
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
                <td>{{ item.category.name }} · {{ resourceStatusLabels(item.status) }}</td>
                <td>
                  <span v-for="(label, kind) in feedbackLabels" :key="kind" class="feedback-count"
                    >{{ label }} {{ item.feedback_summary[kind] }}
                  </span>
                </td>
                <td>{{ time(item.updated_at) }}</td>
                <td>
                  <button
                    :aria-label="`查看资料 ${item.title}`"
                    :disabled="writing"
                    @click="open(item.id)"
                  >
                    查看详情
                  </button>
                  <button
                    v-if="item.allowed_actions.includes('publish')"
                    :disabled="writing || !!pending || loading"
                    @click="inlineStatus(item.id, 'publish')"
                  >
                    上架
                  </button>
                  <button
                    v-if="item.allowed_actions.includes('offline')"
                    class="business-danger"
                    :disabled="writing || !!pending || loading"
                    @click="inlineStatus(item.id, 'offline')"
                  >
                    下架
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <NumberedPagination
          v-if="total !== null"
          :page="pageNumber"
          :total="total"
          :page-size="filters.limit"
          :disabled="busy || writing"
          @turn="turn"
          @resize="resizePage"
        />
        <div v-else class="business-pagination" role="group" aria-label="分页操作">
          <PageSizeSelect v-model="filters.limit" :disabled="busy || writing" @change="search" />
          <button :disabled="busy || dirty || !history.length" @click="page(false)">上一页</button
          ><button :disabled="busy || dirty || !next" @click="page(true)">下一页</button>
        </div>
      </section>
      <section
        v-if="selected && mode !== 'detail' && !inlineAction"
        class="experience-panel resource-editor-panel"
      >
        <p v-if="loading" role="status">正在读取详情…</p>
        <FloatingNotice v-if="detailError" :message="detailError" tone="error">{{
          detailError
        }}</FloatingNotice>
        <p v-if="pending">操作结果尚待确认，输入已锁定。请保留原操作重试。</p>
        <button v-if="pending" :disabled="writing" @click="runPending">原样重试</button>
        <button
          v-if="selected !== 'new' && !pending"
          :disabled="writing || loading"
          @click="runRead(() => refresh(), '查询已完成')"
        >
          重新读取并核对
        </button>
        <p v-if="conflict">请重新读取，核对当前内容与本地输入后再确认保存。</p>
        <button v-if="mode !== 'create'" :disabled="writing || !!pending" @click="cancelEditing">
          取消编辑 / 返回详情
        </button>
        <form
          v-if="mode === 'create' || mode === 'edit'"
          class="resource-form experience-editor"
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
            ><label>简介（最多2000字）<textarea v-model="form.description" rows="5" /></label>
            <label
              >资料来源<select v-model="source">
                <option value="file">上传文件</option>
                <option value="link">外部下载链接</option>
              </select></label
            >
            <section v-if="source === 'file'" aria-label="资料文件">
              <p v-if="uploadedFile">
                当前文件：{{ uploadedFile.name }} · {{ (uploadedFile.size / 1024).toFixed(1) }} KiB
              </p>
              <label
                >{{ uploadedFile ? '选择替换文件' : '选择资料文件' }}（不超过20 MiB）<input
                  type="file"
                  @change="selectFile"
              /></label>
              <p v-if="uploadPending">待上传：{{ uploadPending.file.name }}</p>
              <button type="button" :disabled="!uploadPending" @click="upload">
                上传所选文件 / 重试
              </button>
              <p>文件上传成功后保存资料；替换失败时原文件保持可用。</p>
            </section>
            <template v-else
              ><label
                >下载链接（HTTP/HTTPS）<input
                  v-model="form.download_url"
                  required
                  autocomplete="off" /></label
              ><label
                >提取码（可选）<input v-model="form.extraction_code" autocomplete="off" /></label
            ></template>
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
        <form
          v-if="mode === 'offline'"
          class="resource-form experience-editor"
          @submit.prevent="confirmOffline"
        >
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
      </section>
      <WorkspaceDrawer
        presentation="dialog"
        :open="inlineAction && mode === 'offline'"
        title="下架资料"
        :busy="writing || !!pending"
        :dirty="!!reason"
        @close="close(true)"
      >
        <p>下架后学生暂不可查看这份资料。</p>
        <p v-if="detailError" role="alert">{{ detailError }}</p>
        <form id="inline-offline" @submit.prevent="confirmOffline">
          <label
            >下架理由（1–500字）<textarea
              v-model="reason"
              :disabled="writing || !!pending"
              required
              rows="4"
            />
          </label>
        </form>
        <template #footer
          ><div class="drawer-actions">
            <button data-overlay-close :disabled="writing || !!pending">取消</button
            ><button v-if="pending" :disabled="writing" @click="runPending">原样重试</button
            ><button
              v-else
              class="business-primary"
              form="inline-offline"
              type="submit"
              :disabled="writing"
            >
              确认下架
            </button>
          </div></template
        >
      </WorkspaceDrawer>
      <section v-if="inlineAction && pending && mode !== 'offline'" class="experience-panel">
        <p>{{ detailError || '操作结果尚未确认，请使用原请求核实。' }}</p>
        <button :disabled="writing" @click="runPending">原样重试</button>
      </section>
      <WorkspaceDrawer
        :open="!!selected && mode === 'detail' && !inlineAction"
        :title="detail?.title ?? '资料详情'"
        :busy="writing || !!pending"
        @close="close(true)"
      >
        <p v-if="loading" role="status">正在读取详情…</p>
        <p v-if="detailError" role="alert">{{ detailError }}</p>
        <p v-if="pending">操作结果尚待确认，请原样重试。</p>
        <button v-if="pending" :disabled="writing" @click="runPending">原样重试</button>
        <button
          v-if="!pending"
          :disabled="writing || loading"
          @click="runRead(() => refresh(), '查询已完成')"
        >
          重新读取并核对
        </button>
        <template v-if="detail && mode === 'detail'">
          <h2>{{ detail.title }}</h2>
          <p>{{ detail.category.name }} · {{ resourceStatusLabels(detail.status) }}</p>
          <p class="resource-text">{{ detail.description || '暂无简介' }}</p>
          <p v-if="detail.file">
            文件：{{ detail.file.name }} · {{ (detail.file.size / 1024).toFixed(1) }} KiB
          </p>
          <template v-else
            ><p class="resource-text">下载链接：{{ detail.download_url }}</p>
            <p>提取码：{{ detail.extraction_code ?? '无提取码' }}</p></template
          >
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
        <template #footer
          ><div class="drawer-actions">
            <button data-overlay-close :disabled="writing || !!pending" @click="close">关闭</button>
          </div></template
        >
      </WorkspaceDrawer>
    </template>
    <p v-else role="alert">当前会话无权管理资料，请重新登录或联系管理员。</p>
  </main>
</template>
<style scoped>
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
.feedback-count {
  display: inline-block;
  margin-inline-end: 0.75rem;
  white-space: nowrap;
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
