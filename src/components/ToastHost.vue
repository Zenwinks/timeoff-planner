<script setup>
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
        <span class="toast-message">{{ toast.message }}</span>
        <button v-if="toast.action" type="button" class="toast-action" @click="runAction(toast)">
          {{ toast.action.label }}
        </button>
        <button type="button" class="toast-close" aria-label="Fermer le message" @click="dismissToast(toast.id)">&times;</button>
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
  gap: 0.75rem;
  padding: 0.65rem 0.75rem 0.65rem 1rem;
  border-radius: 8px;
  background: #2a2a44;
  border: 1px solid #3a3a5a;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
  color: #eee;
  font-size: 0.9rem;
  pointer-events: auto;
}

.toast.error {
  background: #3a1f24;
  border-color: rgba(231, 76, 60, 0.6);
}

.toast-message {
  flex: 1;
}

.toast-action {
  padding: 0.35rem 0.75rem;
  border: 1px solid #8a8fff;
  border-radius: 6px;
  background: transparent;
  color: #a8acff;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.toast-action:hover {
  background: rgba(138, 143, 255, 0.15);
}

.toast-close {
  min-width: 28px;
  min-height: 28px;
  border: none;
  background: none;
  color: #aaa;
  font-size: 1.1rem;
  cursor: pointer;
}

.toast-close:hover {
  color: #fff;
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

@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active {
    transition: none;
  }
}
</style>
