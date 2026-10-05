<script setup>
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import BottomSheet from './BottomSheet.vue'
import SegmentedControl from './SegmentedControl.vue'
import { CONFIRMED_STATUSES, isSickLeave, statusIcons, statusLabels, typeLabels } from '../constants'
import { formatDays, formatPeriod } from '../format'

// Un congé ouvert depuis sa puce : ce qu'il est, son statut (qui se change d'un
// toucher), et de quoi le modifier ou le supprimer. Le congé entier, même à
// cheval sur deux mois.
const props = defineProps({
  open: { type: Boolean, default: false },
  period: { type: Object, default: null },
  busy: { type: Boolean, default: false },
})

const emit = defineEmits(['update:open', 'status', 'edit', 'delete'])

const statusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label, icon: statusIcons[value] }))

const title = computed(() => {
  const p = props.period
  if (!p) return ''
  const period = formatPeriod(p.startDate, p.endDate)
  return `${typeLabels[p.type]} ${period}`
})

const facts = computed(() => {
  const p = props.period
  if (!p) return ''
  const moment = { matin: ', le matin', 'apres-midi': ', l’après-midi' }[p.halfDay] ?? ''
  const length = p.duration === 0.5 ? `Une demi-journée${moment}` : `${formatDays(p.days)} jour${p.days > 1 ? 's' : ''} ouvré${p.days > 1 ? 's' : ''}`
  return `${{ conge: 'Congés payés', rtt: 'RTT', maladie: 'Arrêt maladie' }[p.type]} · ${length}`
})

// Un arrêt maladie : pas de statut à suivre, et rien de décompté.
const sick = computed(() => !!props.period && isSickLeave(props.period))

// Les deux soldes, dits pour ce congé-ci.
const countsIn = computed(() =>
  props.period && CONFIRMED_STATUSES.has(props.period.status)
    ? 'Décompté du solde confirmé comme du prévisionnel.'
    : 'Décompté du solde prévisionnel seulement : il ne compte dans le confirmé qu’une fois accepté ou imposé.')
</script>

<template>
  <BottomSheet :open="open" :title="title" @update:open="emit('update:open', $event)">
    <template v-if="period">
      <p class="facts">{{ facts }}</p>
      <p v-if="sick" class="field-hint">Ne compte ni sur les CP ni sur les RTT. Au forfait jours, ce sont des jours non travaillés.</p>
      <div v-else class="field">
        <span class="field-label">Statut</span>
        <SegmentedControl
          class="wide status-grid"
          :model-value="period.status"
          :options="statusOptions"
          label="Statut"
          :disabled="busy"
          @update:model-value="status => status !== period.status && emit('status', status)"
        />
        <p class="field-hint">{{ countsIn }}</p>
      </div>
    </template>
    <template #footer>
      <button type="button" class="btn btn-danger-ghost" :disabled="busy" @click="emit('delete')">
        <AppIcon name="trash" :size="18" />
        Supprimer
      </button>
      <span class="footer-spacer"></span>
      <button type="button" class="btn btn-secondary" :disabled="busy" @click="emit('edit')">
        <AppIcon name="pencil" :size="18" />
        Modifier
      </button>
    </template>
  </BottomSheet>
</template>

<style scoped>
.facts {
  margin-bottom: 1.1rem;
  color: var(--text-muted);
}

.footer-spacer {
  flex: 1;
}
</style>
