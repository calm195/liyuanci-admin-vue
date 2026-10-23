import { createRouter, createWebHistory } from 'vue-router'
import { useAdminStore } from '@/stores/admin'
import { isRole } from '@/types/admin'
import type { Role } from '@/types/admin'
import { safetyRoles } from '@/types/safety'

export interface MenuItem {
  path: string
  title: string
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
  { path: '/', title: '工作台' },
  { path: '/password', title: '本人改密' },
  { path: '/accounts', title: '后台账号管理', role: 'super_admin' },
  { path: '/identity', title: '身份审核', role: 'review_operator' },
  { path: '/moderation', title: '内容审核', role: 'review_operator' },
  { path: '/wordlists', title: '词库管理', role: 'review_operator' },
  { path: '/safety', title: '举报、处罚与申诉', roles: safetyRoles },
]
export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', component: () => import('@/views/LoginView.vue') },
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
    { path: '/403', component: () => import('@/views/ForbiddenView.vue') },
    { path: '/:pathMatch(.*)*', component: () => import('@/views/NotFoundView.vue') },
  ],
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
