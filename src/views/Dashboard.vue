<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { api } from '../api'
import { useRouter } from 'vue-router'
import { setSolidarite } from '../holidays'
import { useBalance, getWorkingDaysInRange } from '../composables/useBalance'
import { showToast } from '../composables/useToasts'
import { formatDays, formatPeriod } from '../format'
import StatusLegend from '../components/StatusLegend.vue'
import EntryChip from '../components/EntryChip.vue'
import TimeOffForm from '../components/TimeOffForm.vue'

const router = useRouter()
const settings = ref(null)
const yearlyRtt = ref([])
const allEntries = ref([])
const loading = ref(true)
const loadError = ref(null)

const showForm = ref(false)
const formRef = ref(null)
const editingGroup = ref(null)

// Le statut mis en avant par la légende : fixé d'un clic, ou survolé à la souris.
const pinnedStatus = ref(null)
const previewStatus = ref(null)
const highlightedStatus = computed(() => previewStatus.value ?? pinnedStatus.value)

const { monthlyRecap, checkNegativeBalance } = useBalance(settings, yearlyRtt, allEntries)

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

function toggleForm() {
  if (showForm.value) {
    showForm.value = false
    editingGroup.value = null
  } else {
    showForm.value = true
  }
}

async function onFormSubmit({ dateRange, type, status, duration, editingGroup: group, forceConfirm }) {
  if (!dateRange) return

  if (!forceConfirm) {
    const { messages, blocking } = checkNegativeBalance(dateRange, type, duration, status, group?.entries || [])
    if (messages.length > 0 && formRef.value) {
      formRef.value.setWarnings(messages, blocking)
      return
    }
  }

  formRef.value?.setSaving(true)

  try {
    const startDate = Array.isArray(dateRange) ? dateRange[0] : dateRange
    const endDate = Array.isArray(dateRange) ? dateRange[1] : dateRange

    // Les jours ouvrés de la période, sauf ceux d'un autre congé : le congé
    // modifié, lui, libère les siens.
    const replaced = new Set(group?.entries.map(e => e.id) ?? [])
    const taken = new Set(allEntries.value.filter(e => !replaced.has(e.id)).map(e => e.date))
    const rows = getWorkingDaysInRange(startDate, endDate)
      .filter(date => !taken.has(date))
      .map(date => ({ date, type, status, duration }))

    // Modifier, c'est remplacer les jours d'un seul coup : un échec ne perd rien.
    if (group) await api.replaceEntries([...replaced], rows)
    else if (rows.length > 0) await api.addEntries(rows)
    allEntries.value = await api.listEntries()
  } catch (error) {
    formRef.value?.setSaving(false)
    formRef.value?.setWarnings([`Enregistrement impossible : ${error.message}`], true)
    allEntries.value = await api.listEntries().catch(() => allEntries.value)
    return
  }

  editingGroup.value = null
  formRef.value?.reset()
  showForm.value = false
}

function onEditGroup(group) {
  editingGroup.value = group
  showForm.value = true
  nextTick(() => formRef.value?.loadGroup(group))
}

async function deleteGroup(group) {
  const ids = group.entries.map(e => e.id)
  try {
    await api.deleteEntries(ids)
  } catch (error) {
    showToast({ message: `Suppression impossible : ${error.message}`, tone: 'error' })
    return
  }
  allEntries.value = allEntries.value.filter(e => !ids.includes(e.id))
  showToast({
    message: `${group.type === 'conge' ? 'Congé' : 'RTT'} ${formatPeriod(group.startDate, group.endDate)} supprimé.`,
    action: { label: 'Annuler', run: () => restoreGroup(group) },
  })
}

// « Annuler » après une suppression : les mêmes jours, reposés à l'identique.
async function restoreGroup(group) {
  try {
    await api.addEntries(group.entries.map(({ date, type, status, duration }) => ({ date, type, status, duration })))
    allEntries.value = await api.listEntries()
  } catch (error) {
    showToast({ message: `Impossible de rétablir ce congé : ${error.message}`, tone: 'error' })
  }
}

