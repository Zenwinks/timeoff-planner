<script setup>
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { statusIcons, statusLabels, typeLabels } from '../constants'
import { formatDays, formatPeriod } from '../format'

// La part d'un congé posée dans un mois. Sa couleur dit le type (CP ou RTT),
// son style et son icône le statut. Un clic ouvre le congé entier.
const props = defineProps({
  group: { type: Object, required: true },
  dimmed: { type: Boolean, default: false },
  // Vue « Confirmé » : un brouillon ou une demande, que le solde affiché ignore.
  uncounted: { type: Boolean, default: false },
})

const emit = defineEmits(['open'])

const days = computed(() => props.group.entries.reduce((n, e) => n + (Number(e.duration) || 1), 0))
// Le moment d'une demi-journée, s'il est précisé.
const half = computed(() => ({ matin: 'matin', 'apres-midi': 'après-midi' })[props.group.halfDay] ?? 'j')
const halfSpoken = computed(() => ({ matin: ', le matin', 'apres-midi': ', l’après-midi' })[props.group.halfDay] ?? '')
const dates = computed(() =>
  props.group.startDay === props.group.endDay ? String(props.group.startDay) : `${props.group.startDay} → ${props.group.endDay}`)

// « CP du 27 au 31 juillet, accepté, 5 jours » : ce que lisent les lecteurs d'écran.
const label = computed(() => {
  const length = days.value === 0.5 ? `une demi-journée${halfSpoken.value}` : `${formatDays(days.value)} jour${days.value > 1 ? 's' : ''}`
  const outside = props.uncounted ? ', hors du solde confirmé' : ''
  return `${typeLabels[props.group.type]} ${formatPeriod(props.group.startDate, props.group.endDate)}, ${statusLabels[props.group.status].toLowerCase()}, ${length}${outside}`
})
</script>

<template>
  <button
    type="button"
    class="chip"
    :class="[group.type, group.status, { dimmed, uncounted }]"
    :aria-label="label"
    :title="label"
    @click="emit('open', group)"
  >
    <AppIcon :name="statusIcons[group.status]" :size="14" />
    <span class="chip-type">{{ typeLabels[group.type] }}</span>
    <span class="chip-dates num">{{ dates }}</span>
    <span v-if="group.duration === 0.5" class="chip-extra">½ {{ half }}</span>
    <span v-else-if="days > 1" class="chip-extra num">{{ formatDays(days) }} j</span>
  </button>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-height: 30px;
  padding: 0.2rem 0.65rem 0.2rem 0.5rem;
  border: 1.5px solid transparent;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 650;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: opacity 0.2s, filter 0.15s;
  -webkit-tap-highlight-color: transparent;
}

/* Le type : la couleur. */
.chip.conge {
  --chip: var(--cp);
  --chip-strong: var(--cp-strong);
  --chip-soft: var(--cp-soft);
}

.chip.rtt {
  --chip: var(--rtt);
  --chip-strong: var(--rtt-strong);
  --chip-soft: var(--rtt-soft);
}

/* Le statut : le remplissage et l'icône. Acquis : plein. Demandé : teinté et
   bordé. Brouillon : seulement un pointillé. Imposé : plein et hachuré. */
.chip.accepte,
.chip.impose {
  background-color: var(--chip-strong);
  color: #ffffff;
}

.chip.impose {
  background-image: repeating-linear-gradient(135deg, transparent 0 5px, rgba(255, 255, 255, 0.14) 5px 10px);
}

.chip.demande {
  background: var(--chip-soft);
  border-color: var(--chip);
  color: var(--chip);
}

.chip.brouillon {
  background: transparent;
  border-style: dashed;
  border-color: var(--chip);
  color: var(--chip);
}

.chip:hover {
  filter: brightness(1.12);
}

.chip.dimmed {
  opacity: 0.25;
}

/* Vue « Confirmé » : ce que le solde ignore passe en gris. */
.chip.uncounted {
  filter: grayscale(1);
  opacity: 0.55;
}

.chip.uncounted:hover {
  filter: grayscale(1) brightness(1.12);
}

.chip.uncounted.dimmed {
  opacity: 0.2;
}

.chip-type {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.03em;
}

.chip-extra {
  font-size: 0.72rem;
  font-weight: 500;
  opacity: 0.85;
}

@media (pointer: coarse) {
  .chip {
    min-height: 34px;
  }
}
</style>
