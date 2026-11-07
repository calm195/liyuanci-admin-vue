/** 模块说明在后台维护草稿，发布后才会向小程序展示。 */
export interface GuideModule {
  module: string
  title: string
  body: string
}
export interface ModuleGuide {
  version: number
  published_version: number
  modules: GuideModule[]
  published_modules: GuideModule[]
}
export interface ModuleGuideInput {
  expected_version: number
  modules: GuideModule[]
}
