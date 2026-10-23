import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import 'element-plus/theme-chalk/el-button.css'
import 'element-plus/theme-chalk/el-breadcrumb.css'
import 'element-plus/theme-chalk/el-breadcrumb-item.css'
import 'element-plus/theme-chalk/el-radio-group.css'
import 'element-plus/theme-chalk/el-radio-button.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import { useThemeStore } from './stores/theme'
import './assets/styles/main.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
useThemeStore(pinia)
app.use(router)
app.mount('#app')
