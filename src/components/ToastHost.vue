<script setup>
import AppIcon from './AppIcon.vue'
import { dismissToast, useToasts } from '../composables/useToasts'

const toasts = useToasts()

function runAction(toast) {
  dismissToast(toast.id)
  toast.action.run()
}
</script>

<template>
  <!-- Une zone annoncée par les lecteurs d'écran, présente même vide. -->
  <div class="toasts" role="status" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="toast in toasts" :key="toast.id" class="toast" :class="toast.tone">
        <AppIcon v-if="toast.tone === 'error'" name="alert" :size="18" />
        <span class="toast-message">{{ toast.message }}</span>
        <button v-if="toast.action" type="button" class="toast-action" @click="runAction(toast)">
          {{ toast.action.label }}
        </button>
        <button type="button" class="toast-close" aria-label="Fermer le message" @click="dismissToast(toast.id)">
          <AppIcon name="x" :size="16" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  left: 50%;
  bottom: calc(1rem + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: min(32rem, calc(100vw - 2rem));
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.5rem 0.55rem 1rem;
  border-radius: var(--radius);
  background: var(--text);
  color: var(--bg);
  box-shadow: var(--shadow-lg);
  font-size: 0.9rem;
  font-weight: 500;
  pointer-events: auto;
}

.toast.error {
  background: var(--danger-strong);
  color: #ffffff;
}

.toast-message {
  flex: 1;
}

.toast-action {
  min-height: 34px;
  padding: 0.3rem 0.75rem;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: inherit;
  font-size: 0.88rem;
  font-weight: 800;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.toast-action:hover {
  background: color-mix(in srgb, currentColor 12%, transparent);
}

.toast-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  min-height: 32px;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: inherit;
  opacity: 0.75;
  cursor: pointer;
}

.toast-close:hover {
  opacity: 1;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* Sur mobile, au-dessus du bouton « Poser un congé ». */
@media (max-width: 759px) {
  .toasts {
    bottom: calc(5.5rem + env(safe-area-inset-bottom));
  }
}
</style>
