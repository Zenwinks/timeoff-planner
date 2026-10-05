<script setup>
// Le pied de page : la version de l'app, celle de package.json, gravée à la
// construction (vite.config.js). À monter à chaque mise en prod.
const version = __APP_VERSION__
</script>

<template>
  <footer class="app-footer">TimeOff Planner · version {{ version }}</footer>
</template>

<style scoped>
.app-footer {
  padding: 1.5rem 0 0.25rem;
  font-size: 0.75rem;
  color: var(--text-subtle);
  text-align: center;
}
</style>
