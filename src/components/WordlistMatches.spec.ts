import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import WordlistMatches from './WordlistMatches.vue'

it('用中文展示内置词库命中标签，并保留未识别的标签', () => {
  const match = {
    word: '示例',
    source: 'builtin',
    kind: 'builtin',
    disposition: 'hint',
    start: 0,
    end: 2,
  } as const
  const wrapper = mount(WordlistMatches, {
    props: {
      matches: [
        { ...match, label: 'inappropriate_oral' },
        { ...match, label: 'future_label' },
      ],
    },
  })

  const labels = wrapper.findAll('tbody td span').map((cell) => cell.text())
  expect(labels).toEqual(['· 低俗口头语', '· future_label'])
})
