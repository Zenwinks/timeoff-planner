<script setup>
// La barre du haut : le nom de l'app, qui ramène au tableau de bord, et les
// actions de la page (slot).
</script>

<template>
  <header class="app-header">
    <div class="app-header-inner">
      <router-link to="/" class="brand">
        <img src="/pwa-192x192.svg" alt="" width="30" height="30" />
        <span>TimeOff Planner</span>
      </router-link>
      <div class="app-header-actions">
        <slot />
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 20;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border);
}

.app-header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  max-width: 1040px;
  margin: 0 auto;
  padding: 0.6rem 1rem;
  padding-top: max(0.6rem, env(safe-area-inset-top));
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  color: var(--text);
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.brand:hover {
  text-decoration: none;
}

.brand img {
  border-radius: 8px;
}

.app-header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
</style>
