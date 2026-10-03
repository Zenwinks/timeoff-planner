<script setup>
import AppIcon from './AppIcon.vue'
import EntryChip from './EntryChip.vue'
import { formatDays } from '../format'

// Les mois, l'un sous l'autre : les soldes de fin de mois (selon le mode), puis
// les congés posés. Sur ordinateur, une ligne par mois sous des intitulés de
// colonnes ; sur mobile, chaque mois tient sur sa largeur, intitulés compris.
defineProps({
  months: { type: Array, required: true },
  mode: { type: String, required: true },
  highlighted: { type: String, default: null },
})

const emit = defineEmits(['open'])
</script>

<template>
  <div class="months">
    <div class="months-header" aria-hidden="true">
      <span>Mois</span>
      <span class="num-col">CP</span>
      <span class="num-col">RTT</span>
      <span class="num-col">Total</span>
      <span>Congés posés</span>
    </div>
    <ol class="month-list">
      <li
        v-for="month in months"
        :key="month.key"
        class="month"
        :class="{ current: month.isCurrent, past: month.isPast }"
        :aria-current="month.isCurrent ? 'date' : undefined"
      >
        <div class="month-name">
          <h3>{{ month.label }}</h3>
          <span v-if="month.isCurrent" class="badge">Ce mois-ci</span>
        </div>
        <dl class="month-balances">
          <div class="balance cp">
            <dt>CP</dt>
            <dd class="num" :class="{ negative: month[mode].cp < 0 }">{{ formatDays(month[mode].cp) }}</dd>
          </div>
          <div class="balance rtt">
            <dt>RTT</dt>
            <dd class="num" :class="{ negative: month[mode].rtt < 0 }">{{ formatDays(month[mode].rtt) }}</dd>
          </div>
          <div class="balance total">
            <dt>Total</dt>
            <dd class="num" :class="{ negative: month[mode].total < 0 }">{{ formatDays(month[mode].total) }}</dd>
          </div>
        </dl>
        <div v-if="month.groups.length" class="month-entries">
          <EntryChip
            v-for="(group, i) in month.groups"
            :key="i"
            :group="group"
            :dimmed="!!highlighted && highlighted !== group.status"
            @open="emit('open', group)"
          />
        </div>
        <p v-if="month[mode].rttDecemberWarning" class="month-warning">
          <AppIcon name="alert" :size="16" />
          Il reste {{ formatDays(month[mode].rtt) }} RTT : à poser avant le 31 décembre, seules les décimales passent en janvier.
        </p>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.months {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.months-header {
  display: none;
}

.month-list {
  list-style: none;
}

.month {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.5rem;
  padding: 0.85rem 1rem;
  border-top: 1px solid var(--border);
}

.month:first-child {
  border-top: none;
}

.month.past {
  opacity: 0.75;
}

.month.current {
  background: var(--primary-soft);
  box-shadow: inset 3px 0 0 var(--focus);
}

.month-name {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.month-name h3 {
  font-size: 0.98rem;
  font-weight: 700;
}

.badge {
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: var(--primary);
  color: var(--on-primary);
  font-size: 0.7rem;
  font-weight: 700;
}

.month-balances {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}

.balance {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
}

.balance dt {
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: var(--text-subtle);
}

.balance.cp dt {
  color: var(--cp);
}

.balance.rtt dt {
  color: var(--rtt);
}

.balance dd {
  font-size: 1.05rem;
  font-weight: 650;
}

.balance.total dd {
  color: var(--text-muted);
}

.negative {
  color: var(--danger) !important;
}

.month-entries {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.month-warning {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  padding: 0.55rem 0.75rem;
  border-radius: var(--radius);
  background: var(--warning-soft);
  color: var(--warning);
  font-size: 0.85rem;
}

.month-warning .icon {
  margin-top: 0.1rem;
}

/* Sur ordinateur : une ligne par mois, sous des intitulés de colonnes. */
@media (min-width: 760px) {
  .months-header,
  .month {
    grid-template-columns: 11.5rem 5.5rem 5.5rem 5.5rem minmax(0, 1fr);
    column-gap: 0.75rem;
    align-items: center;
  }

  .months-header {
    display: grid;
    padding: 0.65rem 1rem;
    border-bottom: 1px solid var(--border);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-subtle);
  }

  .month {
    padding: 0.6rem 1rem;
  }

  .month-balances {
    display: contents;
  }

  .balance {
    justify-content: flex-end;
  }

  .balance dt {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }

  .num-col {
    text-align: right;
  }

  .month-warning {
    grid-column: 1 / -1;
  }
}
</style>
