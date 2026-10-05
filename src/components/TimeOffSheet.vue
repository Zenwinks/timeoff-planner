<script setup>
import { computed, ref, watch } from 'vue'
import VueDatePicker from '@vuepic/vue-datepicker'
import '@vuepic/vue-datepicker/dist/main.css'
import AppIcon from './AppIcon.vue'
import BottomSheet from './BottomSheet.vue'
import SegmentedControl from './SegmentedControl.vue'
import { formatDate, getWorkingDaysInRange } from '../composables/useBalance'
import { isDark } from '../composables/useTheme'
import { statusIcons, statusLabels, typeLabels } from '../constants'
import { formatDays, formatPeriod } from '../format'
import { holidaysBetween, isHolidayDate } from '../holidays'

// Poser un congé, ou en modifier un. Le calendrier montre les jours déjà posés
// et les fériés ; dessous, ce que donne la saisie : la période, les jours
// ouvrés, le solde de fin d'année avant et après, et les alertes de solde.
const props = defineProps({
  open: { type: Boolean, default: false },
  // Le congé modifié (une période de periodsOf), ou null pour en poser un.
  editing: { type: Object, default: null },
  // Pour un congé à poser : un jour déjà choisi (AAAA-MM-JJ), cliqué dans le calendrier de l'année.
  startDate: { type: String, default: null },
  // Tous les jours posés : repères du calendrier et dates déjà prises.
  entries: { type: Array, default: () => [] },
  checkBalance: { type: Function, required: true },
  previewYearEnd: { type: Function, required: true },
  // Sans RTT (contrat horaire qui n'en a pas), le type RTT n'est pas proposé.
  rttEnabled: { type: Boolean, default: true },
  saving: { type: Boolean, default: false },
  error: { type: String, default: null },
})

const emit = defineEmits(['update:open', 'submit'])

const range = ref(null)
const type = ref('conge')
const status = ref('brouillon')
const duration = ref(1)
// Le moment d'une demi-journée : 'matin', 'apres-midi', ou null (non précisé).
const halfDay = ref('matin')

const typeOptions = computed(() => [
  { value: 'conge', label: 'Congés payés' },
  ...(props.rttEnabled || type.value === 'rtt' ? [{ value: 'rtt', label: 'RTT' }] : []),
  { value: 'maladie', label: 'Arrêt maladie' },
])
// Un arrêt maladie : des journées entières, sans statut à suivre (« accepté »).
const sick = computed(() => type.value === 'maladie')
const durationOptions = [{ value: 1, label: 'Journée entière' }, { value: 0.5, label: 'Demi-journée' }]
const halfDayOptions = [{ value: 'matin', label: 'Matin' }, { value: 'apres-midi', label: 'Après-midi' }]
const halfDayLabels = { matin: 'matin', 'apres-midi': 'après-midi' }
const statusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label, icon: statusIcons[value] }))

// À chaque ouverture, le congé modifié ou un formulaire vierge : rien ne reste
// d'une saisie abandonnée.
watch(() => props.open, open => {
  if (open) load(props.editing)
}, { immediate: true })

function load(period) {
  const [from, to] = period ? [period.startDate, period.endDate] : [props.startDate, props.startDate]
  range.value = from ? [new Date(`${from}T00:00`), new Date(`${to}T00:00`)] : null
  type.value = period?.type ?? 'conge'
  status.value = period?.status ?? 'brouillon'
  duration.value = period?.duration ?? 1
  // Une demi-journée d'avant octobre 2026 n'a pas de moment : on le laisse vide.
  halfDay.value = period ? period.halfDay : 'matin'
}

/** Le premier et le dernier jour choisis, ou null. */
const bounds = computed(() => {
  const value = range.value
  if (!value) return null
  const [start, end] = Array.isArray(value) ? value : [value, value]
  return start ? [start, end ?? start] : null
})

const isSingleDay = computed(() => !!bounds.value && formatDate(bounds.value[0]) === formatDate(bounds.value[1]))

// La demi-journée ne vaut que pour un jour seul : une période se pose en
// journées entières.
// Une journée entière devenue demi-journée : le matin, sauf autre choix.
watch(duration, (now, before) => {
  if (now === 0.5 && before === 1 && halfDay.value === null) halfDay.value = 'matin'
})

watch(isSingleDay, single => {
  if (!single) duration.value = 1
})

// Ce que la saisie posera : un arrêt maladie, en journées entières et « accepté »,
// quels que soient la durée et le statut choisis pour un congé (et qu'on
// retrouve en revenant à un congé).
const poseDuration = computed(() => (sick.value ? 1 : duration.value))
const poseStatus = computed(() => (sick.value ? 'accepte' : status.value))

const editingEntries = computed(() => props.editing?.entries ?? [])
const otherEntries = computed(() => {
  const ids = new Set(editingEntries.value.map(e => e.id))
  return props.entries.filter(e => !ids.has(e.id))
})

