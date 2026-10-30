import { createRouter, createWebHistory } from 'vue-router'
import { useUserNavigation } from '@/stores/userNavigation'
import { useAdminStore } from '@/stores/admin'
import { isRole } from '@/types/admin'
import type { Role } from '@/types/admin'
import { safetyRoles } from '@/types/safety'
import { userRoles } from '@/types/users'
import { resourceRoles } from '@/types/resources'
import { crisisRoles } from '@/types/crisis'

export interface MenuItem {
  path: string
  title: string
  group: string
  role?: Role
  roles?: readonly Role[]
}
export function canAccessMenu(item: MenuItem): boolean {
  const admin = useAdminStore()
  return (
    (!item.role || admin.can(item.role)) &&
    (!item.roles || item.roles.some((role) => admin.can(role)))
  )
}
export const menu: MenuItem[] = [
  { path: '/resources', group: '内容管理', title: '资料管理', roles: resourceRoles },
  { path: '/resource-categories', group: '内容管理', title: '资料分类', roles: resourceRoles },
  { path: '/users', group: '用户管理', title: '平台用户', roles: userRoles },
  { path: '/', group: '总览', title: '工作台' },
  { path: '/password', group: '系统管理', title: '本人改密' },
  { path: '/accounts', group: '系统管理', title: '后台账号管理', role: 'super_admin' },
  { path: '/identity', group: '认证管理', title: '身份审核', role: 'review_operator' },
  { path: '/moderation', group: '内容治理', title: '内容审核', role: 'review_operator' },
  { path: '/whispers/reviews', group: '内容治理', title: '树洞审核', role: 'review_operator' },
  { path: '/wordlists', group: '内容治理', title: '词库管理', role: 'review_operator' },
  { path: '/whispers/reports', group: '安全治理', title: '树洞举报', roles: safetyRoles },
  { path: '/safety/reports', group: '安全治理', title: '举报管理', roles: safetyRoles },
  { path: '/safety/penalties', group: '安全治理', title: '处罚管理', roles: safetyRoles },
  { path: '/safety/appeals', group: '安全治理', title: '申诉管理', roles: safetyRoles },
  { path: '/whispers/crises', group: '安全治理', title: '树洞危机', roles: crisisRoles },
  { path: '/whispers/evidence', group: '隐私管理', title: '树洞证据', role: 'super_admin' },
  { path: '/crisis', group: '安全治理', title: '危机工作台', roles: crisisRoles },
  { path: '/evidence-deletion', group: '隐私管理', title: '证据删除', role: 'super_admin' },
  { path: '/deletion-receipts', group: '隐私管理', title: '回执查询', role: 'super_admin' },
]
export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/resources',
      component: () => import('@/views/ResourcesView.vue'),
      meta: { roles: resourceRoles },
    },
    {
      path: '/resource-categories',
      component: () => import('@/views/ResourceCategoriesView.vue'),
      meta: { roles: resourceRoles },
    },
    {
      path: '/users',
      component: () => import('@/views/UsersView.vue'),
      meta: { roles: userRoles },
    },
    {
      path: '/login',
      meta: { title: '后台登录' },
      component: () => import('@/views/LoginView.vue'),
    },
    { path: '/', component: () => import('@/views/DashboardView.vue') },
    { path: '/password', component: () => import('@/views/PasswordView.vue') },
    {
      path: '/identity',
      component: () => import('@/views/IdentityView.vue'),
      meta: { role: 'review_operator' },
    },
    {
      path: '/moderation',
      component: () => import('@/views/ModerationView.vue'),
      meta: { role: 'review_operator' },
    },
    {
      path: '/whispers/reviews',
      component: () => import('@/views/WhisperReviewsView.vue'),
      meta: { role: 'review_operator' },
    },
    {
      path: '/wordlists',
      component: () => import('@/views/WordlistLayout.vue'),
      meta: { role: 'review_operator' },
      children: [
        { path: '', name: 'wordlist-list', component: () => import('@/views/WordlistsView.vue') },
        {
          path: 'drafts/new',
          name: 'wordlist-draft',
          component: () => import('@/views/WordlistDraftView.vue'),
          meta: { title: '创建词单草稿', parentTitle: '词单列表', parentPath: '/wordlists' },
        },
        {
          path: ':id',
          name: 'wordlist-detail',
          props: true,
          component: () => import('@/views/WordlistDetailView.vue'),
          meta: { title: '词单详情', parentTitle: '词单列表', parentPath: '/wordlists' },
        },
      ],
    },
    {
      path: '/accounts',
      component: () => import('@/views/AccountsView.vue'),
      meta: { role: 'super_admin' },
    },
    {
      path: '/safety',
      component: () => import('@/views/SafetyView.vue'),
      redirect: '/safety/reports',
      meta: { roles: safetyRoles, group: '安全治理' },
      children: [
        {
          path: 'reports',
          component: () => import('@/views/ReportsView.vue'),
          meta: { title: '举报管理' },
        },
        {
          path: 'penalties',
          component: () => import('@/views/PenaltiesView.vue'),
          meta: { title: '处罚管理' },
        },
        {
          path: 'appeals',
          component: () => import('@/views/AppealsView.vue'),
          meta: { title: '申诉管理' },
        },
      ],
    },
    {
      path: '/whispers/reports',
      component: () => import('@/views/WhisperReportsView.vue'),
      meta: { roles: safetyRoles },
    },
    {
      path: '/whispers/crises',
      component: () => import('@/views/WhisperCrisesView.vue'),
      meta: { roles: crisisRoles },
    },
    {
      path: '/whispers/evidence',
      component: () => import('@/views/WhisperEvidenceView.vue'),
      meta: { role: 'super_admin' },
    },
    {
      path: '/crisis',
      component: () => import('@/views/CrisisView.vue'),
      meta: { roles: crisisRoles },
    },
    {
      path: '/evidence-deletion',
      component: () => import('@/views/EvidenceDeletionView.vue'),
      meta: { role: 'super_admin' },
    },
    {
      path: '/deletion-receipts',
      component: () => import('@/views/DeletionReceiptsView.vue'),
      meta: { role: 'super_admin' },
    },
    {
      path: '/403',
      meta: { title: '无权访问' },
      component: () => import('@/views/ForbiddenView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      meta: { title: '页面不存在' },
      component: () => import('@/views/NotFoundView.vue'),
    },
  ].map((route) => {
    const item = menu.find((entry) => entry.path === route.path)
    return item
      ? { ...route, meta: { ...route.meta, title: item.title, group: item.group } }
      : route
  }),
})
router.beforeEach((to) => {
  if (to.path !== '/users' && !to.path.startsWith('/safety/')) useUserNavigation().target = null
  const admin = useAdminStore()
  if (to.path === '/login') return admin.authenticated ? '/' : true
  if (!admin.authenticated) return '/login'
  if (to.meta['role'] === 'review_operator' && !admin.can('review_operator')) return '/403'
  if (to.meta['role'] === 'super_admin' && !admin.can('super_admin')) return '/403'
  const requiredRoles = to.meta['roles']
  if (
    requiredRoles !== undefined &&
    (!Array.isArray(requiredRoles) ||
      !requiredRoles.every(isRole) ||
      !requiredRoles.some((role) => admin.can(role)))
  )
    return '/403'
  return true
})
