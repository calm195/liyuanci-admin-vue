<script setup lang="ts">
import { useAutoSearch } from '@/composables/useAutoSearch'
import { useOperationFeedback } from '@/composables/useOperationFeedback'
import FloatingNotice from '@/components/FloatingNotice.vue'
import NumberedPagination from '@/components/NumberedPagination.vue'
import PageSizeSelect from '@/components/PageSizeSelect.vue'
import WorkspaceHeading from '@/components/WorkspaceHeading.vue'
import WorkspaceDrawer from '@/components/WorkspaceDrawer.vue'
import { useResourceCategories } from '@/composables/useResourceCategories'
const {
  pageSize,
  inlineAction,
  formDirty,
  toggleState,
  enabled,
  items,
  next,
  history,
  busy,
  loading,
  writing,
  error,
  detailError,
  notice,
  selected,
  detail,
  form,
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
  refresh,
  save,
  runPending,
} = useResourceCategories()
const { feedback: readFeedback, run: runRead } = useOperationFeedback(() => Boolean(error.value))
const automaticSearch = useAutoSearch(search, () => !writing.value && workspace.allowed())
function resizePage(size: number) {
  pageSize.value = size
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
  <main class="experience-page category-page" aria-label="资料分类">
    <WorkspaceHeading
      title="资料分类"
      description="维护分类名称、排序与启用状态；排序数字越小越靠前。"
    >
      <button
        class="business-primary"
        type="button"
        :disabled="writing || !!pending"
        @click="create"
      >
        新建分类
      </button>
    </WorkspaceHeading>
    <template v-if="workspace.allowed()">
      <section class="experience-panel experience-table-panel">
        <form
          id="category-filters"
          class="experience-filters"
          @input="automaticSearch.input"
          @change="automaticSearch.change"
          @compositionstart="automaticSearch.start"
          @compositionend="automaticSearch.end"
          @submit="automaticSearch.cancel"
          @submit.prevent="runRead(() => search(), '查询已完成')"
        >
          <label
            >启用状态
            <select v-model="enabled">
              <option value="">全部</option>
              <option value="true">启用</option>
              <option value="false">停用</option>
            </select></label
          >
          <button type="submit" :disabled="busy || writing">刷新</button>
        </form>
        <FloatingNotice v-if="error" :message="error" tone="error">{{ error }}</FloatingNotice>
        <FloatingNotice v-if="notice" :message="notice" tone="info">{{ notice }}</FloatingNotice>
        <p v-if="busy" role="status">正在读取分类…</p>
        <p v-else-if="!error && !items.length" class="experience-empty">暂无符合条件的分类</p>
        <div
          v-if="items.length"
          class="business-table"
          tabindex="0"
          aria-label="可横向滚动的分类列表"
        >
          <table>
            <caption>
              资料分类查询结果
            </caption>
            <thead>
              <tr>
                <th scope="col">分类名称</th>
                <th scope="col">排序</th>
                <th scope="col">状态</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in items" :key="item.id">
                <td>{{ item.name }}</td>
                <td>{{ item.sort_order }}</td>
                <td>
                  <button
                    class="inline-switch"
                    role="switch"
                    :aria-checked="item.enabled"
                    :aria-label="`启用分类 ${item.name}`"
                    :disabled="writing || !!pending || !!selected"
                    @click="toggleState(item)"
                  >
                    <span aria-hidden="true"></span></button
                  ><span>{{ item.enabled ? '启用' : '停用' }}</span>
                </td>
                <td>
                  <button
                    :disabled="writing"
                    :aria-label="`编辑分类 ${item.name}`"
                    @click="open(item.id)"
                  >
                    编辑分类
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
          :page-size="pageSize"
          :disabled="busy || writing"
          @turn="turn"
          @resize="resizePage"
        />
        <div v-else class="business-pagination" role="group" aria-label="分页操作">
          <PageSizeSelect v-model="pageSize" :disabled="busy || writing" @change="search" />
          <button :disabled="busy || dirty || !history.length" @click="page(false)">上一页</button
          ><button :disabled="busy || dirty || !next" @click="page(true)">下一页</button>
        </div>
      </section>
      <section v-if="inlineAction && pending" class="experience-panel">
        <p>{{ detailError || '分类状态切换尚未确认，请使用原请求核实。' }}</p>
        <button :disabled="writing" @click="runPending">原样重试</button>
      </section>
      <WorkspaceDrawer
        :guard-route="false"
        presentation="dialog"
        :open="!!selected && !inlineAction"
        :dirty="formDirty"
        :title="selected === 'new' ? '新建分类' : '编辑分类'"
        :busy="writing || !!pending"
        description="单级分类；改名会同步影响引用资料。"
        @close="close"
      >
        <p v-if="loading" role="status">正在读取分类…</p>
        <FloatingNotice v-if="detailError" :message="detailError" tone="error">{{
          detailError
        }}</FloatingNotice>
        <p v-if="pending">操作结果尚待确认，输入已锁定，请原样重试。</p>
        <button v-if="pending" :disabled="writing" @click="runPending">原样重试</button
        ><button
          v-if="selected !== 'new' && !pending"
          :disabled="writing || loading"
          @click="runRead(() => refresh(), '查询已完成')"
        >
          重新读取并核对
        </button>
        <p v-if="conflict">请重新读取，核对当前分类与本地输入后再确认保存。</p>
        <form id="category-editor" class="experience-editor" @submit.prevent="save">
          <fieldset :disabled="writing || !!pending || loading">
            <label
              >分类名称（1–30字）<input v-model="form.name" required autocomplete="off" /></label
            ><label
              >排序（0–9999）<input
                v-model.number="form.sort_order"
                type="number"
                min="0"
                max="9999"
                step="1"
                required /></label
            ><label v-if="selected !== 'new'" class="category-enabled"
              ><input v-model="form.enabled" type="checkbox" />启用此分类</label
            >
            <p v-else>新分类默认启用。</p>
            <p>改名同步影响引用资料的显示。任意草稿、上架或下架资料仍引用时，不能停用分类。</p>
          </fieldset>
        </form>
        <RouterLink
          v-if="detail?.enabled"
          :to="{ path: '/resources', query: { category_id: detail.id } }"
          >查看此分类资料</RouterLink
        >
        <template #footer
          ><div class="drawer-actions">
            <button data-overlay-close :disabled="writing || !!pending" @click="close">取消</button>
            <button v-if="pending" class="business-primary" :disabled="writing" @click="runPending">
              原样重试
            </button>
            <button
              v-else
              class="business-primary"
              type="submit"
              form="category-editor"
              :disabled="writing || loading || conflict || (selected !== 'new' && !detail)"
            >
              确认保存
            </button>
          </div></template
        >
      </WorkspaceDrawer>
    </template>
    <p v-else role="alert">当前会话无权管理分类，请重新登录或联系管理员。</p>
  </main>
</template>
<style scoped>
fieldset {
  display: grid;
  gap: 1rem;
  border: 0;
  padding: 1rem 0;
  min-width: 0;
}
label {
  display: grid;
  gap: 0.4rem;
}
input,
select {
  padding: 0.65rem;
  font: inherit;
  max-width: 100%;
}
.category-enabled {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.category-enabled input {
  width: auto;
}
</style>
