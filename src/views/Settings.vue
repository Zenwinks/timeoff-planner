<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, getCurrentUser } from '../api'
import AppHeader from '../components/AppHeader.vue'
import AppIcon from '../components/AppIcon.vue'
import SegmentedControl from '../components/SegmentedControl.vue'
import { themeChoice } from '../composables/useTheme'
import { HOLIDAY_KEYS } from '../holidays'

const router = useRouter()
const loading = ref(true)
const loadError = ref(null)
const saving = ref(false)
const isNew = ref(false)
const saveError = ref(null)
const userEmail = ref('')
const confirmingDelete = ref(false)
const deleting = ref(false)
const deleteError = ref(null)

const form = ref({
  start_year: new Date().getFullYear(),
  initial_conges: 25,
  initial_rtt: 0,
  conges_increment_per_month: 2.08,
  journee_solidarite: null,
})

// Les RTT par année se modifient ici et s'enregistrent avec le reste, d'un seul
// coup : « Annuler » n'a rien à défaire.
const yearlyRtt = ref([])
const newRttYear = ref(new Date().getFullYear())
const newRttCount = ref(9)

const newRttYearError = computed(() => {
  if (newRttYear.value < form.value.start_year) return `L'année doit être ≥ ${form.value.start_year}`
  if (yearlyRtt.value.find(r => r.year === newRttYear.value)) return 'Cette année est déjà configurée'
  return null
})

// L'apparence vaut pour cet appareil, tout de suite : rien à enregistrer.
const themeOptions = [
  { value: 'system', label: 'Système', icon: 'monitor' },
  { value: 'light', label: 'Clair', icon: 'sun' },
  { value: 'dark', label: 'Sombre', icon: 'moon' },
]

async function load() {
  loading.value = true
  loadError.value = null

  try {
    const [user, data, rttData] = await Promise.all([getCurrentUser(), api.getSettings(), api.listYearlyRtt()])
    userEmail.value = user?.email ?? ''

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

    yearlyRtt.value = rttData.map(({ year, rtt_count }) => ({ year, rtt_count }))
    if (rttData.length > 0) {
      newRttYear.value = rttData[rttData.length - 1].year + 1
    }

    loading.value = false
  } catch (error) {
    loadError.value = error.message
  }
}

onMounted(load)

function addRttYear() {
  if (newRttYearError.value) return
  yearlyRtt.value = [...yearlyRtt.value, { year: newRttYear.value, rtt_count: newRttCount.value }]
    .sort((a, b) => a.year - b.year)
  newRttYear.value++
}

function removeRttYear(item) {
  yearlyRtt.value = yearlyRtt.value.filter(r => r.year !== item.year)
}

// Un champ vidé vaut '' : mieux vaut le dire ici qu'avec le message technique du serveur.
function invalidField() {
  const isNumber = value => typeof value === 'number' && Number.isFinite(value)
  return [
    ['Année de départ', form.value.start_year],
    ['Congés initiaux', form.value.initial_conges],
    ['RTT initiaux', form.value.initial_rtt],
    ['Acquisition par mois', form.value.conges_increment_per_month],
    ...yearlyRtt.value.map(r => [`RTT ${r.year}`, r.rtt_count]),
  ].find(([, value]) => !isNumber(value))?.[0] ?? null
}

async function save() {
  saveError.value = null
  const invalid = invalidField()
  if (invalid) {
    saveError.value = `« ${invalid} » doit être un nombre.`
    return
  }

  saving.value = true
  try {
    // Paramètres et RTT par année ensemble : le serveur enregistre tout ou rien.
    await api.saveSettings({ ...form.value, yearly_rtt: yearlyRtt.value })
  } catch (error) {
    saveError.value = `Enregistrement impossible : ${error.message}`
    saving.value = false
    return
  }

  saving.value = false
  router.push('/')
}

async function logout() {
  await api.logout()
  router.push('/login')
}

async function deleteAccount() {
  deleting.value = true
  deleteError.value = null
  try {
    await api.deleteAccount()
    router.push('/login')
  } catch (error) {
    deleteError.value = `Suppression impossible : ${error.message}`
    deleting.value = false
  }
}
</script>

