<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import AppHeader from '../components/AppHeader.vue'
import AppIcon from '../components/AppIcon.vue'
import EntrySheet from '../components/EntrySheet.vue'
import MonthList from '../components/MonthList.vue'
import SegmentedControl from '../components/SegmentedControl.vue'
import StatusLegend from '../components/StatusLegend.vue'
import SummaryCards from '../components/SummaryCards.vue'
import TimeOffSheet from '../components/TimeOffSheet.vue'
import YearCalendar from '../components/YearCalendar.vue'
import { getWorkingDaysInRange, useBalance } from '../composables/useBalance'
import { showToast } from '../composables/useToasts'
import { statusLabels } from '../constants'
import { mergeRecaps, nextPeriod, pendingDays, periodOf, periodsOf, summaryMonths, today as todayOf } from '../dashboard'
import { formatDays, formatPeriod } from '../format'
import { setSolidarite } from '../holidays'

const router = useRouter()
const settings = ref(null)
const yearlyRtt = ref([])
const allEntries = ref([])
const loading = ref(true)
const loadError = ref(null)

const { monthlyRecap, confirmedRecap, checkNegativeBalance, previewYearEnd } = useBalance(settings, yearlyRtt, allEntries)

// ── Les soldes : prévisionnel ou confirmé, au choix, gardé dans ce navigateur ──
// Un choix d'affichage, gardé dans ce navigateur (sans stockage : pour la visite).
function remembered(key, allowed, fallback) {
  const choice = ref(fallback)
  try {
    const value = localStorage.getItem(key)
    if (allowed.includes(value)) choice.value = value
  } catch {
    // Stockage indisponible : le choix par défaut.
  }
  watch(choice, value => {
    try {
      localStorage.setItem(key, value)
    } catch {
      // Stockage indisponible : le choix vaut pour cette visite.
    }
  })
  return choice
}

const mode = remembered('timeoff-balance-mode', ['forecast', 'confirmed'], 'forecast')
const modeOptions = [
  { value: 'forecast', label: 'Prévisionnel' },
  { value: 'confirmed', label: 'Confirmé' },
]

const today = todayOf()
const months = computed(() => mergeRecaps(monthlyRecap.value, confirmedRecap.value))
const periods = computed(() => periodsOf(allEntries.value))
const summary = computed(() => summaryMonths(months.value))
const next = computed(() => nextPeriod(periods.value, today))
const pending = computed(() => pendingDays(allEntries.value, today))

// Ce que veut dire le mode choisi, avec les jours qui font la différence.
const modeHint = computed(() => {
  const n = pending.value
  const waiting = `${formatDays(n)} jour${n > 1 ? 's' : ''} en attente`
  if (mode.value === 'forecast') {
    return n ? `Tous les congés posés sont décomptés, dont ${waiting} (brouillons et demandes).` : 'Tous les congés posés sont décomptés.'
  }
  return n ? `Seuls les congés acceptés ou imposés sont décomptés : ${waiting} ne le sont pas.` : 'Seuls les congés acceptés ou imposés sont décomptés.'
})

// ── Les mois : les passés repliés, le mois en cours en tête ──
const showPast = ref(false)
const pastMonths = computed(() => months.value.filter(m => m.isPast))
const visibleMonths = computed(() => (showPast.value ? months.value : months.value.filter(m => !m.isPast)))

// Le statut mis en avant par la légende : fixé d'un clic, ou survolé à la souris.
const pinnedStatus = ref(null)
const previewStatus = ref(null)
const highlightedStatus = computed(() => previewStatus.value ?? pinnedStatus.value)

async function loadData() {
  loading.value = true
  loadError.value = null
  try {
    const s = await api.getSettings()
    settings.value = s
    setSolidarite(s?.journee_solidarite)
    if (!s) {
      router.push('/settings')
      return
    }
    const [rttData, entriesData] = await Promise.all([api.listYearlyRtt(), api.listEntries()])
    yearlyRtt.value = rttData
    allEntries.value = entriesData
    loading.value = false
  } catch (error) {
    loadError.value = error.message
  }
}

