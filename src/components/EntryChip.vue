<script setup>
defineProps({
  group: { type: Object, required: true },
  dimmed: { type: Boolean, default: false },
})

const emit = defineEmits(['delete'])
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
    <button class="chip-delete" @click="emit('delete', group)">&times;</button>
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

.chip-delete {
  background: none;
  border: none;
  color: #555;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0 3px;
  line-height: 1;
  transition: color 0.15s;
}

.chip-delete:hover {
  color: #e74c3c;
}
</style>
