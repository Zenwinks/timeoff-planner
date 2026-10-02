import { createRouter, createWebHistory } from 'vue-router'
import { getCurrentUser } from './api'
import Login from './views/Login.vue'
import Dashboard from './views/Dashboard.vue'
import Settings from './views/Settings.vue'
import Privacy from './views/Privacy.vue'

const routes = [
  { path: '/login', name: 'Login', component: Login },
  { path: '/confidentialite', name: 'Privacy', component: Privacy },
  { path: '/', name: 'Dashboard', component: Dashboard, meta: { requiresAuth: true } },
  { path: '/settings', name: 'Settings', component: Settings, meta: { requiresAuth: true } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const user = await getCurrentUser().catch(() => null)
  if (to.meta.requiresAuth && !user) {
    return { name: 'Login' }
  }
  if (to.name === 'Login' && user) {
    return { name: 'Dashboard' }
  }
})

export default router
