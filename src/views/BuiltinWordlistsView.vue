<script setup lang="ts">
import { computed } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import BuiltinWordlistEntries from '@/components/BuiltinWordlistEntries.vue'
import WordlistConfirmation from '@/components/WordlistConfirmation.vue'
import { useWordlists } from '@/composables/useWordlists'

const {
  items,
  heads,
  busy,
  writing,
  error,
  notice,
  resultId,
  loaded,
  workspace,
  labels,
  confirmation,
  status,
  load,
  prepareBuiltin,
  publish,
  canPublish,
  submit,
} = useWordlists()
const head = computed(() => heads.value.find((value) => value.kind === 'builtin'))
const selected = computed(() =>
  items.value.find((item) => item.id === (resultId.value ?? head.value?.effective_id)),
)
const editingVersion = computed(() =>
  selected.value?.id === head.value?.effective_id ? head.value?.version : undefined,
)
onBeforeRouteLeave(() => !writing.value)
</script>

<template>
  <main class="panel workflow" aria-label="内置词库管理">
    <template v-if="workspace.allowed()">
      <h2>go-swd 内置词库</h2>
      <p>与自定义词库同时扫描。词条调整保存为草稿，发布后生效。</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <p v-if="busy" role="status">正在读取词库版本…</p>
      <template v-if="selected">
        <p>
          {{ status(selected.status) }} · 资源版本 {{ selected.version }}
          <span v-if="selected.upstream_version"> · 上游 {{ selected.upstream_version }}</span>
        </p>
        <div v-if="selected.status === 'draft'" class="workflow-actions">
          <button type="button" :disabled="writing || !!confirmation" @click="load">
            返回当前生效版
          </button>
          <button
            v-if="canPublish(selected)"
            type="button"
            :disabled="writing || !!confirmation"
            @click="publish(selected)"
          >
            发布草稿
          </button>
        </div>
        <WordlistConfirmation
          v-if="confirmation"
          :confirmation="confirmation"
          :writing="writing"
          :labels="labels"
          @submit="submit"
          @cancel="confirmation = null"
        />
        <BuiltinWordlistEntries
          :id="selected.id"
          :key="selected.id"
          :head-version="editingVersion"
          :locked="writing || !!confirmation"
          @save="prepareBuiltin"
        />
      </template>
      <p v-else-if="loaded">内置词库尚无生效版本。</p>
      <button v-if="!selected" type="button" :disabled="busy || writing" @click="load">
        刷新内置词库
      </button>
    </template>
  </main>
</template>
