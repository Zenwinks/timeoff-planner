<script setup>
import { computed } from 'vue'
import { formatDate } from '../composables/useBalance'
import { monthNames, statusLabels, typeLabels } from '../constants'
import { holidaysBetween } from '../holidays'

// L'année d'un coup d'œil : les douze mois, chaque jour posé aux couleurs de
// son type et au style de son statut, comme les puces. Une demi-journée remplit
// la moitié gauche de sa case le matin, la droite l'après-midi, le bas si son
// moment n'est pas précisé. Un clic sur un jour posé ouvre son congé ; sur un
// jour ouvré libre, propose d'y poser un congé.
const props = defineProps({
  year: { type: Number, required: true },
  entries: { type: Array, required: true },
  highlighted: { type: String, default: null },
  today: { type: String, required: true },
})

const emit = defineEmits(['open', 'pick'])

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const WEEKDAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const HALVES = { matin: 'le matin', 'apres-midi': 'l’après-midi' }

const byDate = computed(() => new Map(props.entries.map(e => [e.date, e])))
const holidays = computed(() => new Map(holidaysBetween(props.year, props.year).map(h => [h.date, h.label])))

const months = computed(() => monthNames.map((name, m) => {
  const offset = (new Date(props.year, m, 1).getDay() + 6) % 7
  const count = new Date(props.year, m + 1, 0).getDate()
  const days = []
  for (let d = 1; d <= count; d++) {
    const date = new Date(props.year, m, d)
    const iso = formatDate(date)
    const weekday = (date.getDay() + 6) % 7
    days.push({
      iso,
      day: d,
      // « Lundi 21 décembre » : ce que lisent les lecteurs d'écran.
      name: `${WEEKDAY_NAMES[weekday]} ${d === 1 ? '1er' : d} ${name.toLowerCase()}`,
      entry: byDate.value.get(iso) ?? null,
      holiday: holidays.value.get(iso) ?? null,
      weekend: weekday >= 5,
      today: iso === props.today,
    })
  }
  return { name, offset, days }
}))

function entryLabel(day) {
  const e = day.entry
  const half = e.duration === 0.5 ? `, ${HALVES[e.half_day] ?? 'une demi-journée'}` : ''
  return `${day.name} : ${typeLabels[e.type]}, ${statusLabels[e.status].toLowerCase()}${half}`
}

function halfClass(entry) {
  if (entry.duration !== 0.5) return null
  return { matin: 'half-left', 'apres-midi': 'half-right' }[entry.half_day] ?? 'half-bottom'
}
</script>

<template>
  <div class="year">
    <section v-for="month in months" :key="month.name" class="year-month" :aria-label="`${month.name} ${year}`">
      <h3>{{ month.name }}</h3>
      <div class="weekdays" aria-hidden="true">
        <span v-for="(weekday, i) in WEEKDAYS" :key="i">{{ weekday }}</span>
      </div>
      <div class="days">
        <span v-for="n in month.offset" :key="`vide-${n}`" class="day" aria-hidden="true"></span>
        <template v-for="day in month.days" :key="day.iso">
          <button
            v-if="day.entry"
            type="button"
            class="day taken num"
            :class="[day.entry.type, day.entry.status, halfClass(day.entry), { today: day.today, dimmed: highlighted && highlighted !== day.entry.status }]"
            :aria-label="entryLabel(day)"
            :title="entryLabel(day)"
            @click="emit('open', day.entry)"
          >{{ day.day }}</button>
          <span
            v-else-if="day.weekend || day.holiday"
            class="day off num"
            :class="{ holiday: day.holiday, today: day.today }"
            :title="day.holiday ? `Férié : ${day.holiday}` : undefined"
          >{{ day.day }}</span>
          <button
            v-else
            type="button"
            class="day free num"
            :class="{ today: day.today }"
            :aria-label="`${day.name} : libre. Poser un congé`"
            @click="emit('pick', day.iso)"
          >{{ day.day }}</button>
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.year {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15.5rem, 1fr));
  gap: 0.75rem;
}

.year-month {
  padding: 0.75rem 0.85rem 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow);
}

.year-month h3 {
  margin-bottom: 0.4rem;
  font-size: 0.95rem;
  font-weight: 700;
}

.weekdays,
.days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 3px;
}

.weekdays span {
  font-size: 0.68rem;
  font-weight: 700;
  text-align: center;
  color: var(--text-subtle);
}

.day {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  min-width: 0;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text);
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1;
}

button.day {
  cursor: pointer;
  transition: background-color 0.15s, opacity 0.2s, filter 0.15s;
  -webkit-tap-highlight-color: transparent;
}

.day.free:hover {
  background: var(--surface-hover);
}

.day.off {
  color: var(--text-subtle);
  font-weight: 400;
}

.day.holiday {
  color: var(--warning);
  box-shadow: inset 0 -3px 0 -1px var(--warning);
}

.day.today {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}

/* Le type : la couleur. Le statut : le remplissage (--fill) et l'encre (--ink),
   comme pour les puces. */
.day.taken.conge {
  --c: var(--cp);
  --c-strong: var(--cp-strong);
  --c-soft: var(--cp-soft);
}

.day.taken.rtt {
  --c: var(--rtt);
  --c-strong: var(--rtt-strong);
  --c-soft: var(--rtt-soft);
}

.day.taken.accepte,
.day.taken.impose {
  --fill: var(--c-strong);
  --ink: #ffffff;
}

.day.taken.demande {
  --fill: var(--c-soft);
  --ink: var(--c);
  box-shadow: inset 0 0 0 1.5px var(--c);
}

.day.taken.brouillon {
  --fill: transparent;
  --ink: var(--c);
  border: 1.5px dashed var(--c);
}

.day.taken {
  background: var(--fill);
  color: var(--ink);
}

.day.taken.impose {
  background-image: repeating-linear-gradient(135deg, transparent 0 4px, rgba(255, 255, 255, 0.18) 4px 8px);
}

/* Les demi-journées : une moitié de case. Le chiffre reste dans la couleur du
   texte, lisible sur la moitié vide. */
.day.taken.half-left {
  background: linear-gradient(90deg, var(--fill) 50%, transparent 50%);
}

.day.taken.half-right {
  background: linear-gradient(90deg, transparent 50%, var(--fill) 50%);
}

.day.taken.half-bottom {
  background: linear-gradient(0deg, var(--fill) 50%, transparent 50%);
}

.day.taken.half-left,
.day.taken.half-right,
.day.taken.half-bottom {
  color: var(--text);
  box-shadow: inset 0 0 0 1.5px var(--c);
}

/* Un brouillon n'a pas de remplissage : sa demi-journée garde une moitié teintée. */
.day.taken.brouillon.half-left,
.day.taken.brouillon.half-right,
.day.taken.brouillon.half-bottom {
  --fill: var(--c-soft);
  box-shadow: none;
}

.day.taken:hover {
  filter: brightness(1.12);
}

.day.taken.dimmed {
  opacity: 0.25;
}
</style>
