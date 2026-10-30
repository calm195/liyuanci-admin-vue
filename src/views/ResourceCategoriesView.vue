<script setup lang="ts">
import { ElDrawer } from 'element-plus'
import 'element-plus/theme-chalk/el-drawer.css'
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
  <main class="panel workflow">
    <p class="eyebrow">内容管理</p>
    <h1>资料分类</h1>
    <template v-if="workspace.allowed()"
      ><form class="workflow-actions" @submit.prevent="search">
        <label
          >启用状态
          <select v-model="enabled">
            <option value="">全部</option>
            <option value="true">启用</option>
            <option value="false">停用</option>
          </select></label
        ><button type="submit">查询 / 从首页刷新</button
        ><button type="button" :disabled="writing" @click="create">新建分类</button>
      </form>
      <p>排序数字越小越靠前；分类为单级结构。</p>
      <p v-if="dirty">条件已修改，请重新查询后翻页。</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <p v-if="busy" role="status">正在读取分类…</p>
      <p v-else-if="!error && !items.length">暂无符合条件的分类</p>
      <ul class="workflow-list">
        <li v-for="item in items" :key="item.id">
          <p>{{ item.name }} · 排序 {{ item.sort_order }} · {{ item.enabled ? '启用' : '停用' }}</p>
          <button :disabled="writing" :aria-label="`编辑分类 ${item.id}`" @click="open(item.id)">
            编辑分类
          </button>
        </li>
      </ul>
      <div class="workflow-actions">
        <button :disabled="busy || dirty || !history.length" @click="page(false)">上一页</button
        ><button :disabled="busy || dirty || !next" @click="page(true)">下一页</button>
      </div>
      <ElDrawer
        :model-value="!!selected"
        :title="selected === 'new' ? '新建分类' : '编辑分类'"
        size="min(38rem, 100vw)"
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
      </ElDrawer></template
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
