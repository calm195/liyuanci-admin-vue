import { onBeforeUnmount, reactive, watch } from 'vue'
import { useAdminStore } from '@/stores/admin'
import type { NoticeTone } from '@/stores/notices'

/** 仅包装用户主动读取；初次加载与后台刷新不弹成功提示，旧会话完成后不回填。 */
export function useOperationFeedback(hasFailure: () => boolean) {
  const admin = useAdminStore()
  const feedback = reactive<{ message: string; tone: NoticeTone; revision: number }>({
    message: '',
    tone: 'info',
    revision: 0,
  })
  let generation = 0
  let active = true
  onBeforeUnmount(() => {
    active = false
    generation++
  })
  watch(
    () => [admin.session, admin.forbidden],
    () => {
      generation++
      feedback.message = ''
    },
    { flush: 'sync' },
  )
  async function run(task: () => unknown, success = '查询已完成') {
    const current = ++generation
    const owner = admin.session
    feedback.message = '正在处理，请稍候…'
    feedback.tone = 'pending'
    feedback.revision++
    try {
      await task()
      if (!active || current !== generation || admin.session !== owner) return
      feedback.message = hasFailure() ? '' : success
      feedback.tone = 'success'
    } catch {
      if (!active || current !== generation || admin.session !== owner) return
      feedback.message = '操作未完成，请重试'
      feedback.tone = 'error'
    }
  }
  return { feedback, run }
}