const selection = computed(() => {
  if (!bounds.value) return null
  const days = getWorkingDaysInRange(...bounds.value)
  const taken = new Set(otherEntries.value.map(e => e.date))
  const free = days.filter(d => !taken.has(d)).length
  return { startDate: formatDate(bounds.value[0]), endDate: formatDate(bounds.value[1]), free, taken: days.length - free }
})

const check = computed(() => bounds.value
  ? props.checkBalance(bounds.value, type.value, poseDuration.value, poseStatus.value, editingEntries.value)
  : { messages: [], blocking: false })

const preview = computed(() => {
  if (sick.value) return null
  const result = bounds.value && props.previewYearEnd(bounds.value, type.value, poseDuration.value, poseStatus.value, editingEntries.value)
  if (!result) return null
  return { year: result.year, ...result[type.value === 'conge' ? 'cp' : 'rtt'] }
})

const periodText = computed(() => {
  if (!selection.value) return ''
  const text = formatPeriod(selection.value.startDate, selection.value.endDate)
  return text.charAt(0).toUpperCase() + text.slice(1)
})

const daysText = computed(() => {
  const n = selection.value?.free ?? 0
  if (!n) return ''
  if (poseDuration.value === 0.5) return `Une demi-journée${{ matin: ', le matin', 'apres-midi': ', l’après-midi' }[halfDay.value] ?? ''}`
  return `${n} jour${n > 1 ? 's' : ''} ouvré${n > 1 ? 's' : ''}`
})

const takenText = computed(() => {
  const n = selection.value?.taken ?? 0
  if (!n) return ''
  return n > 1 ? `${n} jours déjà posés dans la période restent tels quels.` : '1 jour déjà posé dans la période reste tel quel.'
})

const canSubmit = computed(() => !props.saving && !!selection.value?.free && !check.value.blocking)

const submitLabel = computed(() => {
  if (props.saving) return 'Enregistrement…'
  const despite = check.value.messages.length ? ' quand même' : ''
  if (props.editing) return `Enregistrer${despite}`
  const n = selection.value?.free ?? 0
  if (!n) return 'Poser'
  if (poseDuration.value === 0.5) return `Poser la demi-journée${despite}`
  return `Poser ${n} jour${n > 1 ? 's' : ''}${despite}`
})

function submit() {
  if (!canSubmit.value) return
  emit('submit', {
    dateRange: bounds.value,
    type: type.value,
    status: poseStatus.value,
    duration: poseDuration.value,
    halfDay: poseDuration.value === 0.5 ? halfDay.value : null,
    editing: props.editing,
  })
}

function disabledDates(date) {
  const day = date.getDay()
  return day === 0 || day === 6 || isHolidayDate(date)
}

// Les repères du calendrier : un point sous chaque jour déjà posé (couleur du
// type), un trait sous chaque férié.
const markerColors = { conge: 'var(--cp)', rtt: 'var(--rtt)', maladie: 'var(--sick)' }
const hasSickLeave = computed(() => otherEntries.value.some(e => e.type === 'maladie'))
const markers = computed(() => {
  const taken = otherEntries.value.map(e => ({
    date: new Date(`${e.date}T00:00`),
    type: 'dot',
    color: markerColors[e.type],
    tooltip: [{
      text: e.type === 'maladie'
        ? typeLabels.maladie
        : `${typeLabels[e.type]} · ${statusLabels[e.status].toLowerCase()}${e.duration === 0.5 ? ` · ${halfDayLabels[e.half_day] ?? '½ j'}` : ''}`,
      color: markerColors[e.type],
    }],
  }))
  const year = new Date().getFullYear()
  const holidays = holidaysBetween(year - 1, year + 2).map(h => ({
    date: new Date(`${h.date}T00:00`),
    type: 'line',
    color: 'var(--warning)',
    tooltip: [{ text: `Férié : ${h.label}`, color: 'var(--warning)' }],
  }))
  return [...taken, ...holidays]
})
</script>

