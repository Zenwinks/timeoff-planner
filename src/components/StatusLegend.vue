<script setup>
import { statusLabels, statusColors } from '../constants'

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
    <span class="legend-title" aria-hidden="true">Statuts :</span>
    <button
      v-for="(label, key) in statusLabels"
      :key="key"
      type="button"
      class="legend-item"
      :class="{ active: highlighted === key, dimmed: highlighted && highlighted !== key }"
      :aria-pressed="modelValue === key ? 'true' : 'false'"
      @click="toggle(key)"
      @pointerenter="preview($event, key)"
      @pointerleave="preview($event, null)"
    >
      <span class="legend-dot" :style="{ background: statusColors[key] }" aria-hidden="true"></span>
      {{ label }}
    </button>
  </div>
</template>

<style scoped>
.legend {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.4rem 0;
  margin-bottom: 0.25rem;
  font-size: 0.75rem;
  color: #888;
  flex-shrink: 0;
}

.legend-title {
  font-weight: 600;
  color: #8a8aa0;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border: none;
  background: none;
  color: inherit;
  font-size: inherit;
  cursor: pointer;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  transition: opacity 0.2s, background 0.2s;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.legend-item.active {
  background: rgba(255, 255, 255, 0.06);
  color: #ddd;
}

.legend-item.dimmed {
  opacity: 0.35;
}

.legend-item:focus-visible {
  outline: 2px solid #646cff;
  outline-offset: 1px;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

@media (max-width: 600px) {
  .legend {
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .legend-item {
    min-height: 32px;
  }
}
</style>
