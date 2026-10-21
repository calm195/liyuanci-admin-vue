import { createRouter, createWebHistory } from 'vue-router'
import { useAdminStore } from '@/stores/admin'
import type { Role } from '@/types/admin'

export const menu: { path: string; title: string; role?: Role }[] = [
  { path: '/', title: '工作台' },
  { path: '/identity', title: '身份审核', role: 'review_operator' },
]
export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', component: () => import('@/views/LoginView.vue') },
    { path: '/', component: () => import('@/views/DashboardView.vue') },
    {
      path: '/identity',
      component: () => import('@/views/IdentityView.vue'),
      meta: { role: 'review_operator' },
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
  return true
})
