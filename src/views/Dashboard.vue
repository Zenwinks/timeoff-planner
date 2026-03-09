<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../supabase'
import { useRouter } from 'vue-router'
import VueDatePicker from '@vuepic/vue-datepicker'
import '@vuepic/vue-datepicker/dist/main.css'
import { isHoliday, isHolidayDate, setSolidarite } from '../holidays'

const router = useRouter()
const user = ref(null)
const settings = ref(null)
const yearlyRtt = ref([])
const allEntries = ref([])
const loading = ref(true)

// Form for new time off
const showForm = ref(false)
const formDateRange = ref(null)
const formType = ref('conge')
const formStatus = ref('brouillon')
const formDuration = ref(1)
const formSaving = ref(false)

const isSingleDay = computed(() => {
  if (!formDateRange.value) return false
  const range = formDateRange.value
  if (!Array.isArray(range)) return true
  const start = range[0]
  const end = range[1]
  if (!start || !end) return true
  return start.getTime() === end.getTime()
})

// Disable weekends and holidays in date picker
function disabledDates(date) {
  const day = date.getDay()
  return day === 0 || day === 6 || isHolidayDate(date)
}

const monthNames = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
]

const statusLabels = {
  brouillon: 'Brouillon',
  demande: 'Demandé',
  accepte: 'Accepté',
  impose: 'Imposé',
}

const statusColors = {
  brouillon: '#888',
  demande: '#f0ad4e',
  accepte: '#5cb85c',
  impose: '#e67e22',
}

// Group consecutive entries into ranges for display
function groupEntries(monthEntries) {
  if (monthEntries.length === 0) return []

  // Sort by date
  const sorted = [...monthEntries].sort((a, b) => a.date.localeCompare(b.date))
  const groups = []
  let currentGroup = null

  for (const entry of sorted) {
    if (currentGroup && entry.type === currentGroup.type && entry.status === currentGroup.status && entry.duration === currentGroup.duration && isNextWorkingDay(currentGroup.endDate, entry.date)) {
      currentGroup.entries.push(entry)
      currentGroup.endDate = entry.date
      currentGroup.endDay = new Date(entry.date + 'T00:00').getDate()
    } else {
      currentGroup = {
        type: entry.type,
        status: entry.status,
        duration: entry.duration,
        startDate: entry.date,
        endDate: entry.date,
        startDay: new Date(entry.date + 'T00:00').getDate(),
        endDay: new Date(entry.date + 'T00:00').getDate(),
        entries: [entry],
      }
      groups.push(currentGroup)
    }
  }

  return groups
}

function isNextWorkingDay(dateStrA, dateStrB) {
  const a = new Date(dateStrA + 'T00:00')
  const b = new Date(dateStrB + 'T00:00')
  const next = new Date(a)
  next.setDate(next.getDate() + 1)
  while (next.getDay() === 0 || next.getDay() === 6 || isHoliday(formatDate(next))) {
    next.setDate(next.getDate() + 1)
  }
  return next.getTime() === b.getTime()
}