<template>
  <BottomSheet wide :open="open" :title="editing ? 'Modifier un congé' : 'Poser un congé'" @update:open="emit('update:open', $event)">
    <div class="form-layout">
      <div class="form-calendar">
        <div class="calendar">
          <VueDatePicker
            v-model="range"
            uid="period"
            inline
            range
            auto-apply
            :enable-time-picker="false"
            :disabled-dates="disabledDates"
            :markers="markers"
            locale="fr"
            :week-start="1"
            :dark="isDark"
            :month-change-on-scroll="false"
          />
        </div>
        <p class="calendar-legend">
          <span><i class="dot cp" aria-hidden="true"></i>CP posé</span>
          <span v-if="rttEnabled"><i class="dot rtt" aria-hidden="true"></i>RTT posé</span>
          <span v-if="hasSickLeave"><i class="dot sick" aria-hidden="true"></i>Arrêt maladie</span>
          <span><i class="line" aria-hidden="true"></i>Férié</span>
        </p>
      </div>

      <div class="form-details">
        <div class="selection" aria-live="polite">
          <template v-if="selection">
            <p class="selection-period">{{ periodText }}</p>
            <p v-if="daysText" class="selection-days">{{ daysText }}</p>
            <p v-if="takenText" class="selection-taken">{{ takenText }}</p>
          </template>
          <p v-else class="selection-empty">Choisissez un jour, ou le premier puis le dernier jour d’une période.</p>
        </div>

        <div class="fields">
          <div class="field">
            <span class="field-label">Type</span>
            <SegmentedControl v-model="type" class="wide" :options="typeOptions" label="Type" />
          </div>
          <div v-if="isSingleDay && !sick" class="field">
            <span class="field-label">Durée</span>
            <SegmentedControl v-model="duration" class="wide" :options="durationOptions" label="Durée" />
          </div>
          <div v-if="isSingleDay && !sick && duration === 0.5" class="field">
            <span class="field-label">Moment</span>
            <SegmentedControl v-model="halfDay" class="wide" :options="halfDayOptions" label="Moment" />
          </div>
          <div v-if="!sick" class="field">
            <span class="field-label">Statut</span>
            <SegmentedControl v-model="status" class="wide status-grid" :options="statusOptions" label="Statut" />
          </div>
          <p v-else class="field-hint">En journées entières. Un arrêt maladie ne compte ni sur les CP ni sur les RTT.</p>
        </div>

        <p v-if="preview && selection?.free" class="preview">
          Solde prévisionnel {{ typeLabels[type] }} au 31 décembre {{ preview.year }} :
          <span class="num">{{ formatDays(preview.before) }}</span>
          <span aria-hidden="true"> → </span><span class="visually-hidden"> puis </span>
          <strong class="num" :class="{ negative: preview.after < 0 }">{{ formatDays(preview.after) }}</strong>
        </p>

        <div v-if="check.messages.length" class="alert" :class="{ blocking: check.blocking }" role="alert">
          <AppIcon name="alert" :size="18" />
          <ul>
            <li v-for="(message, i) in check.messages" :key="i">{{ message }}</li>
          </ul>
        </div>
        <div v-if="error" class="alert blocking" role="alert">
          <AppIcon name="alert" :size="18" />
          <p>{{ error }}</p>
        </div>
      </div>
    </div>

    <template #footer>
      <!-- Sur mobile, l'alerte peut être loin au-dessus : on la rappelle près du bouton. -->
      <p v-if="check.messages.length" class="footer-alert" :class="{ blocking: check.blocking }">
        <AppIcon name="alert" :size="16" />
        {{ check.messages[0] }}<template v-if="check.messages.length > 1"> (et {{ check.messages.length - 1 }} autre{{ check.messages.length > 2 ? 's' : '' }})</template>
      </p>
      <button type="button" class="btn btn-secondary" @click="emit('update:open', false)">Annuler</button>
      <span class="footer-spacer"></span>
      <button type="button" class="btn btn-primary" :disabled="!canSubmit" @click="submit">{{ submitLabel }}</button>
    </template>
  </BottomSheet>
</template>

<style scoped>
/* Sur ordinateur, deux colonnes : le calendrier, et à côté tout ce qu'il faut
   pour décider sans faire défiler. */
.form-layout {
  display: grid;
  gap: 0.25rem 1.75rem;
}

@media (min-width: 760px) {
  .form-layout {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
  }

  .footer-alert {
    display: none !important;
  }
}

.calendar {
  display: flex;
  justify-content: center;
  --dp-cell-size: 40px;
}

.calendar :deep(.dp__menu) {
  border-radius: var(--radius);
}

.calendar-legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.4rem 1rem;
  margin: 0.5rem 0 1rem;
  font-size: 0.78rem;
  color: var(--text-subtle);
}

.calendar-legend span {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.dot.cp {
  background: var(--cp);
}

.dot.rtt {
  background: var(--rtt);
}

.dot.sick {
  background: var(--sick);
}

.line {
  width: 14px;
  height: 3px;
  border-radius: 2px;
  background: var(--warning);
}

.selection {
  margin-bottom: 1.1rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
  background: var(--input-bg);
  border: 1px solid var(--border);
}

.selection-period {
  font-weight: 700;
}

.selection-days {
  color: var(--text-muted);
}

.selection-taken,
.selection-empty {
  font-size: 0.85rem;
  color: var(--text-subtle);
}

.fields {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.preview {
  margin-top: 1.1rem;
  font-size: 0.9rem;
  color: var(--text-muted);
}

.preview strong {
  color: var(--text);
}

.negative {
  color: var(--danger) !important;
}

.alert {
  display: flex;
  gap: 0.6rem;
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
  background: var(--warning-soft);
  color: var(--warning);
  font-size: 0.88rem;
}

.alert.blocking {
  background: var(--danger-soft);
  color: var(--danger);
}

.alert ul {
  padding-left: 1rem;
}

.footer-spacer {
  flex: 1;
}

.footer-alert {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  flex-basis: 100%;
  font-size: 0.82rem;
  color: var(--warning);
}

.footer-alert.blocking {
  color: var(--danger);
}

.footer-alert .icon {
  margin-top: 0.15rem;
}
</style>
