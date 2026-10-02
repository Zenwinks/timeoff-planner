<script setup>
import { computed } from 'vue'
import { formatPeriod } from '../format'

const props = defineProps({
  group: { type: Object, required: true },
  dimmed: { type: Boolean, default: false },
})

const emit = defineEmits(['delete', 'edit'])

// « CP du 27 au 31 juillet » : ce que disent les boutons aux lecteurs d'écran
// et au survol, les icônes seules ne disant rien.
const label = computed(() =>
  `${props.group.type === 'conge' ? 'CP' : 'RTT'} ${formatPeriod(props.group.startDate, props.group.endDate)}`)
</script>

<template>
  <div class="entry-chip" :class="{ dimmed }">
    <span class="chip" :class="[group.type, 'status-' + group.status]">
      <span class="chip-type">{{ group.type === 'conge' ? 'CP' : 'RTT' }}</span>
      <span class="chip-dates">
        <template v-if="group.startDay === group.endDay">
          {{ group.startDay }}
        </template>
        <template v-else>
          {{ group.startDay }}&rarr;{{ group.endDay }}
        </template>
      </span>
      <span v-if="group.duration === 0.5" class="chip-half">½j</span>
    </span>
    <button type="button" class="chip-edit" :aria-label="`Modifier ${label}`" :title="`Modifier ${label}`" @click="emit('edit', group)">✎</button>
    <button type="button" class="chip-delete" :aria-label="`Supprimer ${label}`" :title="`Supprimer ${label}`" @click="emit('delete', group)">&times;</button>
  </div>
</template>

<style scoped>
.entry-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  transition: opacity 0.2s;
}

.entry-chip.dimmed {
  opacity: 0.2;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  overflow: hidden;
  border: none;
  line-height: 1;
}

.chip-type {
  padding: 0.2rem 0.3rem;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #fff;
}

.chip.conge .chip-type {
  background: #646cff;
}

.chip.rtt .chip-type {
  background: #e6a23c;
}

.chip-dates {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.35rem;
  color: #eee;
}

.chip.status-brouillon .chip-dates {
  background: rgba(136, 136, 136, 0.2);
  color: #bbb;
}

.chip.status-demande .chip-dates {
  background: rgba(240, 173, 78, 0.2);
  color: #f0c078;
}

.chip.status-accepte .chip-dates {
  background: rgba(92, 184, 92, 0.2);
  color: #7ddb7d;
}

.chip.status-impose .chip-dates {
  background: rgba(198, 120, 221, 0.2);
  color: #d8a0e8;
}

.chip-half {
  padding: 0.2rem 0.3rem;
  font-size: 0.55rem;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.08);
  color: #aaa;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
}

.chip-edit,
.chip-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  min-height: 24px;
  background: none;
  border: none;
  border-radius: 4px;
  color: #8a8aa0;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  transition: color 0.15s;
}

.chip-edit {
  font-size: 0.75rem;
}

.chip-edit:hover {
  color: #8a8fff;
}

.chip-delete {
  font-size: 0.95rem;
}

.chip-edit:focus-visible,
.chip-delete:focus-visible {
  outline: 2px solid #646cff;
}

.chip-delete:hover {
  color: #e74c3c;
}
</style>
