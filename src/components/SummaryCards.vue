<script setup>
import AppIcon from './AppIcon.vue'
import { monthNames, statusIcons, statusLabels, typeLabels } from '../constants'
import { whenLabel } from '../dashboard'
import { formatDays, formatPeriod } from '../format'

// L'essentiel, en haut du tableau de bord : le solde à la fin du mois, celui
// de fin d'année, et le prochain congé. Les soldes suivent le mode choisi
// (prévisionnel ou confirmé).
defineProps({
  current: { type: Object, default: null },
  yearEnd: { type: Object, default: null },
  mode: { type: String, required: true },
  next: { type: Object, default: null },
  today: { type: String, required: true },
})

const emit = defineEmits(['open', 'new'])

const monthName = month => monthNames[month.month - 1].toLowerCase()
const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1)
</script>

<template>
  <section class="summary" aria-label="Vos soldes en bref">
    <article v-if="current" class="card summary-card">
      <h2 class="summary-title">Ce mois-ci</h2>
      <p class="summary-sub">Solde à fin {{ monthName(current) }}</p>
      <div class="balances">
        <p class="balance cp">
          <span class="balance-type">CP</span>
          <span class="balance-value num" :class="{ negative: current[mode].cp < 0 }">{{ formatDays(current[mode].cp) }}</span>
        </p>
        <p class="balance rtt">
          <span class="balance-type">RTT</span>
          <span class="balance-value num" :class="{ negative: current[mode].rtt < 0 }">{{ formatDays(current[mode].rtt) }}</span>
        </p>
      </div>
    </article>

    <article v-if="yearEnd" class="card summary-card">
      <h2 class="summary-title">Fin {{ yearEnd.year }}</h2>
      <p class="summary-sub">Solde au 31 décembre</p>
      <div class="balances">
        <p class="balance cp">
          <span class="balance-type">CP</span>
          <span class="balance-value num" :class="{ negative: yearEnd[mode].cp < 0 }">{{ formatDays(yearEnd[mode].cp) }}</span>
        </p>
        <p class="balance rtt">
          <span class="balance-type">RTT</span>
          <span class="balance-value num" :class="{ negative: yearEnd[mode].rtt < 0 }">{{ formatDays(yearEnd[mode].rtt) }}</span>
        </p>
      </div>
      <p v-if="yearEnd[mode].rttDecemberWarning" class="summary-warning">
        <AppIcon name="alert" :size="16" />
        {{ formatDays(yearEnd[mode].rtt) }} RTT à poser avant le 31 décembre
      </p>
    </article>

    <article class="card summary-card next">
      <h2 class="summary-title">Prochain congé</h2>
      <button v-if="next" type="button" class="next-period" @click="emit('open', next)">
        <span class="next-when">{{ capitalize(whenLabel(next, today)) }}</span>
        <span class="next-what" :class="next.type">{{ typeLabels[next.type] }} {{ formatPeriod(next.startDate, next.endDate) }}</span>
        <span class="next-status">
          <AppIcon :name="statusIcons[next.status]" :size="15" />
          {{ statusLabels[next.status] }}
        </span>
      </button>
      <template v-else>
        <p class="summary-sub">Aucun congé à venir.</p>
        <button type="button" class="btn btn-secondary" @click="emit('new')">
          <AppIcon name="plus" :size="18" />
          Poser un congé
        </button>
      </template>
    </article>
  </section>
</template>

<style scoped>
.summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 1rem 1.1rem;
}

.summary-card.next {
  grid-column: 1 / -1;
}

.summary-title {
  font-size: 0.95rem;
  font-weight: 700;
}

.summary-sub {
  font-size: 0.8rem;
  color: var(--text-subtle);
}

.balances {
  display: flex;
  gap: 1.25rem;
  margin-top: 0.5rem;
}

.balance {
  display: flex;
  flex-direction: column;
}

.balance-type {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.balance.cp .balance-type {
  color: var(--cp);
}

.balance.rtt .balance-type {
  color: var(--rtt);
}

.balance-value {
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.01em;
}

.negative {
  color: var(--danger);
}

.summary-warning {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.6rem;
  font-size: 0.82rem;
  color: var(--warning);
}

.next-period {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  margin-top: 0.4rem;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
}

.next-when {
  font-size: 0.8rem;
  color: var(--text-subtle);
}

.next-what {
  font-size: 1.05rem;
  font-weight: 700;
}

.next-what.conge {
  color: var(--cp);
}

.next-what.rtt {
  color: var(--rtt);
}

.next-status {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.next-period:hover .next-what {
  text-decoration: underline;
}

.summary-card.next .btn {
  align-self: flex-start;
  margin-top: 0.5rem;
}

@media (min-width: 860px) {
  .summary {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .summary-card.next {
    grid-column: auto;
  }
}
</style>
