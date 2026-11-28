import { computed, ref, watch } from 'vue'
import { useAdminStore } from '@/stores/admin'
import { ApiError } from '@/services/admin'
import { createUsersClient } from '@/services/users'
import { userRoles } from '@/types/users'
import type { UserDetail, UserPenalty } from '@/types/users'
import { useAdminWorkspace, reviewErrorMessage } from './useAdminWorkspace'

export function useUserDetail() {
  const admin = useAdminStore()
  const selectedUser = ref<string | null>(null)
  const detail = ref<UserDetail | null>(null)
  const detailBusy = ref(false)
  const detailError = ref('')
  const penalties = ref<UserPenalty[]>([])
  const penaltyCursors = ref<(string | null)[]>([null])
  const nextPenaltyCursor = ref<string | null>(null)
  const penaltyBusy = ref(false)
  const penaltyError = ref('')
  const penaltyPage = computed(() => penaltyCursors.value.length)
  const canViewPenalties = computed(() => detail.value?.allowed_actions.includes('view_penalties'))
  const workspace = useAdminWorkspace(clear, userRoles)
  const client = createUsersClient(admin.session?.token ?? '', workspace.allowed)

  function clear() {
    selectedUser.value = null
    detail.value = null
    detailBusy.value = false
    detailError.value = ''
    penalties.value = []
    penaltyCursors.value = [null]
    nextPenaltyCursor.value = null
    penaltyBusy.value = false
    penaltyError.value = ''
  }
  function closeUser() {
    workspace.cancel()
    clear()
  }
  async function openUser(id: string) {
    closeUser()
    selectedUser.value = id
    detailBusy.value = true
    await workspace.run(
      (signal) => client.user(id, signal),
      async (value) => {
        detail.value = value
        detailBusy.value = false
        if (canViewPenalties.value) await loadPenalties()
      },
      (error) => {
        detailError.value = reviewErrorMessage(error)
      },
      () => {
        detailBusy.value = false
      },
    )
  }
  async function loadPenalties() {
    const id = detail.value?.id
    if (!id || !canViewPenalties.value || penaltyBusy.value) return
    const cursor = penaltyCursors.value.at(-1) ?? null
    penalties.value = []
    nextPenaltyCursor.value = null
    penaltyError.value = ''
    penaltyBusy.value = true
    await workspace.run(
      (signal) => client.userPenalties(id, cursor, signal),
      (value) => {
        penalties.value = value.items
        if (!penaltyCursors.value.includes(value.next_cursor))
          nextPenaltyCursor.value = value.next_cursor
      },
      (error) => {
        if (error instanceof ApiError && error.status === 404) {
          detail.value = null
          detailError.value = reviewErrorMessage(error)
        } else {
          penaltyError.value =
            error instanceof ApiError && error.status === 400
              ? '处罚历史分页已失效，请从第一页重新查询。'
              : reviewErrorMessage(error)
        }
      },
      () => {
        penaltyBusy.value = false
      },
    )
  }
  async function turnPenalties(direction: 'first' | 'previous' | 'next') {
    if (!canViewPenalties.value || penaltyBusy.value) return
    if (direction === 'first') penaltyCursors.value = [null]
    else if (direction === 'previous' && penaltyPage.value > 1) penaltyCursors.value.pop()
    else if (direction === 'next' && nextPenaltyCursor.value)
      penaltyCursors.value.push(nextPenaltyCursor.value)
    else return
    await loadPenalties()
  }

  // 降为仍能访问本页的岗位时，旧历史投影同样需要清除。
  watch(() => [admin.forbidden, ...(admin.session?.account.roles ?? [])], closeUser, {
    flush: 'sync',
  })
  return {
    selectedUser,
    detail,
    detailBusy,
    detailError,
    canViewPenalties,
    penalties,
    penaltyPage,
    nextPenaltyCursor,
    penaltyBusy,
    penaltyError,
    openUser,
    closeUser,
    turnPenalties,
  }
}