async function refreshEntries() {
  allEntries.value = await api.listEntries()
}

// Pour les messages : « Congé du 21 au 24 décembre supprimé. », « RTT le 30 octobre : accepté. »
const periodLabel = period => `${period.type === 'conge' ? 'Congé' : 'RTT'} ${formatPeriod(period.startDate, period.endDate)}`

// ── Un congé ouvert depuis sa puce : le congé entier, même sur deux mois ──
const entrySheetOpen = ref(false)
const openedPeriod = ref(null)
const busy = ref(false)

function openGroup(group) {
  openPeriod(periodOf(periods.value, group.entries[0].id))
}

function openPeriod(period) {
  if (!period) return
  openedPeriod.value = period
  entrySheetOpen.value = true
}

async function changeStatus(status) {
  const period = openedPeriod.value
  busy.value = true
  try {
    await api.setEntriesStatus(period.entries.map(e => e.id), status)
    await refreshEntries()
    // La période peut s'être jointe à sa voisine de même statut : on la relit.
    openedPeriod.value = periodOf(periods.value, period.entries[0].id)
    showToast({ message: `${periodLabel(period)} : ${statusLabels[status].toLowerCase()}.` })
  } catch (error) {
    showToast({ message: `Changement de statut impossible : ${error.message}`, tone: 'error' })
  } finally {
    busy.value = false
  }
}

async function deleteOpened() {
  const period = openedPeriod.value
  entrySheetOpen.value = false
  try {
    await api.deleteEntries(period.entries.map(e => e.id))
  } catch (error) {
    showToast({ message: `Suppression impossible : ${error.message}`, tone: 'error' })
    return
  }
  await refreshEntries().catch(() => {})
  showToast({
    message: `${periodLabel(period)} supprimé.`,
    action: { label: 'Annuler', run: () => restore(period) },
  })
}

// « Annuler » après une suppression : les mêmes jours, reposés à l'identique.
async function restore(period) {
  try {
    await api.addEntries(period.entries.map(({ date, type, status, duration, half_day }) => ({ date, type, status, duration, half_day })))
    await refreshEntries()
  } catch (error) {
    showToast({ message: `Impossible de rétablir ce congé : ${error.message}`, tone: 'error' })
  }
}

// ── Poser ou modifier un congé ──
const formOpen = ref(false)
const editingPeriod = ref(null)
const formStartDate = ref(null)
const saving = ref(false)
const formError = ref(null)

// `date` (AAAA-MM-JJ) : le jour cliqué dans le calendrier de l'année, déjà choisi.
function openNew(date) {
  editingPeriod.value = null
  formStartDate.value = typeof date === 'string' ? date : null
  formError.value = null
  formOpen.value = true
}

// ── Les mois en liste, ou l'année en calendrier ──
const view = remembered('timeoff-view', ['list', 'calendar'], 'list')
const viewOptions = [
  { value: 'list', label: 'Liste', icon: 'list' },
  { value: 'calendar', label: 'Calendrier', icon: 'calendar' },
]
const years = computed(() => [...new Set(months.value.map(m => m.year))])
const calendarYear = ref(new Date().getFullYear())
const shownYear = computed(() => (years.value.includes(calendarYear.value) ? calendarYear.value : years.value[0]))
const yearIndex = computed(() => years.value.indexOf(shownYear.value))

function openEntry(entry) {
  openPeriod(periodOf(periods.value, entry.id))
}

function editOpened() {
  editingPeriod.value = openedPeriod.value
  formError.value = null
  entrySheetOpen.value = false
  formOpen.value = true
}

