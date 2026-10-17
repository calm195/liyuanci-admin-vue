import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import HomeView from './HomeView.vue'

describe('starter landing page', () => {
  it('introduces the stack and provides working section navigation', () => {
    const wrapper = mount(HomeView, { global: { plugins: [createPinia()] } })
    expect(wrapper.get('h1').text()).toContain('让灵感')
    for (const target of ['features', 'structure', 'start']) {
      expect(wrapper.find(`#${target}`).exists()).toBe(true)
      expect(wrapper.find(`a[href="#${target}"]`).exists()).toBe(true)
    }
    expect(wrapper.text()).toContain('AGENTS.md')
    expect(wrapper.text()).toContain('pnpm install')
  })
})
