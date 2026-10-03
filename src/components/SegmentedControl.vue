<script setup>
import AppIcon from './AppIcon.vue'

// Un choix parmi quelques options, toutes visibles d'un coup d'œil
// (Prévisionnel / Confirmé, CP / RTT, les quatre statuts…).
defineProps({
  modelValue: { type: [String, Number], required: true },
  // [{ value, label, icon? }]
  options: { type: Array, required: true },
  // Le nom du groupe pour les lecteurs d'écran : « Statut », « Durée »…
  label: { type: String, required: true },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <div class="segmented" role="group" :aria-label="label">
    <button
      v-for="option in options"
      :key="String(option.value)"
      type="button"
      :aria-pressed="modelValue === option.value ? 'true' : 'false'"
      :disabled="disabled"
      @click="emit('update:modelValue', option.value)"
    >
      <AppIcon v-if="option.icon" :name="option.icon" :size="16" />
      {{ option.label }}
    </button>
  </div>
</template>