async function submitForm({ dateRange, type, status, duration, halfDay, editing }) {
  saving.value = true
  formError.value = null
  try {
    // Les jours ouvrés de la période, sauf ceux d'un autre congé : le congé
    // modifié, lui, libère les siens.
    const replaced = new Set(editing?.entries.map(e => e.id) ?? [])
    const taken = new Set(allEntries.value.filter(e => !replaced.has(e.id)).map(e => e.date))
    const rows = getWorkingDaysInRange(...dateRange)
      .filter(date => !taken.has(date))
      .map(date => ({ date, type, status, duration, half_day: halfDay }))

    // Modifier, c'est remplacer les jours d'un seul coup : un échec ne perd rien.
    if (editing) await api.replaceEntries([...replaced], rows)
    else await api.addEntries(rows)
    await refreshEntries()

    formOpen.value = false
    const days = rows.reduce((n, r) => n + r.duration, 0)
    showToast({ message: editing ? 'Congé modifié.' : `${days === 0.5 ? 'Demi-journée posée' : `${formatDays(days)} jour${days > 1 ? 's' : ''} posé${days > 1 ? 's' : ''}`}.` })
  } catch (error) {
    formError.value = `Enregistrement impossible : ${error.message}`
    await refreshEntries().catch(() => {})
  } finally {
    saving.value = false
  }
}

onMounted(loadData)

// Une ombre sous la barre de réglages, dès que la page défile dessous.
const scrolled = ref(false)
const onScroll = () => {
  scrolled.value = window.scrollY > 4
}
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
</script>

<template>
  <AppHeader>
    <button v-if="!loading" type="button" class="btn btn-primary new-wide" @click="openNew">
      <AppIcon name="plus" :size="18" />
      Poser un congé
    </button>
    <router-link to="/settings" class="btn btn-ghost btn-icon" aria-label="Paramètres" title="Paramètres">
      <AppIcon name="settings" />
    </router-link>
  </AppHeader>

  <main class="page">
    <div v-if="loadError" class="state">
      <p>Impossible de charger vos congés.</p>
      <p class="state-detail">{{ loadError }}</p>
      <button type="button" class="btn btn-primary" @click="loadData">Réessayer</button>
    </div>
    <div v-else-if="loading" class="state" aria-busy="true">Chargement…</div>

    <template v-else>
      <!-- Ce qui règle tout l'affichage : les soldes montrés, le statut mis en
           avant. Sur ordinateur, collé sous la barre du haut dès le départ. -->
      <div class="controls" :class="{ scrolled }">
        <SegmentedControl v-model="mode" :options="modeOptions" label="Soldes affichés" />
        <StatusLegend v-model="pinnedStatus" :highlighted="highlightedStatus" @preview="previewStatus = $event" />
      </div>
      <p class="mode-hint">{{ modeHint }}</p>

      <SummaryCards
        :current="summary.current"
        :year-end="summary.yearEnd"
        :mode="mode"
        :next="next"
        :today="today"
        @open="openPeriod"
        @new="openNew"
      />

      <section class="months-section" aria-labelledby="months-title">
        <div class="months-head">
          <h2 id="months-title">{{ view === 'list' ? 'Mois par mois' : 'L’année' }}</h2>
          <SegmentedControl v-model="view" :options="viewOptions" label="Affichage" />
        </div>

        <template v-if="view === 'list'">
          <button
            v-if="pastMonths.length"
            type="button"
            class="btn btn-ghost past-toggle"
            :aria-expanded="showPast ? 'true' : 'false'"
            @click="showPast = !showPast"
          >
            <AppIcon :name="showPast ? 'chevron-up' : 'chevron-down'" :size="18" />
            {{ showPast ? 'Masquer' : 'Afficher' }} les {{ pastMonths.length }} mois passés
          </button>
          <MonthList :months="visibleMonths" :mode="mode" :highlighted="highlightedStatus" @open="openGroup" />
        </template>

        <template v-else>
          <div class="year-nav">
            <button type="button" class="btn btn-ghost btn-icon" aria-label="Année précédente" :disabled="yearIndex <= 0" @click="calendarYear = years[yearIndex - 1]">
              <AppIcon name="chevron-left" />
            </button>
            <span class="year-label num" aria-live="polite">{{ shownYear }}</span>
            <button type="button" class="btn btn-ghost btn-icon" aria-label="Année suivante" :disabled="yearIndex >= years.length - 1" @click="calendarYear = years[yearIndex + 1]">
              <AppIcon name="chevron-right" />
            </button>
          </div>
          <YearCalendar :year="shownYear" :entries="allEntries" :highlighted="highlightedStatus" :today="today" @open="openEntry" @pick="openNew" />
        </template>
      </section>
    </template>
  </main>

  <button v-if="!loading" type="button" class="fab" aria-label="Poser un congé" @click="openNew">
    <AppIcon name="plus" :size="26" />
  </button>

  <EntrySheet
    v-model:open="entrySheetOpen"
    :period="openedPeriod"
    :busy="busy"
    @status="changeStatus"
    @edit="editOpened"
    @delete="deleteOpened"
  />
  <TimeOffSheet
    v-model:open="formOpen"
    :editing="editingPeriod"
    :start-date="formStartDate"
    :entries="allEntries"
    :check-balance="checkNegativeBalance"
    :preview-year-end="previewYearEnd"
    :saving="saving"
    :error="formError"
    @submit="submitForm"
  />
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  max-width: 1040px;
  margin: 0 auto;
  padding: 1rem 1rem 6.5rem;
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  min-height: 60vh;
  text-align: center;
  color: var(--text-muted);
}

