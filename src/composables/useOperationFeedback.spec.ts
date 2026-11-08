import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import { useOperationFeedback } from './useOperationFeedback'
import { useAdminStore } from '@/stores/admin'
let feedback: ReturnType<typeof useOperationFeedback> | undefined
let failed = false
const Harness = defineComponent({
  setup() {
    feedback = useOperationFeedback(() => failed)
    return () => null
  },
})
describe('用户主动操作反馈', () => {
  it('换会话立即撤销处理中提示，晚到响应不能再次报告成功', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    let finish: (() => void) | undefined
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    const wrapper = mount(Harness, { global: { plugins: [pinia] } })
    if (!feedback) throw new Error('未初始化反馈')
    const execution = feedback.run(() => pending)
    expect(feedback.feedback.tone).toBe('pending')
    useAdminStore().forbidden++
    expect(feedback.feedback.message).toBe('')
    finish?.()
    await execution
    await flushPromises()
    expect(feedback.feedback.message).toBe('')
    wrapper.unmount()
  })
  it('页面已显示业务错误时不覆盖为成功，重复主动查询更新通知代次', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    failed = true
    const wrapper = mount(Harness, { global: { plugins: [pinia] } })
    if (!feedback) throw new Error('未初始化反馈')
    await feedback.run(() => undefined)
    expect(feedback.feedback.message).toBe('')
    failed = false
    await feedback.run(() => undefined)
    const revision = feedback.feedback.revision
    expect(feedback.feedback.message).toBe('查询已完成')
    await feedback.run(() => undefined)
    expect(feedback.feedback.revision).toBe(revision + 1)
    wrapper.unmount()
  })
})
