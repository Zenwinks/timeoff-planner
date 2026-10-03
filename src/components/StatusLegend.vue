<script setup>
import AppIcon from './AppIcon.vue'
import { statusIcons, statusLabels } from '../constants'

// La légende des statuts, qui sert aussi de filtre : un clic ou un toucher met
// un statut en avant (v-model), un second l'enlève. À la souris, le survol en
// donne un aperçu (`preview`) sans rien fixer ; au doigt, il n'y a pas de survol.
const props = defineProps({
  modelValue: { type: String, default: null },
  // Le statut mis en avant à l'écran : celui du survol, sinon celui fixé.
  highlighted: { type: String, default: null },
})

const emit = defineEmits(['update:modelValue', 'preview'])

function toggle(key) {
  emit('update:modelValue', props.modelValue === key ? null : key)
}

function preview(event, key) {
  if (event.pointerType === 'mouse') emit('preview', key)
}
</script>

<template>
  <div class="legend" role="group" aria-label="Mettre un statut en avant">
    <button
      v-for="(label, key) in statusLabels"
      :key="key"
      type="button"
      class="legend-item"
      :class="{ active: highlighted === key, dimmed: highlighted && highlighted !== key }"
      :aria-pressed="modelValue === key ? 'true' : 'false'"
      :title="modelValue === key ? 'Un clic enlève la mise en avant' : 'Un clic garde ce statut en avant'"
      @click="toggle(key)"
      @pointerenter="preview($event, key)"
      @pointerleave="preview($event, null)"
    >
      <AppIcon :name="statusIcons[key]" :size="15" />
      {{ label }}
    </button>
  </div>
</template>

<style scoped>
.legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 32px;
  padding: 0.2rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s, background-color 0.15s, color 0.15s;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.legend-item:hover {
  color: var(--text);
}

.legend-item.active {
  background: var(--surface-hover);
  border-color: var(--border-strong);
  color: var(--text);
}

.legend-item[aria-pressed='true'] {
  background: var(--primary-soft);
  border-color: var(--focus);
  color: var(--text);
}

.legend-item.dimmed {
  opacity: 0.45;
}

/* Sur un téléphone, les quatre statuts tiennent sur une ligne. */
@media (max-width: 519px) {
  .legend {
    gap: 0.25rem;
  }

  .legend-item {
    gap: 0.25rem;
    padding: 0.2rem 0.45rem;
    font-size: 0.76rem;
  }
}
</style>