<template>
  <AppHeader />

  <main class="page">
    <div v-if="loadError" class="state">
      <p>Impossible de charger vos paramètres.</p>
      <p class="state-detail">{{ loadError }}</p>
      <button type="button" class="btn btn-primary" @click="load">Réessayer</button>
    </div>
    <div v-else-if="loading" class="state" aria-busy="true">Chargement…</div>

    <template v-else>
      <div class="page-title">
        <router-link v-if="!isNew" to="/" class="back">
          <AppIcon name="chevron-left" :size="18" />
          Tableau de bord
        </router-link>
        <h1>{{ isNew ? 'Bienvenue !' : 'Paramètres' }}</h1>
        <p v-if="isNew" class="intro">Indiquez vos soldes de départ : l’app calcule ensuite vos soldes mois par mois.</p>
      </div>

      <form class="settings-form" @submit.prevent="save">
        <section class="card section" aria-labelledby="section-balances">
          <h2 id="section-balances">Soldes de départ</h2>
          <div class="grid">
            <div class="field">
              <label class="field-label" for="settings-start-year">Année de départ</label>
              <input id="settings-start-year" v-model.number="form.start_year" class="input" type="number" :min="new Date().getFullYear() - 2" :max="new Date().getFullYear() + 2" />
              <span class="field-hint">Le calcul démarre en janvier de cette année.</span>
            </div>
            <div class="field">
              <label class="field-label" for="settings-increment">Acquisition par mois</label>
              <input id="settings-increment" v-model.number="form.conges_increment_per_month" class="input" type="number" step="0.01" min="0" />
              <span class="field-hint">CP acquis chaque mois. Par défaut 2,08 (25 jours par an).</span>
            </div>
            <div class="field">
              <label class="field-label" for="settings-initial-conges">Congés initiaux</label>
              <input id="settings-initial-conges" v-model.number="form.initial_conges" class="input" type="number" step="0.01" min="0" />
              <span class="field-hint">Solde CP reporté de l’année précédente.</span>
            </div>
            <div class="field">
              <label class="field-label" for="settings-initial-rtt">RTT initiaux</label>
              <input id="settings-initial-rtt" v-model.number="form.initial_rtt" class="input" type="number" step="0.01" min="0" />
              <span class="field-hint">Solde RTT reporté : seules les décimales passent d’une année à l’autre.</span>
            </div>
          </div>
        </section>

        <section class="card section" aria-labelledby="section-rtt">
          <h2 id="section-rtt">RTT par année</h2>
          <p class="section-hint">Les RTT accordés chaque année, ajoutés au solde en janvier.</p>
          <ul v-if="yearlyRtt.length" class="rtt-list">
            <li v-for="item in yearlyRtt" :key="item.year" class="rtt-row">
              <span class="rtt-year num">{{ item.year }}</span>
              <input v-model.number="item.rtt_count" class="input rtt-input" type="number" step="0.01" min="0" :aria-label="`RTT ${item.year}`" />
              <button type="button" class="btn btn-ghost btn-icon" :aria-label="`Retirer ${item.year}`" :title="`Retirer ${item.year}`" @click="removeRttYear(item)">
                <AppIcon name="trash" :size="18" />
              </button>
            </li>
          </ul>
          <p v-else class="section-hint">Aucune année configurée.</p>
          <div class="rtt-add">
            <input v-model.number="newRttYear" class="input rtt-year-input" :class="{ invalid: newRttYearError }" type="number" :min="form.start_year" aria-label="Nouvelle année" />
            <input v-model.number="newRttCount" class="input rtt-input" type="number" step="0.01" min="0" aria-label="RTT de la nouvelle année" />
            <button type="button" class="btn btn-secondary" :disabled="!!newRttYearError" @click="addRttYear">
              <AppIcon name="plus" :size="18" />
              Ajouter
            </button>
          </div>
          <p v-if="newRttYearError" class="error-text">{{ newRttYearError }}</p>
        </section>

        <section class="card section" aria-labelledby="section-holidays">
          <h2 id="section-holidays">Jours fériés</h2>
          <div class="field">
            <label class="field-label" for="settings-solidarite">Journée de solidarité</label>
            <select id="settings-solidarite" v-model="form.journee_solidarite" class="select">
              <option :value="null">Aucune</option>
              <option v-for="h in HOLIDAY_KEYS" :key="h.key" :value="h.key">{{ h.label }}</option>
            </select>
            <span class="field-hint">Ce jour férié est travaillé : il compte comme un jour ouvré.</span>
          </div>
        </section>

        <div class="form-actions">
          <p v-if="saveError" class="error-text" role="alert">{{ saveError }}</p>
          <router-link v-if="!isNew" to="/" class="btn btn-secondary">Annuler</router-link>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? 'Enregistrement…' : isNew ? 'Commencer' : 'Enregistrer' }}
          </button>
        </div>
      </form>

      <section class="card section" aria-labelledby="section-theme">
        <h2 id="section-theme">Apparence</h2>
        <p class="section-hint">Sur cet appareil. « Système » suit le réglage clair ou sombre de l’appareil.</p>
        <SegmentedControl v-model="themeChoice" class="wide" :options="themeOptions" label="Thème" />
      </section>

      <section class="card section" aria-labelledby="section-account">
        <h2 id="section-account">Compte</h2>
        <p v-if="userEmail" class="account-email">Connecté avec {{ userEmail }}</p>
        <div class="account-actions">
          <button type="button" class="btn btn-secondary" @click="logout">
            <AppIcon name="logout" :size="18" />
            Se déconnecter
          </button>
          <router-link to="/confidentialite" class="account-link">Vos données personnelles</router-link>
        </div>

        <div class="danger-zone">
          <button v-if="!confirmingDelete" type="button" class="btn btn-danger-ghost" @click="confirmingDelete = true">
            <AppIcon name="trash" :size="18" />
            Supprimer mon compte
          </button>
          <div v-else class="delete-confirm">
            <p>Votre compte, vos paramètres et tous vos congés et RTT seront effacés définitivement. Ce n’est pas réversible.</p>
            <p v-if="deleteError" class="error-text">{{ deleteError }}</p>
            <div class="delete-actions">
              <button type="button" class="btn btn-secondary" :disabled="deleting" @click="confirmingDelete = false">Annuler</button>
              <button type="button" class="btn btn-danger" :disabled="deleting" @click="deleteAccount">
                {{ deleting ? 'Suppression…' : 'Supprimer définitivement' }}
              </button>
            </div>
          </div>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 720px;
  margin: 0 auto;
  padding: 1rem 1rem 2.5rem;
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

