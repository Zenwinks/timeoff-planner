<script setup>
import { statusLabels, statusColors } from '../constants'

defineProps({
  hoveredStatus: { type: String, default: null },
  isTouchDevice: { type: Boolean, default: false },
})

const emit = defineEmits(['update:hoveredStatus'])

function onMouseEnter(key) {
  emit('update:hoveredStatus', key)
}

function onMouseLeave() {
  emit('update:hoveredStatus', null)
}

function onTap(key, isTouchDevice) {
  if (!isTouchDevice) return
  emit('update:hoveredStatus', key)
}
</script>

<template>
  <div class="legend">
    <span class="legend-title">Statuts :</span>
    <span
      v-for="(label, key) in statusLabels"
      :key="key"
      class="legend-item"
      :class="{ active: hoveredStatus === key, dimmed: hoveredStatus && hoveredStatus !== key }"
      @mouseenter="onMouseEnter(key)"
      @mouseleave="onMouseLeave"
      @click="onTap(hoveredStatus === key ? null : key, isTouchDevice)"
    >
      <span class="legend-dot" :style="{ background: statusColors[key] }"></span>
      {{ label }}
    </span>
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
  color: #666;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
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
}
</style>