// Build the monthly recap table
const monthlyRecap = computed(() => {
  if (!settings.value) return []

  const s = settings.value
  const startYear = Number(s.start_year)

  // Always start from January
  const startAbs = startYear * 12 // January = month 0

  const now = new Date()
  const nowAbs = now.getFullYear() * 12 + now.getMonth()
  const endAbs = Math.max(startAbs + 23, nowAbs + 12)

  let cpBalance = Number(s.initial_conges) || 0
  let rttBalance = Number(s.initial_rtt) || 0
  const cpIncrement = Number(s.conges_increment_per_month) || 0
  const rows = []

  for (let abs = startAbs; abs <= endAbs; abs++) {
    const year = Math.floor(abs / 12)
    const month = abs % 12 // 0-based

    // Add CP increment each month
    cpBalance += cpIncrement

    // Add yearly RTT in January
    if (month === 0) {
      const rttForYear = yearlyRtt.value.find(r => Number(r.year) === year)
      if (rttForYear) {
        rttBalance += Number(rttForYear.rtt_count) || 0
      }
    }

    // Entries for this month
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`
    const monthEntries = allEntries.value.filter(e => e.date.startsWith(monthStr))
    const cpUsed = monthEntries.filter(e => e.type === 'conge').reduce((sum, e) => sum + (Number(e.duration) || 1), 0)
    const rttUsed = monthEntries.filter(e => e.type === 'rtt').reduce((sum, e) => sum + (Number(e.duration) || 1), 0)

    cpBalance -= cpUsed
    rttBalance -= rttUsed

    const isCurrent = year === now.getFullYear() && month === now.getMonth()
    const entryGroups = groupEntries(monthEntries)

    rows.push({
      label: `${monthNames[month]} ${year}`,
      year,
      month: month + 1,
      total: Math.round((cpBalance + rttBalance) * 100) / 100,
      cp: Math.round(cpBalance * 100) / 100,
      cpUsed,
      rtt: Math.round(rttBalance * 100) / 100,
      rttUsed,
      isCurrent,
      groups: entryGroups,
    })
  }

  return rows
})

function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getWorkingDaysInRange(startDate, endDate) {
  const days = []
  const current = new Date(startDate)
  const end = new Date(endDate)
  while (current <= end) {
    const dow = current.getDay()
    const dateStr = formatDate(current)
    if (dow !== 0 && dow !== 6 && !isHoliday(dateStr)) {
      days.push(dateStr)
    }
    current.setDate(current.getDate() + 1)
  }
  return days
}

async function loadData() {
  loading.value = true

  const { data: { user: u } } = await supabase.auth.getUser()
  user.value = u

  const { data: s } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', u.id)
    .single()
  settings.value = s
  setSolidarite(s?.journee_solidarite)

  if (!s) {
    router.push('/settings')
    return
  }

  const { data: rttData } = await supabase
    .from('yearly_rtt')
    .select('*')
    .eq('user_id', u.id)
  yearlyRtt.value = rttData || []

  const { data: entriesData } = await supabase
    .from('time_off_entries')
    .select('*')
    .eq('user_id', u.id)
  allEntries.value = entriesData || []

  loading.value = false
}

async function submitTimeOff() {
  if (!formDateRange.value) return
  formSaving.value = true

  const range = formDateRange.value
  // range can be [Date, Date] for a range or just a Date for single day
  const startDate = Array.isArray(range) ? range[0] : range
  const endDate = Array.isArray(range) ? range[1] : range

  const workingDays = getWorkingDaysInRange(startDate, endDate)
  const duration = Number(formDuration.value)

  const existingDates = new Set(allEntries.value.map(e => e.date))
  const newDays = workingDays.filter(d => !existingDates.has(d))

  if (newDays.length > 0) {
    const rows = newDays.map(date => ({
      user_id: user.value.id,
      date,
      type: formType.value,
      status: formStatus.value,
      duration,
    }))

    await supabase.from('time_off_entries').insert(rows)

    const { data: entriesData } = await supabase
      .from('time_off_entries')
      .select('*')
      .eq('user_id', user.value.id)
    allEntries.value = entriesData || []
  }

  formDateRange.value = null
  formType.value = 'conge'
  formStatus.value = 'brouillon'
  formDuration.value = 1
  showForm.value = false
  formSaving.value = false
}

async function deleteGroup(group) {
  const ids = group.entries.map(e => e.id)
  await supabase
    .from('time_off_entries')
    .delete()
    .in('id', ids)
  allEntries.value = allEntries.value.filter(e => !ids.includes(e.id))
}

async function logout() {
  await supabase.auth.signOut()
  router.push('/login')
}

onMounted(loadData)
</script>

<template>
  <div class="dashboard" v-if="!loading">
    <header>
      <div class="header-left">
        <h1>TimeOff Planner</h1>
      </div>
      <div class="header-right">
        <button class="btn-add" @click="showForm = !showForm">
          {{ showForm ? 'Fermer' : '+ Poser un congé' }}
        </button>
        <router-link to="/settings" class="settings-link">Paramètres</router-link>
        <button class="btn-logout" @click="logout">Déconnexion</button>
      </div>
    </header>

    <!-- Form to add time off -->
    <div class="form-card" v-if="showForm">
      <h3>Poser un congé</h3>
      <div class="form-row">
        <div class="form-group date-picker-group">
          <label>Période</label>
          <VueDatePicker
            v-model="formDateRange"
            range
            :enable-time-picker="false"
            :disabled-dates="disabledDates"
            locale="fr"
            auto-apply
            :dark="true"
            placeholder="Sélectionner les dates"
            format="dd/MM/yyyy"
          />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Type</label>
          <select v-model="formType">
            <option value="conge">Congé (CP)</option>
            <option value="rtt">RTT</option>
          </select>
        </div>
        <div class="form-group">
          <label>Statut</label>
          <select v-model="formStatus">
            <option value="brouillon">Brouillon</option>
            <option value="demande">Demandé</option>
            <option value="accepte">Accepté</option>
            <option value="impose">Imposé</option>
          </select>
        </div>
        <div class="form-group" v-if="isSingleDay">
          <label>Durée</label>
          <select v-model="formDuration">
            <option :value="1">Journée entière</option>
            <option :value="0.5">Demi-journée</option>
          </select>
        </div>
      </div>
      <button class="btn-submit" @click="submitTimeOff" :disabled="formSaving || !formDateRange">
        {{ formSaving ? 'Enregistrement...' : 'Valider' }}
      </button>
    </div>

    <!-- Monthly recap table -->
    <div class="table-wrapper">
      <table class="recap-table">
        <thead>
          <tr>
            <th>Mois</th>
            <th class="th-num">Total</th>
            <th class="th-num">CP</th>
            <th class="th-num">Posés</th>
            <th class="th-num">RTT</th>
            <th class="th-num">Posés</th>
            <th>Détail</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in monthlyRecap" :key="row.label" :class="{ current: row.isCurrent }">
            <td class="month-label">{{ row.label }}</td>
            <td class="num">{{ row.total }}</td>
            <td class="num cp">{{ row.cp }}</td>
            <td class="num used">{{ row.cpUsed || '' }}</td>
            <td class="num rtt">{{ row.rtt }}</td>
            <td class="num used">{{ row.rttUsed || '' }}</td>
            <td class="detail">
              <div v-for="(group, gi) in row.groups" :key="gi" class="entry-chip">
                <span
                  class="chip"
                  :class="group.type"
                  :style="{ borderColor: statusColors[group.status] }"
                >
                  <template v-if="group.startDay === group.endDay">
                    {{ group.startDay }}
                  </template>
                  <template v-else>
                    {{ group.startDay }}&rarr;{{ group.endDay }}
                  </template>
                  {{ group.duration === 0.5 ? '½' : '' }}
                  <span class="chip-status" :style="{ color: statusColors[group.status] }">
                    {{ statusLabels[group.status]?.[0] }}
                  </span>
                </span>
                <button class="chip-delete" @click="deleteGroup(group)">&times;</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  <div v-else class="loading">Chargement...</div>
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
}

.btn-add:hover {
  background: #535bf2;
}

/* Form */
.form-card {
  background: #1a1a2e;
  border-radius: 10px;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
}

.form-card h3 {
  margin: 0 0 1rem;
  font-size: 1.1rem;
}

.form-row {
  display: flex;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.form-group {
  flex: 1;
}

.form-group label {
  display: block;
  font-size: 0.8rem;
  color: #aaa;
  margin-bottom: 0.3rem;
}

.form-group select {
  width: 100%;
  padding: 0.5rem 0.6rem;
  border: 1px solid #333;
  border-radius: 6px;
  background: #0f0f1e;
  color: #eee;
  font-size: 0.9rem;
  box-sizing: border-box;
}

.form-group select:focus {
  outline: none;
  border-color: #646cff;
}

.date-picker-group {
  flex: 2;
}

.btn-submit {
  padding: 0.5rem 1.5rem;
  border: none;
  border-radius: 6px;
  background: #646cff;
  color: #fff;
  cursor: pointer;
  font-size: 0.9rem;
  margin-top: 0.25rem;
}

.btn-submit:hover {
  background: #535bf2;
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
}

.num.cp {
  color: #8a8fff;
}

.num.rtt {
  color: #f0c078;
}

.num.used {
  color: #888;
}

.detail {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  align-items: center;
}

.entry-chip {
  display: inline-flex;
  align-items: center;
  gap: 1px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  border: 1px solid;
}

.chip.conge {
  background: rgba(100, 108, 255, 0.15);
  color: #8a8fff;
}

.chip.rtt {
  background: rgba(240, 173, 78, 0.15);
  color: #f0c078;
}

.chip-status {
  font-size: 0.65rem;
  font-weight: 700;
}

.chip-delete {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0 2px;
  line-height: 1;
}

.chip-delete:hover {
  color: #e74c3c;
}

.loading {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  color: #888;
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

  .form-card {
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
  }

  .form-card h3 {
    font-size: 1rem;
    margin-bottom: 0.75rem;
  }

  .form-row {
    flex-direction: column;
    gap: 0.5rem;
  }

  .date-picker-group {
    flex: unset;
  }

  .recap-table {
    font-size: 0.85rem;
    table-layout: auto;
  }

  .recap-table th {
    padding: 0.4rem 0.35rem;
    font-size: 0.7rem;
  }

  .recap-table th.th-num {
    width: auto;
  }

  .recap-table th:first-child {
    width: auto;
  }

  .recap-table td {
    padding: 0.4rem 0.35rem;
  }
}
</style>
