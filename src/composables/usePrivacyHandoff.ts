import { inject, ref } from 'vue'
import { routerKey, type RouteLocationNormalizedLoaded } from 'vue-router'
import { useAdminStore } from '@/stores/admin'
import type { AdminSession } from '@/types/admin'

type PrivacyPath = '/evidence-deletion' | '/deletion-receipts' | '/whispers/evidence'
const handoffs = new WeakMap<RouteLocationNormalizedLoaded, { owner: AdminSession; id: string }>()

/** 仅将授权关联项交给本次导航的目标页面，避免将后台标识写进 URL 或浏览器存储。 */
export function usePrivacyHandoff() {
  const router = inject(routerKey, null)
  const admin = useAdminStore()
  const pending = ref(false)
  const error = ref('')

  async function open(path: PrivacyPath, id: string) {
    const owner = admin.session
    if (!router || !owner || pending.value || !admin.can('super_admin')) return
    pending.value = true
    error.value = ''
    const fromRoute = router.currentRoute.value
    const remove = router.afterEach((to, from, failure) => {
      if (
        !failure &&
        from === fromRoute &&
        to.fullPath === path &&
        admin.session === owner &&
        admin.can('super_admin')
      ) {
        handoffs.set(to, { owner, id })
      }
    })
    try {
      const failure = await router.push(path)
      if (failure) error.value = '跳转未完成，请重试。'
    } catch {
      error.value = '跳转未完成，请重试。'
    } finally {
      remove()
      pending.value = false
    }
  }

  function consume() {
    if (!router) return
    const route = router.currentRoute.value
    const handoff = handoffs.get(route)
    handoffs.delete(route)
    if (handoff && admin.session === handoff.owner && admin.can('super_admin')) return handoff.id
  }

  return { open, consume, pending, error }
}
