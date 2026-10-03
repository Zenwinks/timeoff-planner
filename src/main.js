import { createApp } from 'vue'
import { registerSW } from 'virtual:pwa-register'
import './style.css'
import App from './App.vue'
import router from './router'

createApp(App).use(router).mount('#app')

// Une nouvelle version déployée s'installe en arrière-plan, et la page se
// recharge dès qu'elle prend la main : personne ne reste sur l'ancienne
// interface. La vérification a lieu à l'ouverture de l'app, avant qu'on ait
// commencé quoi que ce soit.
registerSW({
  immediate: true,
  onRegisterError: error => console.warn('Service worker non enregistré :', error),
})
