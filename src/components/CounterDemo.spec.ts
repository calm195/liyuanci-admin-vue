import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import CounterDemo from './CounterDemo.vue'

describe('CounterDemo', () => {
  it('lets the user increment and reset shared state', async () => {
    const wrapper = mount(CounterDemo, { global: { plugins: [createPinia()] } })
    await wrapper.get('button').trigger('click')
    expect(wrapper.get('output').text()).toBe('1')
    expect(wrapper.text()).toContain('computed × 2 = 2')
    await wrapper.get('.text-button').trigger('click')
    expect(wrapper.get('output').text()).toBe('0')
  })
})
