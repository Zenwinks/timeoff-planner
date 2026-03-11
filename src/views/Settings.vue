<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../supabase'
import { useRouter } from 'vue-router'
import { HOLIDAY_KEYS } from '../holidays'

const router = useRouter()
const loading = ref(true)
const saving = ref(false)
const isNew = ref(false)
const userId = ref(null)

const form = ref({
  start_year: new Date().getFullYear(),
  initial_conges: 25,
  initial_rtt: 0,
  conges_increment_per_month: 2.08,
  journee_solidarite: null,
})

const yearlyRtt = ref([])
const newRttYear = ref(new Date().getFullYear())
const newRttCount = ref(9)

const newRttYearError = computed(() => {
  if (newRttYear.value < form.value.start_year) return `L'année doit être ≥ ${form.value.start_year}`
  if (yearlyRtt.value.find(r => r.year === newRttYear.value)) return 'Cette année est déjà configurée'
  return null
})

onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser()
  userId.value = user.id

  const { data } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (data) {
    form.value = {
      start_year: data.start_year,
      initial_conges: data.initial_conges,
      initial_rtt: data.initial_rtt,
      conges_increment_per_month: data.conges_increment_per_month,
      journee_solidarite: data.journee_solidarite || null,
    }
    newRttYear.value = data.start_year
  } else {
    isNew.value = true
  }

  const { data: rttData } = await supabase
    .from('yearly_rtt')
    .select('*')
    .eq('user_id', user.id)
    .order('year')

  yearlyRtt.value = rttData || []

  if (rttData && rttData.length > 0) {
    newRttYear.value = rttData[rttData.length - 1].year + 1
  }

  loading.value = false
})

async function addRttYear() {
  if (newRttYearError.value) return

  const { data, error } = await supabase
    .from('yearly_rtt')
    .insert({ user_id: userId.value, year: newRttYear.value, rtt_count: newRttCount.value })
    .select()
    .single()

  if (data) {
    yearlyRtt.value.push(data)
    yearlyRtt.value.sort((a, b) => a.year - b.year)
    newRttYear.value++
  }
}

async function updateRttYear(item) {
  await supabase
    .from('yearly_rtt')
    .update({ rtt_count: item.rtt_count })
    .eq('id', item.id)
}

async function removeRttYear(item) {
  await supabase
    .from('yearly_rtt')
    .delete()
    .eq('id', item.id)
  yearlyRtt.value = yearlyRtt.value.filter(r => r.id !== item.id)
}

async function save() {
  saving.value = true

  if (isNew.value) {
    await supabase
      .from('user_settings')
      .insert({ user_id: userId.value, ...form.value })
  } else {
    await supabase
      .from('user_settings')
      .update(form.value)
      .eq('user_id', userId.value)
  }

  saving.value = false
  router.push('/')
}
</script>

<template>
  <div class="settings" v-if="!loading">
    <div class="settings-card">
      <h1>Paramètres</h1>
      <p class="subtitle">Configurez votre période de référence et vos soldes initiaux</p>

      <form @submit.prevent="save">
        <div class="form-group">
          <label>Année de départ</label>
          <input type="number" v-model.number="form.start_year" :min="new Date().getFullYear() - 2" :max="new Date().getFullYear() + 2" />
          <small class="hint">Le calcul démarre en janvier de cette année</small>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Congés initiaux</label>
            <input type="number" v-model.number="form.initial_conges" step="0.01" min="0" />
            <small class="hint">Solde CP reporté depuis l'année N-1</small>
          </div>
          <div class="form-group">
            <label>RTT initiaux</label>
            <input type="number" v-model.number="form.initial_rtt" step="0.01" min="0" />
            <small class="hint">Solde RTT reporté depuis l'année N-1 (décimales uniquement)</small>
          </div>
        </div>

        <div class="form-group">
          <label>Incrément congés / mois</label>
          <input type="number" v-model.number="form.conges_increment_per_month" step="0.01" min="0" />
          <small class="hint">Par défaut 2.08 (≈ 25 jours / 12 mois)</small>
        </div>

        <div class="form-group">
          <label>Journée de solidarité</label>
          <select v-model="form.journee_solidarite">
            <option :value="null">Aucune</option>
            <option v-for="h in HOLIDAY_KEYS" :key="h.key" :value="h.key">
              {{ h.label }}
            </option>
          </select>
          <small class="hint">Ce jour férié sera travaillé et compté comme jour ouvré</small>
        </div>

        <div class="section-title">RTT par année</div>
        <div class="rtt-list">
          <div v-for="item in yearlyRtt" :key="item.id" class="rtt-row">
            <span class="rtt-year">{{ item.year }}</span>
            <input
              type="number"
              v-model.number="item.rtt_count"
              step="0.01"
              min="0"
              class="rtt-input"
              @change="updateRttYear(item)"
            />
            <button type="button" class="btn-remove" @click="removeRttYear(item)">&times;</button>
          </div>
          <div v-if="yearlyRtt.length === 0" class="rtt-empty">Aucune année configurée</div>
        </div>
        <div class="rtt-add">
          <input type="number" v-model.number="newRttYear" :min="form.start_year" class="rtt-year-input" :class="{ 'input-error': newRttYearError }" />
          <input type="number" v-model.number="newRttCount" step="0.01" min="0" class="rtt-input" />
          <button type="button" class="btn-add" @click="addRttYear" :disabled="!!newRttYearError">+ Ajouter</button>
        </div>
        <p v-if="newRttYearError" class="rtt-year-error">{{ newRttYearError }}</p>

        <div class="form-actions">
          <router-link to="/" class="btn-cancel" v-if="!isNew">Annuler</router-link>
          <button type="submit" class="btn-save" :disabled="saving">
            {{ saving ? 'Enregistrement...' : 'Enregistrer' }}
          </button>
        </div>
      </form>
    </div>
  </div>
  <div v-else class="loading">Chargement...</div>
