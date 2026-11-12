<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useAdminStore } from '@/stores/admin'
import type { ContentImage } from '@/services/content-images'
const props = defineProps<{ images: ContentImage[] }>()
const admin = useAdminStore()
const previews = ref<{ id: string; url: string; position: number; state: string }[]>([])
const error = ref('')
const revision = ref(0)
let generation = 0
let controller: AbortController | undefined
let urls: string[] = []
function clear() {
  generation++
  controller?.abort()
  for (const url of urls) URL.revokeObjectURL(url)
  urls = []
  previews.value = []
  error.value = ''
}
watch(
  () => [props.images, admin.session?.token, revision.value] as const,
  async ([images, token]) => {
    clear()
    if (!token) return
    const current = generation
    const abort = new AbortController()
    controller = abort
    try {
      for (const image of images) {
        let url = image.url
        if (url.startsWith('/api/v1/')) {
          const response = await globalThis.fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
            signal: abort.signal,
            credentials: 'same-origin',
            cache: 'no-store',
          })
          if (current !== generation) return
          if (!response.ok) {
            // 图片端点同样参与撤权，不能让前几张已读取的敏感预览继续留在页面。
            if (response.status === 401 || response.status === 403) {
              clear()
              if (admin.session?.token === token) {
                if (response.status === 401) admin.clear('登录已失效，请重新登录')
                else admin.forbidden++
              }
            }
            throw new Error('图片读取失败，请刷新案件权限后重试')
          }
          const blob = await response.blob()
          if (!['image/png', 'image/jpeg'].includes(blob.type) || blob.size > 4 * 1024 * 1024)
            throw new Error('图片格式或大小异常')
          if (current !== generation) return
          url = URL.createObjectURL(blob)
          urls.push(url)
        }
        if (current !== generation) return
        previews.value.push({
          id: image.id,
          url,
          position: image.position,
          state: image.scan_state,
        })
      }
    } catch (cause) {
      if (current === generation && !abort.signal.aborted) {
        // 404也可能表示内容屏障，失败后不能继续保留先前已加载的同组图片。
        for (const url of urls) URL.revokeObjectURL(url)
        urls = []
        previews.value = []
        error.value = cause instanceof Error ? cause.message : '图片读取失败'
      }
    }
  },
  { immediate: true },
)
onBeforeUnmount(clear)
</script>
<template>
  <section aria-label="内容图片">
    <figure v-for="image in previews" :key="image.id">
      <img :src="image.url" :alt="`图片 ${image.position + 1}`" referrerpolicy="no-referrer" />
      <figcaption>图片 {{ image.position + 1 }} · {{ image.state }}</figcaption>
    </figure>
    <p v-if="error" role="alert">{{ error }}</p>
    <button v-if="error" type="button" @click="revision++">重试图片</button>
  </section>
</template>
<style scoped>
img {
  display: block;
  max-width: 100%;
  max-height: 320px;
  object-fit: contain;
}
figure {
  margin: 12px 0;
}
</style>
