import { computed, reactive, ref, watch } from 'vue'
import { ApiError } from '@/services/admin'
import { createContentManagementClient } from '@/services/content-management'
import type {
  ContentDetail,
  ContentFilters,
  ContentKind,
  ContentSummary,
} from '@/services/content-management'
import { useAdminStore } from '@/stores/admin'
import { reviewErrorMessage, useAdminWorkspace } from './useAdminWorkspace'

const defaults = (): ContentFilters => ({
  keyword: '',
  state: '',
  requester: '',
  helper: '',
  from: '',
  until: '',
})

export function useContentManagement(kind: () => ContentKind) {
  const admin = useAdminStore()
  const draft = reactive(defaults())
  const submitted = ref(defaults())
  const dirty = computed(() => JSON.stringify(draft) !== JSON.stringify(submitted.value))
  const items = ref<ContentSummary[]>([])
  const detail = ref<ContentDetail | null>(null)
  const selected = ref<string | null>(null)
  const commentsPage = ref(0)
  const cursor = ref<string | null>(null)
  const next = ref<string | null>(null)
  const history = ref<(string | null)[]>([])
  const busy = ref(false)
  const error = ref('')
  const notice = ref('')
  const workspace = useAdminWorkspace(clear)
  const client = createContentManagementClient(admin.session?.token ?? '', workspace.allowed)

  function clear() {
    items.value = []
    detail.value = null
    selected.value = null
    commentsPage.value = 0
    cursor.value = null
    next.value = null
    history.value = []
    busy.value = false
    error.value = ''
    notice.value = ''
    Object.assign(draft, defaults())
    submitted.value = defaults()
  }

  function message(cause: unknown) {
    if (cause instanceof ApiError && cause.status === 400)
      return '查询条件或分页已失效，请从首页重查'
    return reviewErrorMessage(cause)
  }

  async function run<T>(
    task: (signal: AbortSignal) => Promise<T>,
    success: (result: T) => void,
    failure = message,
  ) {
    workspace.cancel()
    busy.value = true
    error.value = ''
    notice.value = ''
    await workspace.run(
      task,
      success,
      (cause) => {
        error.value = failure(cause)
      },
      () => {
        busy.value = false
      },
    )
  }

  async function load() {
    selected.value = null
    detail.value = null
    items.value = []
    next.value = null
    await run(
      (signal) => client.list(kind(), submitted.value, cursor.value, signal),
      (result) => {
        items.value = result.items
        next.value = result.next
      },
    )
  }

  async function search() {
    if (draft.from && draft.until && draft.from > draft.until) {
      error.value = '结束日期必须等于或晚于起始日期'
      return
    }
    submitted.value = { ...draft }
    cursor.value = null
    history.value = []
    await load()
  }

  async function page(forward: boolean) {
    if (busy.value || dirty.value) return
    if (forward) {
      if (next.value === null) return
      history.value.push(cursor.value)
      cursor.value = next.value
    } else {
      if (!history.value.length) return
      cursor.value = history.value.pop() ?? null
    }
    await load()
  }

  async function open(id: string, commentPage = 0) {
    selected.value = id
    detail.value = null
    await run(
      (signal) => client.detail(kind(), id, commentPage, signal),
      (result) => {
        detail.value = result
        commentsPage.value = commentPage
      },
    )
  }

  function close() {
    selected.value = null
    detail.value = null
    workspace.cancel()
    busy.value = false
    error.value = ''
    notice.value = ''
  }

  async function download() {
    const current = detail.value
    const contentKind = kind()
    if (busy.value || !current?.exportable || !admin.can('super_admin')) return
    await run(
      (signal) => client.export(contentKind, current.id, signal),
      (markdown) => {
        const url = URL.createObjectURL(
          new Blob([markdown], { type: 'text/markdown;charset=utf-8' }),
        )
        try {
          const link = document.createElement('a')
          link.href = url
          link.download = `${contentKind === 'wishes' ? '心愿故事' : '悄悄话'}-${current.id}.md`
          link.click()
          notice.value = '公众号草稿已生成'
        } finally {
          setTimeout(() => URL.revokeObjectURL(url), 0)
        }
      },
      (cause) =>
        cause instanceof ApiError && cause.status === 409
          ? '内容已不可导出，请刷新详情'
          : message(cause),
    )
  }

  watch(
    kind,
    () => {
      workspace.cancel()
      clear()
      void load()
    },
    { immediate: true },
  )

  return {
    admin,
    workspace,
    draft,
    dirty,
    items,
    detail,
    selected,
    commentsPage,
    next,
    history,
    busy,
    error,
    notice,
    search,
    page,
    open,
    close,
    download,
  }
}