.page-title {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.25rem;
}

.page-title h1 {
  font-size: 1.6rem;
  font-weight: 750;
  letter-spacing: -0.01em;
}

.intro {
  color: var(--text-muted);
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  align-self: flex-start;
  font-size: 0.9rem;
  font-weight: 600;
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 1.1rem 1.25rem 1.25rem;
}

.section h2 {
  font-size: 1.05rem;
  font-weight: 700;
}

.section-hint {
  margin-top: -0.55rem;
  font-size: 0.85rem;
  color: var(--text-subtle);
}

.grid {
  display: grid;
  gap: 1rem;
}

@media (min-width: 600px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.rtt-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  list-style: none;
}

.rtt-row,
.rtt-add {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.rtt-year {
  min-width: 3.5rem;
  font-weight: 700;
}

.rtt-input {
  width: 7rem;
}

.rtt-year-input {
  width: 6.5rem;
}

/* Sur un téléphone, les deux champs se partagent la place laissée par le bouton. */
@media (max-width: 519px) {
  .rtt-add .input {
    flex: 1 1 0;
    min-width: 0;
    width: auto;
  }

  .rtt-add .btn {
    flex-shrink: 0;
  }
}

.error-text {
  font-size: 0.85rem;
  color: var(--danger);
}

/* Les boutons d'enregistrement : collés en bas de l'écran sur mobile, pour
   rester à portée après avoir fait défiler les sections. */
.form-actions {
  position: sticky;
  bottom: 0;
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.6rem;
  margin: 0 -1rem;
  padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom));
  background: color-mix(in srgb, var(--bg) 90%, transparent);
  backdrop-filter: blur(8px);
  border-top: 1px solid var(--border);
}

.form-actions .error-text {
  flex-basis: 100%;
  text-align: right;
}

@media (min-width: 760px) {
  .form-actions {
    position: static;
    margin: 0;
    padding: 0;
    background: none;
    backdrop-filter: none;
    border-top: none;
  }
}

.account-email {
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

.account-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1.25rem;
}

.account-link {
  font-weight: 600;
}

.danger-zone {
  padding-top: 0.9rem;
  border-top: 1px solid var(--border);
}

.delete-confirm {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid var(--danger);
  border-radius: var(--radius);
  background: var(--danger-soft);
  font-size: 0.9rem;
}

.delete-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.6rem;
}
</style>
