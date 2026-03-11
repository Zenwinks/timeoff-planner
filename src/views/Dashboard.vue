<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { supabase } from '../supabase'
import { useRouter } from 'vue-router'
import { setSolidarite } from '../holidays'
import { useBalance, getWorkingDaysInRange } from '../composables/useBalance'
import StatusLegend from '../components/StatusLegend.vue'
import EntryChip from '../components/EntryChip.vue'
import TimeOffForm from '../components/TimeOffForm.vue'

const router = useRouter()
const user = ref(null)
const settings = ref(null)
const yearlyRtt = ref([])
const allEntries = ref([])
const loading = ref(true)

const showForm = ref(false)
const formRef = ref(null)
const editingGroup = ref(null)

// Legend hover filter
const hoveredStatus = ref(null)
const isTouchDevice = ref(false)

const { monthlyRecap, checkNegativeBalance } = useBalance(settings, yearlyRtt, allEntries)

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

async function onFormSubmit({ dateRange, type, status, duration, editingGroup: group, forceConfirm }) {
  if (!dateRange) return

  if (!forceConfirm) {
    const { messages, blocking } = checkNegativeBalance(dateRange, type, duration, status)
    if (messages.length > 0 && formRef.value) {
      formRef.value.setWarnings(messages, blocking)
      return
    }
  }

  formRef.value?.setSaving(true)

  // If editing, delete the old entries first
  if (group) {
    const ids = group.entries.map(e => e.id)
    await supabase.from('time_off_entries').delete().in('id', ids)
    allEntries.value = allEntries.value.filter(e => !ids.includes(e.id))
  }

  const range = dateRange
  const startDate = Array.isArray(range) ? range[0] : range
  const endDate = Array.isArray(range) ? range[1] : range
  const workingDays = getWorkingDaysInRange(startDate, endDate)

  const existingDates = new Set(allEntries.value.map(e => e.date))
  const newDays = workingDays.filter(d => !existingDates.has(d))

  if (newDays.length > 0) {
    const rows = newDays.map(date => ({
      user_id: user.value.id,
      date,
      type,
      status,
      duration,
    }))

    await supabase.from('time_off_entries').insert(rows)

    const { data: entriesData } = await supabase
      .from('time_off_entries')
      .select('*')
      .eq('user_id', user.value.id)
    allEntries.value = entriesData || []
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

onMounted(() => {
  window.addEventListener('touchstart', () => { isTouchDevice.value = true }, { once: true })
  loadData()
})
</script>

<template>
  <div class="dashboard" v-if="!loading">
    <header>
      <div class="header-left">
        <h1>TimeOff Planner</h1>
      </div>
      <div class="header-right">
        <button class="btn-add" @click="() => { if (showForm) { showForm = false; editingGroup = null } else { showForm = true } }">
          {{ showForm ? 'Fermer' : '+ Poser un congé' }}
        </button>
        <router-link to="/settings" class="settings-link">Paramètres</router-link>
        <button class="btn-logout" @click="logout">Déconnexion</button>
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
      :hovered-status="hoveredStatus"
      :is-touch-device="isTouchDevice"
      @update:hovered-status="hoveredStatus = $event"
    />

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
          <template v-for="row in monthlyRecap" :key="row.label">
            <tr :class="{ current: row.isCurrent }">
              <td class="month-label">{{ row.label }}</td>
              <td class="num" :class="{ negative: row.total < 0 }">{{ row.total }}</td>
              <td class="num cp" :class="{ negative: row.cp < 0 }">{{ row.cp }}</td>
              <td class="num used">{{ row.cpUsed || '' }}</td>
              <td class="num rtt" :class="{ negative: row.rtt < 0 }">
                {{ row.rtt }}
                <span v-if="row.rttDecemberWarning" class="rtt-warn">⚠</span>
              </td>
              <td class="num used">{{ row.rttUsed || '' }}</td>
              <td class="detail">
                <EntryChip
                  v-for="(group, gi) in row.groups"
                  :key="gi"
                  :group="group"
                  :dimmed="!!hoveredStatus && hoveredStatus !== group.status"
                  @delete="deleteGroup"
                  @edit="onEditGroup"
                />
              </td>
            </tr>
            <tr v-if="row.rttDecemberWarning" class="rtt-warn-row">
              <td colspan="7" class="rtt-warn-cell">
                ⚠ Il vous reste {{ row.rtt }} RTT — pensez à les poser avant le 31 décembre. Seules les décimales seront reportées en janvier.
              </td>
            </tr>
          </template>
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

.detail {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  align-items: center;
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
