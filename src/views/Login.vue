<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppFooter from '../components/AppFooter.vue'
import AppIcon from '../components/AppIcon.vue'

// Le serveur renvoie ici, avec ?erreur=…, quand la connexion n'a pas abouti.
const errorMessages = {
  annulee: 'Connexion annulée.',
  echec: 'La connexion avec Google a échoué. Réessayez.',
  fermee: 'La connexion est momentanément fermée.',
}

const route = useRoute()
const error = computed(() => errorMessages[route.query.erreur] ?? null)
</script>

<template>
  <main class="login">
    <div class="card login-card">
      <img class="logo" src="/pwa-192x192.svg" alt="" width="64" height="64" />
      <h1>TimeOff Planner</h1>
      <p class="tagline">Vos congés et vos RTT, et ce qu’il vous en reste, mois par mois.</p>
      <p v-if="error" class="login-error" role="alert">
        <AppIcon name="alert" :size="18" />
        {{ error }}
      </p>
      <!-- Une vraie navigation : le serveur part chez Google, puis revient. -->
      <a class="google-btn" href="/auth/google">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Se connecter avec Google
      </a>
      <router-link to="/confidentialite" class="privacy-link">Vos données personnelles</router-link>
      <AppFooter />
    </div>
  </main>
</template>

<style scoped>
.login {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 1rem;
}

.login-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 400px;
  padding: 2.5rem 2rem 2rem;
  text-align: center;
}

.logo {
  margin-bottom: 1rem;
  border-radius: 16px;
}

h1 {
  font-size: 1.6rem;
  font-weight: 750;
  letter-spacing: -0.01em;
}

.tagline {
  margin: 0.4rem 0 1.75rem;
  color: var(--text-muted);
}

.login-error {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: -0.75rem 0 1.25rem;
  color: var(--danger);
  font-size: 0.9rem;
}

/* Le bouton de Google, à ses couleurs : blanc, dans les deux thèmes. */
.google-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  width: 100%;
  min-height: 48px;
  padding: 0.7rem 1.25rem;
  border: 1px solid #dadce0;
  border-radius: var(--radius);
  background: #ffffff;
  color: #1f1f1f;
  font-size: 1rem;
  font-weight: 600;
  transition: box-shadow 0.2s;
}

.google-btn:hover {
  text-decoration: none;
  box-shadow: 0 2px 10px rgba(66, 133, 244, 0.35);
}

.privacy-link {
  margin-top: 1.5rem;
  font-size: 0.85rem;
}
</style>
