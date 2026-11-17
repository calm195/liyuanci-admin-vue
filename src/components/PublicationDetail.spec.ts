import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PublicationDetail from './PublicationDetail.vue'
import type { ContentDetail } from '@/services/content-management'

function sample(overrides: Partial<ContentDetail> = {}): ContentDetail {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    title: '合成公开内容',
    state: 'published',
    createdAt: '2026-11-16T00:00:00Z',
    publishedAt: null,
    expiresAt: null,
    matchedAt: null,
    requester: '',
    helper: '',
    original: { author: '小鲤鱼', body: '合成正文', notice: '' },
    story: null,
    comments: [{ author: '小鲤鱼', body: '另一位匿名用户的回复', notice: '' }],
    commentsMore: false,
    exportable: false,
    stats: {
      supportCount: undefined,
      hugCount: undefined,
      applicationCount: undefined,
      commentCount: undefined,
      viewCount: undefined,
    },
    supportCount: undefined,
    hugCount: undefined,
    applicationCount: undefined,
    commentCount: undefined,
    viewCount: undefined,
    ...overrides,
  }
}
function render(detail: ContentDetail, wishes: boolean) {
  return mount(PublicationDetail, {
    props: { detail, wishes, stateLabel: '已公开', commentsPage: 0, busy: false },
  })
}
describe('公开详情统计与匿名上下文', () => {
  it('悄悄话仅显示抱抱、评论和浏览，即使旧解析值含应愿零也不渲染', () => {
    const view = render(
      sample({ hugCount: 1, applicationCount: 0, supportCount: 0, commentCount: 0, viewCount: 0 }),
      false,
    )
    expect(view.findAll('.publication-stats span').map((item) => item.text())).toEqual([
      '抱抱',
      '评论',
      '浏览',
    ])
    expect(view.findAll('.publication-stats strong').map((item) => item.text())).toEqual([
      '1',
      '0',
      '0',
    ])
    expect(view.text()).not.toContain('应愿')
    view.unmount()
  })
  it('心愿保留真实应愿零，缺失计数隐藏，不显示抱抱', () => {
    const view = render(sample({ supportCount: 2, applicationCount: 0, hugCount: 7 }), true)
    expect(view.findAll('.publication-stats span').map((item) => item.text())).toEqual([
      '支持',
      '应愿',
    ])
    expect(view.findAll('.publication-stats strong').map((item) => item.text())).toEqual(['2', '0'])
    view.unmount()
  })
  it('相同昵称或匿名标签不推断帖主，作者补充只依据服务端kind', () => {
    const view = render(
      sample({
        comments: [
          { author: '小鲤鱼', body: '匿名评论', notice: '' },
          { author: '小鲤鱼', body: '合成补充', notice: '', kind: 'author_supplement' },
        ],
      }),
      false,
    )
    expect(view.text()).not.toContain('帖主')
    expect(
      view.findAll('.publication-comment-heading .experience-badge').map((item) => item.text()),
    ).toEqual(['作者补充'])
    view.unmount()
  })
})
