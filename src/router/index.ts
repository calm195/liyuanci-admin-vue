import { createRouter, createWebHistory } from 'vue-router'
import { useAdminStore } from '@/stores/admin'
import { isRole } from '@/types/admin'
import type { Role } from '@/types/admin'
import { safetyRoles } from '@/types/safety'
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
  { path: '/', group: '总览', title: '工作台' },
  { path: '/password', group: '系统管理', title: '本人改密' },
  { path: '/accounts', group: '系统管理', title: '后台账号管理', role: 'super_admin' },
  { path: '/identity', group: '认证管理', title: '身份审核', role: 'review_operator' },
  { path: '/moderation', group: '内容治理', title: '内容审核', role: 'review_operator' },
  { path: '/wordlists', group: '内容治理', title: '词库管理', role: 'review_operator' },
  { path: '/safety', group: '安全治理', title: '举报、处罚与申诉', roles: safetyRoles },
  { path: '/crisis', group: '安全治理', title: '危机工作台', roles: crisisRoles },
  { path: '/evidence-deletion', group: '隐私管理', title: '证据删除与回执', role: 'super_admin' },
]
export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
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
      path: '/wordlists',
      component: () => import('@/views/WordlistsView.vue'),
      meta: { role: 'review_operator' },
    },
    {
      path: '/accounts',
      component: () => import('@/views/AccountsView.vue'),
      meta: { role: 'super_admin' },
    },
    {
      path: '/safety',
      component: () => import('@/views/SafetyView.vue'),
      meta: { roles: safetyRoles },
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