</template>

<style scoped>
.settings {
  display: flex;
  justify-content: center;
  padding: 2rem 1rem;
}

.settings-card {
  background: #1a1a2e;
  border-radius: 12px;
  padding: 2rem;
  width: 100%;
  max-width: 500px;
}

h1 {
  margin: 0 0 0.25rem;
}

.subtitle {
  color: #888;
  margin: 0 0 1.5rem;
  font-size: 0.9rem;
}

.form-row {
  display: flex;
  gap: 1rem;
}

.form-group {
  flex: 1;
  margin-bottom: 1.25rem;
}

label {
  display: block;
  font-size: 0.85rem;
  color: #aaa;
  margin-bottom: 0.4rem;
}

input, select {
  width: 100%;
  padding: 0.6rem 0.75rem;
  border: 1px solid #333;
  border-radius: 6px;
  background: #0f0f1e;
  color: #eee;
  font-size: 0.95rem;
  box-sizing: border-box;
}

input:focus, select:focus {
  outline: none;
  border-color: #646cff;
}

.hint {
  display: block;
  color: #666;
  margin-top: 0.3rem;
  font-size: 0.8rem;
}

.section-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #ccc;
  margin-bottom: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid #2a2a40;
}

.rtt-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.rtt-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.rtt-year {
  font-weight: 600;
  min-width: 50px;
}

.rtt-input {
  width: 100px !important;
  flex: none;
}

.rtt-year-input {
  width: 80px !important;
  flex: none;
}

.rtt-empty {
  color: #666;
  font-size: 0.85rem;
  font-style: italic;
}

.input-error {
  border-color: #e74c3c !important;
}

.rtt-year-error {
  color: #e74c3c;
  font-size: 0.8rem;
  margin: -0.25rem 0 0.75rem;
}

.btn-add:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.rtt-add {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.btn-add {
  padding: 0.5rem 1rem;
  border: 1px solid #646cff;
  border-radius: 6px;
  background: transparent;
  color: #646cff;
  cursor: pointer;
  font-size: 0.85rem;
  white-space: nowrap;
}

.btn-add:hover {
  background: #646cff;
  color: #fff;
}

.btn-remove {
  padding: 0.3rem 0.6rem;
  border: 1px solid #e74c3c;
  border-radius: 6px;
  background: transparent;
  color: #e74c3c;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
}

.btn-remove:hover {
  background: #e74c3c;
  color: #fff;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1rem;
}

.btn-save {
  padding: 0.6rem 1.5rem;
  border: none;
  border-radius: 6px;
  background: #646cff;
  color: #fff;
  font-size: 0.95rem;
  cursor: pointer;
}

.btn-save:hover {
  background: #535bf2;
}

.btn-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-cancel {
  padding: 0.6rem 1.5rem;
  border: 1px solid #444;
  border-radius: 6px;
  color: #ccc;
  text-decoration: none;
  font-size: 0.95rem;
}

.btn-cancel:hover {
  border-color: #666;
}

.loading {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  color: #888;
}

@media (max-width: 480px) {
  .settings {
    padding: 1rem 0.5rem;
  }

  .settings-card {
    padding: 1.25rem;
    border-radius: 10px;
  }

  h1 {
    font-size: 1.3rem;
  }

  .subtitle {
    font-size: 0.8rem;
    margin-bottom: 1rem;
  }

  .form-row {
    flex-direction: column;
    gap: 0;
  }

  .rtt-add {
    flex-wrap: wrap;
  }

  .rtt-year-input {
    width: 70px !important;
  }

  .rtt-input {
    width: 80px !important;
  }

  .btn-add {
    font-size: 0.8rem;
    padding: 0.45rem 0.75rem;
  }

  .form-actions {
    flex-direction: column;
  }

  .btn-save,
  .btn-cancel {
    width: 100%;
    text-align: center;
  }
}
</style>
