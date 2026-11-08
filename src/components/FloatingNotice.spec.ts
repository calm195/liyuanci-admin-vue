import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import FloatingNotice from './FloatingNotice.vue'
import { useNoticesStore } from '@/stores/notices'
let pinia: ReturnType<typeof createPinia>
const wrappers: VueWrapper[] = []
beforeEach(() => {
  vi.useFakeTimers()
  pinia = createPinia()
  setActivePinia(pinia)
})
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  vi.useRealTimers()
})
function show(
  message: string,
  tone: 'success' | 'error' | 'info' | 'pending' | 'warning' | 'uncertain' = 'info',
) {
  const wrapper = mount(FloatingNotice, {
    props: { message, tone },
    global: { plugins: [pinia], stubs: { NoticePortal: false } },
  })
  wrappers.push(wrapper)
  return wrapper
}
function elements() {
  return document.body.querySelectorAll<HTMLElement>('.floating-notice')
}
describe('悬浮操作提示', () => {
  it('挂到body，成功3秒/错误6秒消失且不改变输入错误状态', async () => {
    const success = show('保存成功', 'success')
    const failure = show('读取失败', 'error')
    await nextTick()
    expect(success.html()).not.toContain('保存成功')
    expect(elements()).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(3000)
    expect(elements()).toHaveLength(1)
    expect(elements()[0]?.textContent).toContain('读取失败')
    await vi.advanceTimersByTimeAsync(3000)
    expect(elements()).toHaveLength(0)
    expect(failure.props('message')).toBe('读取失败')
  })
  it('手动关闭立即移除，同一组件新消息重新计时', async () => {
    const wrapper = show('首次失败', 'error')
    await nextTick()
    document.body.querySelector<HTMLButtonElement>('.floating-notice-close')?.click()
    await nextTick()
    expect(elements()).toHaveLength(0)
    await wrapper.setProps({ message: '再次失败' })
    expect(elements()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(5999)
    expect(elements()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(elements()).toHaveLength(0)
  })
  it('悬停与键盘焦点暂停消失，离开后使用剩余时间', async () => {
    show('可操作提示', 'error')
    await nextTick()
    await vi.advanceTimersByTimeAsync(2000)
    elements()[0]?.dispatchEvent(new MouseEvent('mouseenter'))
    await vi.advanceTimersByTimeAsync(10000)
    expect(elements()).toHaveLength(1)
    elements()[0]?.dispatchEvent(new MouseEvent('mouseleave'))
    elements()[0]?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(10000)
    expect(elements()).toHaveLength(1)
    elements()[0]?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(4000)
    expect(elements()).toHaveLength(0)
  })
  it('不同消息按真实高度排位，重复消息合并且最多保留三条', async () => {
    show('第一条')
    show('第二条')
    show('第三条')
    await nextTick()
    const store = useNoticesStore()
    const first = store.items[0]
    if (!first) throw new Error('缺少提示')
    store.measure(first.id, 120)
    await nextTick()
    expect(elements()[1]?.style.top).toBe('152px')
    show('第二条')
    await nextTick()
    expect(elements()).toHaveLength(3)
    expect(
      Array.from(elements()).filter((element) => element.textContent?.includes('第二条')),
    ).toHaveLength(1)
    show('第四条')
    await nextTick()
    expect(elements()).toHaveLength(3)
    expect(document.body.textContent).not.toContain('第一条')
  })
  it('同样的操作结果可用代次重新提示，错误关闭后保留页面原因', async () => {
    const wrapper = show('保存失败', 'error')
    await nextTick()
    document.body.querySelector<HTMLButtonElement>('.floating-notice-close')?.click()
    await nextTick()
    expect(wrapper.text()).toContain('保存失败')
    await wrapper.setProps({ revision: 1 })
    expect(elements()).toHaveLength(1)
  })
  it('处理提示等待结果，结果未知保留八秒', async () => {
    const wrapper = show('正在提交', 'pending')
    await nextTick()
    await vi.advanceTimersByTimeAsync(20000)
    expect(elements()).toHaveLength(1)
    await wrapper.setProps({ message: '提交结果尚未确认，请核对后重试', tone: 'error' })
    await vi.advanceTimersByTimeAsync(7999)
    expect(elements()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(elements()).toHaveLength(0)
  })
  it('离开页面移除提示和定时器，不在下一页残留', async () => {
    const wrapper = show('本页提示')
    await nextTick()
    wrapper.unmount()
    expect(elements()).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
