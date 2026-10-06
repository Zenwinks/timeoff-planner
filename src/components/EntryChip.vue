<script setup>
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { isSickLeave, statusIcons, statusLabels, typeLabels } from '../constants'
import { formatDays, formatPeriod } from '../format'

// La part d'un congé posée dans un mois, qui se lit comme une phrase : « 5j CP
// du 27 au 31 », « 1j RTT le 30 », « ½j RTT le 13 après-midi ». Les dates en
// toutes lettres : un « CP 7 » se lisait comme sept jours de CP. Sa couleur dit
// le type (CP, RTT ou arrêt maladie), son style et son icône le statut. Un clic
// ouvre le congé entier.
const props = defineProps({
  group: { type: Object, required: true },
  dimmed: { type: Boolean, default: false },
  // Vue « Confirmé » : un brouillon ou une demande, que le solde affiché ignore.
  uncounted: { type: Boolean, default: false },
})

const emit = defineEmits(['open'])

const days = computed(() => props.group.entries.reduce((n, e) => n + (Number(e.duration) || 1), 0))
const shortDays = computed(() => (days.value === 0.5 ? '½j' : `${formatDays(days.value)}j`))
const dayOf = day => (day === 1 ? '1er' : String(day))
// Le moment d'une demi-journée, s'il est précisé : « le 13 après-midi ».
const moment = computed(() => ({ matin: ' matin', 'apres-midi': ' après-midi' })[props.group.halfDay] ?? '')
const dates = computed(() => props.group.startDay === props.group.endDay
  ? `le ${dayOf(props.group.startDay)}${moment.value}`
  : `du ${dayOf(props.group.startDay)} au ${dayOf(props.group.endDay)}`)
const halfSpoken = computed(() => ({ matin: ', le matin', 'apres-midi': ', l’après-midi' })[props.group.halfDay] ?? '')

// Un arrêt maladie : « Maladie », une croix, et pas de statut.
const sick = computed(() => isSickLeave(props.group))
const shortType = computed(() => (sick.value ? 'Maladie' : typeLabels[props.group.type]))
const icon = computed(() => (sick.value ? 'medical' : statusIcons[props.group.status]))

// « CP du 27 au 31 juillet, accepté, 5 jours » : ce que lisent les lecteurs d'écran.
const label = computed(() => {
  const length = days.value === 0.5 ? `une demi-journée${halfSpoken.value}` : `${formatDays(days.value)} jour${days.value > 1 ? 's' : ''}`
  const outside = props.uncounted ? ', hors du solde confirmé' : ''
  const status = sick.value ? '' : `, ${statusLabels[props.group.status].toLowerCase()}`
  return `${typeLabels[props.group.type]} ${formatPeriod(props.group.startDate, props.group.endDate)}${status}, ${length}${outside}`
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
    <AppIcon :name="icon" :size="14" />
    <span class="chip-text">
      <span class="chip-days num">{{ shortDays }}</span>
      <span class="chip-type">{{ shortType }}</span>
      <span class="chip-dates num">{{ dates }}</span>
    </span>
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

/* Un arrêt maladie est enregistré « accepté » : plein, comme un congé acquis. */
.chip.maladie {
  --chip: var(--sick);
  --chip-strong: var(--sick-strong);
  --chip-soft: var(--sick-soft);
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

/* La phrase sur une même ligne de base : le type, plus petit, ne flotte pas
   entre la durée et les dates. */
.chip-text {
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
}

.chip-type {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.03em;
}

.chip-days {
  font-weight: 800;
}

.chip-dates {
  font-weight: 500;
}

@media (pointer: coarse) {
  .chip {
    min-height: 34px;
  }
}
</style>