async function logout() {
  await api.logout()
  router.push('/login')
}

onMounted(loadData)
</script>

<template>
  <div v-if="loadError" class="state">
    <p>Impossible de charger vos congés.</p>
    <p class="state-detail">{{ loadError }}</p>
    <button type="button" class="btn-add" @click="loadData">Réessayer</button>
  </div>
  <div v-else-if="loading" class="state">Chargement...</div>
  <div v-else class="dashboard">
    <header>
      <div class="header-left">
        <h1>TimeOff Planner</h1>
      </div>
      <div class="header-right">
        <button type="button" class="btn-add" @click="toggleForm">
          {{ showForm ? 'Fermer' : '+ Poser un congé' }}
        </button>
        <router-link to="/settings" class="settings-link">Paramètres</router-link>
        <button type="button" class="btn-logout" @click="logout">Déconnexion</button>
      </div>
    </header>

    <TimeOffForm
      ref="formRef"
      v-model="showForm"
      :editing-group="editingGroup"
      :check-balance="checkNegativeBalance"
      @submit="onFormSubmit"
    />

    <StatusLegend
      v-model="pinnedStatus"
      :highlighted="highlightedStatus"
      @preview="previewStatus = $event"
    />

    <!-- Monthly recap table -->
    <div class="table-wrapper">
      <table class="recap-table">
        <thead>
          <tr>
            <th>Mois</th>
            <th class="th-num">Total</th>
            <th class="th-num">CP</th>
            <th class="th-num col-used">Posés</th>
            <th class="th-num">RTT</th>
            <th class="th-num col-used">Posés</th>
            <th class="col-detail">Détail</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in monthlyRecap" :key="row.label">
            <tr :class="{ current: row.isCurrent }">
              <td class="month-label">{{ row.label }}</td>
              <td class="num" :class="{ negative: row.total < 0 }">{{ formatDays(row.total) }}</td>
              <td class="num cp" :class="{ negative: row.cp < 0 }">{{ formatDays(row.cp) }}</td>
              <td class="num used col-used">{{ row.cpUsed ? formatDays(row.cpUsed) : '' }}</td>
              <td class="num rtt" :class="{ negative: row.rtt < 0 }">
                {{ formatDays(row.rtt) }}
                <span v-if="row.rttDecemberWarning" class="rtt-warn">⚠</span>
              </td>
              <td class="num used col-used">{{ row.rttUsed ? formatDays(row.rttUsed) : '' }}</td>
              <td class="detail" :class="{ empty: !row.groups.length }">
                <!-- Les puces dans leur propre boîte : la cellule reste une cellule
                     de tableau, alignée sur les autres. -->
                <div class="detail-chips">
                  <EntryChip
                    v-for="(group, gi) in row.groups"
                    :key="gi"
                    :group="group"
                    :dimmed="!!highlightedStatus && highlightedStatus !== group.status"
                    @delete="deleteGroup"
                    @edit="onEditGroup"
                  />
                </div>
              </td>
            </tr>
            <tr v-if="row.rttDecemberWarning" class="rtt-warn-row">
              <td colspan="7" class="rtt-warn-cell">
                ⚠ Il vous reste {{ formatDays(row.rtt) }} RTT — pensez à les poser avant le 31 décembre. Seules les décimales seront reportées en janvier.
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  max-width: 900px;
  margin: 0 auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 0.5rem;
}

