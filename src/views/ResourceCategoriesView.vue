<script setup lang="ts">
import BusinessToolbar from '@/components/BusinessToolbar.vue'
import { ElDialog } from 'element-plus'
import 'element-plus/theme-chalk/el-dialog.css'
import 'element-plus/theme-chalk/el-overlay.css'
import { useResourceCategories } from '@/composables/useResourceCategories'
const {
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
  open,
  create,
  close,
  refresh,
  save,
  runPending,
} = useResourceCategories()
</script>
<template>
  <main class="panel workflow" aria-label="资料分类">
    <template v-if="workspace.allowed()"
      ><form id="category-filters" class="business-filters" @submit.prevent="search">
        <label
          >启用状态
          <select v-model="enabled">
            <option value="">全部</option>
            <option value="true">启用</option>
            <option value="false">停用</option>
          </select></label
        >
      </form>
      <BusinessToolbar label="资料分类操作栏">
        <button class="business-primary" type="button" :disabled="writing" @click="create">
          新建分类
        </button>
        <template #tools>
          <button type="submit" form="category-filters">查询 / 从首页刷新</button>
        </template>
      </BusinessToolbar>
      <p>排序数字越小越靠前；分类为单级结构。</p>
      <p v-if="dirty">条件已修改，请重新查询后翻页。</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <p v-if="busy" role="status">正在读取分类…</p>
      <p v-else-if="!error && !items.length">暂无符合条件的分类</p>
      <div v-if="items.length" class="business-table">
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
              <th scope="row">{{ item.name }}</th>
              <td>{{ item.sort_order }}</td>
              <td>{{ item.enabled ? '启用' : '停用' }}</td>
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
      <div class="business-pagination" role="group" aria-label="分页操作">
        <button :disabled="busy || dirty || !history.length" @click="page(false)">上一页</button
        ><button :disabled="busy || dirty || !next" @click="page(true)">下一页</button>
      </div>
      <ElDialog
        :model-value="!!selected"
        :title="selected === 'new' ? '新建分类' : '编辑分类'"
        class="business-dialog"
        width="min(38rem, calc(100vw - 2rem))"
        top="2rem"
        :close-on-click-modal="false"
        :close-on-press-escape="false"
        :show-close="false"
        ><button :disabled="writing" @click="close">关闭</button>
        <p v-if="loading" role="status">正在读取分类…</p>
        <p v-if="detailError" role="alert">{{ detailError }}</p>
        <p v-if="pending">操作结果尚待确认，输入已锁定，请原样重试。</p>
        <button v-if="pending" :disabled="writing" @click="runPending">原样重试</button
        ><button
          v-if="selected !== 'new' && !pending"
          :disabled="writing || loading"
          @click="refresh"
        >
          重新读取并核对
        </button>
        <p v-if="conflict">请重新读取，核对当前分类与本地输入后再确认保存。</p>
        <form @submit.prevent="save">
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
            <button type="submit" :disabled="conflict || (selected !== 'new' && !detail)">
              确认保存
            </button>
          </fieldset>
        </form>
        <RouterLink
          v-if="detail?.enabled"
          :to="{ path: '/resources', query: { category_id: detail.id } }"
          >查看此分类资料</RouterLink
        >
      </ElDialog></template
    >
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
