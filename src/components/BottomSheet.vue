<script setup>
import { onMounted, ref, useId, watch } from 'vue'
import AppIcon from './AppIcon.vue'

// Un panneau : monté du bas de l'écran sur mobile, une fenêtre au centre sur
// ordinateur. Un vrai <dialog> : le navigateur garde le focus dedans, ferme à
// Échap et rend inerte la page derrière. Un clic à côté le ferme aussi.
const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  // Sur ordinateur, une fenêtre plus large (le formulaire, sur deux colonnes).
  wide: { type: Boolean, default: false },
})

const emit = defineEmits(['update:open'])

const dialog = ref(null)
const titleId = useId()

function show() {
  if (dialog.value && !dialog.value.open) dialog.value.showModal()
}

function hide() {
  if (dialog.value?.open) dialog.value.close()
}

watch(() => props.open, open => (open ? show() : hide()))
onMounted(() => {
  if (props.open) show()
})

// Le clic sur le fond (le <dialog> lui-même, hors du panneau) ferme.
function onClick(event) {
  if (event.target === dialog.value) hide()
}

defineExpose({ hide })
</script>

<template>
  <dialog
    ref="dialog"
    class="sheet"
    :aria-labelledby="titleId"
    @close="emit('update:open', false)"
    @click="onClick"
  >
    <div class="sheet-panel" :class="{ wide }">
      <div class="sheet-handle" aria-hidden="true"></div>
      <header class="sheet-header">
        <h2 :id="titleId" class="sheet-title">{{ title }}</h2>
        <button type="button" class="btn btn-ghost btn-icon" aria-label="Fermer" @click="hide">
          <AppIcon name="x" />
        </button>
      </header>
      <div class="sheet-body">
        <slot />
      </div>
      <footer v-if="$slots.footer" class="sheet-footer">
        <slot name="footer" />
      </footer>
    </div>
  </dialog>
</template>

<style scoped>
.sheet {
  width: 100%;
  max-width: 100%;
  height: 100%;
  max-height: 100%;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text);
}

.sheet[open] {
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet::backdrop {
  background: rgba(6, 7, 14, 0.55);
}

.sheet-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 94dvh;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  box-shadow: var(--shadow-lg);
  padding-bottom: env(safe-area-inset-bottom);
  animation: sheet-up 0.22s ease-out;
}

.sheet-handle {
  width: 40px;
  height: 4px;
  margin: 0.5rem auto 0;
  border-radius: 2px;
  background: var(--border-strong);
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem 0.25rem 1.25rem;
}

.sheet-title {
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1.3;
}

.sheet-body {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 1.25rem 1.25rem;
  overscroll-behavior: contain;
}

.sheet-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  padding: 0.85rem 1.25rem;
  border-top: 1px solid var(--border);
}

@keyframes sheet-up {
  from {
    transform: translateY(24px);
    opacity: 0;
  }
}

@media (min-width: 720px) {
  .sheet[open] {
    align-items: center;
  }

  .sheet-panel {
    max-width: 560px;
    max-height: 88vh;
    border-bottom: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding-bottom: 0;
  }

  .sheet-panel.wide {
    max-width: 880px;
  }

  .sheet-handle {
    display: none;
  }

  .sheet-header {
    padding-top: 1rem;
  }
}
</style>