header h1 {
  margin: 0;
  font-size: 1.4rem;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.settings-link {
  color: #646cff;
  text-decoration: none;
  font-size: 0.9rem;
}

.btn-logout {
  padding: 0.4rem 0.8rem;
  border: 1px solid #444;
  border-radius: 6px;
  background: transparent;
  color: #ccc;
  cursor: pointer;
  font-size: 0.85rem;
  transition: border-color 0.2s, color 0.2s;
}

.btn-logout:hover {
  border-color: #e74c3c;
  color: #e74c3c;
}

.btn-add {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  background: #646cff;
  color: #fff;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background 0.2s;
}

.btn-add:hover {
  background: #535bf2;
}

/* Table */
.table-wrapper {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.recap-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 0.85rem;
  table-layout: fixed;
}

.recap-table th {
  text-align: left;
  padding: 0.6rem 0.5rem;
  color: #888;
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  position: sticky;
  top: 0;
  z-index: 1;
  background: #0f0f1e;
  box-shadow: 0 0 0 2px #0f0f1e, 0 2px 0 0 #0f0f1e, 0 3px 0 0 #2a2a40;
}

.recap-table th.th-num {
  text-align: right;
  width: 60px;
}

.recap-table th:first-child {
  width: 130px;
}

.recap-table th:last-child {
  width: auto;
}

.recap-table td {
  padding: 0.5rem;
  border-bottom: 1px solid #1a1a30;
  vertical-align: middle;
}

.recap-table tr.current {
  background: #1a1a3e;
}

.recap-table tr.current td.month-label {
  font-weight: 700;
  color: #646cff;
}

.month-label {
  white-space: nowrap;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
}

.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  transition: color 0.2s;
}

.num.negative {
  color: #e74c3c !important;
  font-weight: 600;
}

.num.cp {
  color: #8a8fff;
}

.num.rtt {
  color: #f0c078;
}

.rtt-warn {
  font-size: 0.7rem;
  color: #f0c078;
  margin-left: 0.2rem;
}

.rtt-warn-row td {
  border-bottom: 1px solid #1a1a30;
}

.rtt-warn-cell {
  padding: 0.3rem 0.5rem 0.5rem;
  font-size: 0.75rem;
  color: #f0c078;
  background: rgba(240, 192, 120, 0.06);
}

.num.used {
  color: #888;
}

.detail-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  align-items: center;
}

.state {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 0.75rem;
  min-height: 100vh;
  padding: 1rem;
  color: #888;
  text-align: center;
}

.state-detail {
  font-size: 0.85rem;
  color: #777;
}

@media (max-width: 600px) {
  .dashboard {
    padding: 0.75rem 0.5rem;
  }

  header {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  header h1 {
    font-size: 1.2rem;
  }

  .header-right {
    display: flex;
    gap: 0.5rem;
  }

  .header-right .btn-add {
    flex: 1;
    text-align: center;
    padding: 0.6rem 0.75rem;
    min-height: 44px;
  }

  .header-right .settings-link {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    border: 1px solid #333;
    border-radius: 6px;
    font-size: 0.8rem;
    padding: 0 0.6rem;
  }

  .header-right .btn-logout {
    min-width: 44px;
    min-height: 44px;
    font-size: 0.8rem;
    padding: 0 0.6rem;
  }

  /* Chaque mois en deux lignes : les soldes, puis les congés posés sur toute
     la largeur. Les colonnes « Posés » s'effacent : les puces disent déjà ce
     qui est posé. Plus rien ne dépasse de l'écran. */
  .recap-table,
  .recap-table thead,
  .recap-table tbody {
    display: block;
  }

  .recap-table thead {
    position: sticky;
    top: 0;
    z-index: 1;
    background: #0f0f1e;
  }

  .recap-table tr {
    display: grid;
    grid-template-columns: minmax(0, 1.7fr) repeat(3, minmax(0, 1fr));
    align-items: center;
    border-bottom: 1px solid #1a1a30;
  }

  .recap-table thead tr {
    border-bottom-color: #2a2a40;
  }

  .recap-table th {
    position: static;
    box-shadow: none;
    padding: 0.4rem 0.35rem;
    font-size: 0.7rem;
  }

  .recap-table .col-used,
  .recap-table .col-detail,
  .recap-table td.detail.empty {
    display: none;
  }

  .recap-table td {
    padding: 0.4rem 0.35rem;
    border-bottom: none;
  }

  .recap-table td.detail,
  .rtt-warn-row td {
    grid-column: 1 / -1;
  }

  .recap-table td.detail {
    padding-top: 0;
  }
}
</style>