.state-detail {
  font-size: 0.85rem;
  color: var(--text-subtle);
}

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem 1rem;
}

.mode-hint {
  margin-top: -0.6rem;
  font-size: 0.85rem;
  color: var(--text-subtle);
}

/* Sur ordinateur, la barre de réglages est collée sous la barre du haut dès le
   départ : elle ne bouge jamais au défilement, la souris ne quitte donc pas le
   statut survolé, qui reste en avant sur toute la liste. (Au doigt, un toucher
   fixe le statut : rien à coller, et la place est comptée.) */
@media (min-width: 760px) {
  .controls {
    position: sticky;
    top: var(--app-header-height, 60px);
    z-index: 10;
    padding: 1rem 0 0.75rem;
    background: var(--bg);
    transition: box-shadow 0.2s;
  }

  .controls.scrolled {
    box-shadow: 0 1px 0 var(--border), 0 8px 16px -12px rgba(0, 0, 0, 0.35);
  }
}

.months-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.months-section h2 {
  font-size: 1.1rem;
  font-weight: 700;
}

.months-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem 1rem;
}

.year-nav {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.year-label {
  min-width: 3.5rem;
  font-size: 1.1rem;
  font-weight: 700;
  text-align: center;
}

.past-toggle {
  align-self: flex-start;
}

/* « Poser un congé » : dans la barre du haut sur ordinateur, un bouton rond à
   portée de pouce sur mobile. */
.fab {
  position: fixed;
  right: calc(1rem + env(safe-area-inset-right));
  bottom: calc(1rem + env(safe-area-inset-bottom));
  z-index: 30;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  border: none;
  border-radius: 50%;
  background: var(--primary);
  color: var(--on-primary);
  box-shadow: var(--shadow-lg);
  cursor: pointer;
}

.fab:hover {
  background: var(--primary-hover);
}

.new-wide {
  display: none;
}

@media (min-width: 760px) {
  /* Rien au-dessus de la barre de réglages : collée sous la barre du haut à
     sa place naturelle, elle n'a pas à remonter. */
  .page {
    padding: 0 1.5rem 3rem;
  }

  .fab {
    display: none;
  }

  .new-wide {
    display: inline-flex;
  }
}
</style>
