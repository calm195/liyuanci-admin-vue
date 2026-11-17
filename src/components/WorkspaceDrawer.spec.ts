import { mount, flushPromises } from '@vue/test-utils'
import { h } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import WorkspaceDrawer from './WorkspaceDrawer.vue'
import { confirmDiscardChanges } from './confirmDiscardChanges'
vi.mock('./confirmDiscardChanges', () => ({ confirmDiscardChanges: vi.fn() }))
let wrapper: ReturnType<typeof mount> | undefined
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.resetAllMocks()
})
async function start(busy = false) {
  wrapper = mount(WorkspaceDrawer, {
    attachTo: document.body,
    props: { open: true, title: '编辑示例', busy },
    slots: {
      default: () => h('input', { value: '原始内容' }),
      footer: () => h('button', { 'data-overlay-close': '' }, '取消'),
    },
  })
  await flushPromises()
  return wrapper
}
it('未修改时关闭不提醒，取消和标题关闭走同一关闭入口', async () => {
  const view = await start()
  await view.get('[data-overlay-close]').trigger('click')
  await flushPromises()
  expect(view.emitted('close')).toHaveLength(1)
  expect(confirmDiscardChanges).not.toHaveBeenCalled()
})
it('编辑后继续编辑保留输入，放弃后才通知业务清理', async () => {
  const view = await start()
  vi.mocked(confirmDiscardChanges).mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  await view.get('input').setValue('未保存内容')
  await view.get('.el-drawer__close-btn').trigger('click')
  await flushPromises()
  expect(view.emitted('close')).toBeUndefined()
  expect(view.get('input').element).toHaveProperty('value', '未保存内容')
  await view.get('[data-overlay-close]').trigger('click')
  await flushPromises()
  expect(confirmDiscardChanges).toHaveBeenCalledTimes(2)
  expect(view.emitted('close')).toHaveLength(1)
})
it('改回原值不误报未保存，提交或未知锁定时不允许关闭', async () => {
  const view = await start()
  await view.get('input').setValue('临时内容')
  await view.get('input').setValue('原始内容')
  await view.get('[data-overlay-close]').trigger('click')
  await flushPromises()
  expect(confirmDiscardChanges).not.toHaveBeenCalled()
  await view.setProps({ busy: true })
  await view.get('[data-overlay-close]').trigger('click')
  await flushPromises()
  expect(view.emitted('close')).toHaveLength(1)
  expect(view.find('.el-drawer__close-btn').exists()).toBe(false)
})
it('遮罩关闭也检查未保存内容', async () => {
  const view = await start()
  vi.mocked(confirmDiscardChanges).mockResolvedValue(false)
  await view.get('input').setValue('遮罩检查')
  const overlay = view.get('.el-overlay')
  await overlay.trigger('mousedown')
  await overlay.trigger('mouseup')
  await overlay.trigger('click')
  await flushPromises()
  expect(confirmDiscardChanges).toHaveBeenCalledOnce()
  expect(view.emitted('close')).toBeUndefined()
})
