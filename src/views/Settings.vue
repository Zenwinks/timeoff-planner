<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, getCurrentUser } from '../api'
import AppFooter from '../components/AppFooter.vue'
import AppHeader from '../components/AppHeader.vue'
import AppIcon from '../components/AppIcon.vue'
import SegmentedControl from '../components/SegmentedControl.vue'
import { themeChoice } from '../composables/useTheme'
import { showToast } from '../composables/useToasts'
import { balanceYears, forfaitRtt } from '../contract'
import { formatDays } from '../format'
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
  contrat: 'horaire',
  forfait_jours: null,
  rtt_mode: 'annuel',
  solidarite_rtt: false,
})

// Les RTT par année se modifient ici et s'enregistrent avec le reste, d'un seul
// coup : « Annuler » n'a rien à défaire. Au contrat horaire, ce sont ceux saisis ;
// au forfait, les seules années corrigées à la main.
const yearlyRtt = ref([])
const newRttYear = ref(new Date().getFullYear())
const newRttCount = ref(9)

// ── Le contrat ──
const contractOptions = [{ value: 'horaire', label: 'Horaire' }, { value: 'forfait_jours', label: 'Forfait jours' }]
const isForfait = computed(() => form.value.contrat === 'forfait_jours')
const hasRtt = computed(() => isForfait.value || form.value.rtt_mode !== 'aucun')
const rttModeOptions = computed(() => [
  { value: 'annuel', label: 'Au 1er janvier' },
  { value: 'mensuel', label: 'Au fil des mois' },
  ...(isForfait.value ? [] : [{ value: 'aucun', label: 'Pas de RTT' }]),
])
const rttModeHints = {
  annuel: 'Les RTT de l’année arrivent d’un coup, en janvier.',
  mensuel: 'Chaque mois apporte un douzième des RTT de l’année.',
  aucun: 'L’app ne montre que vos CP.',
}
const solidarityOptions = [{ value: false, label: 'Travaillée' }, { value: true, label: 'Retirée des RTT' }]

// Changer de contrat garde ce que l'on avait saisi pour l'autre : revenu à
// l'horaire, on retrouve ses RTT ; revenu au forfait, ses années corrigées.
// Passé au forfait pour la première fois, les RTT se calculent tous ;
// revenu à l'horaire sans rien de saisi, on part de ceux du forfait.
const stashedRtt = {}
function setContract(contrat) {
  const from = form.value.contrat
  if (contrat === from) return
  stashedRtt[from] = yearlyRtt.value
  const forfaitValues = forfaitYears.value.map(y => ({ year: y.year, rtt_count: y.rtt }))
  form.value.contrat = contrat
  if (contrat === 'forfait_jours') {
    form.value.forfait_jours ??= 218
    if (form.value.rtt_mode === 'aucun') form.value.rtt_mode = 'annuel'
  }
  yearlyRtt.value = stashedRtt[contrat] ?? (contrat === 'forfait_jours' ? [] : forfaitValues)
}

// Au forfait, les RTT de chaque année : ceux que donne le calcul, ou la valeur
// corrigée à la main (que l'on peut toujours ramener au calcul).
const forfaitYears = computed(() => {
  if (!isForfait.value || !(form.value.forfait_jours > 0)) return []
  return balanceYears(form.value).map(year => {
    const computedRtt = forfaitRtt(form.value, year)
    const set = yearlyRtt.value.find(r => r.year === year)
    return { ...computedRtt, auto: computedRtt.rtt, rtt: set ? set.rtt_count : computedRtt.rtt, edited: !!set }
  })
})

function setForfaitRtt(year, value) {
  const others = yearlyRtt.value.filter(r => r.year !== year)
  const auto = forfaitYears.value.find(y => y.year === year)?.auto
  yearlyRtt.value = value === auto ? others : [...others, { year, rtt_count: value }].sort((a, b) => a.year - b.year)
}

function resetForfaitRtt(year) {
  yearlyRtt.value = yearlyRtt.value.filter(r => r.year !== year)
}

const newRttYearError = computed(() => {
  if (newRttYear.value < form.value.start_year) return `L'année doit être ≥ ${form.value.start_year}`
  if (yearlyRtt.value.find(r => r.year === newRttYear.value)) return 'Cette année est déjà configurée'
  return null
})

// L'agenda : le fichier à importer, et le lien d'abonnement. La base n'en garde
// que l'empreinte : son adresse ne se montre qu'une fois, juste après sa création.
const feedActive = ref(false)
const feedUrl = ref(null)
const feedBusy = ref(false)
const feedError = ref(null)
const webcalUrl = computed(() => feedUrl.value?.replace(/^https?:/, 'webcal:'))

async function createFeed() {
  feedBusy.value = true
  feedError.value = null
  try {
    feedUrl.value = (await api.createCalendarFeed()).url
    feedActive.value = true
  } catch (error) {
    feedError.value = `Lien impossible à créer : ${error.message}`
  } finally {
    feedBusy.value = false
  }
}

async function disableFeed() {
  feedBusy.value = true
  feedError.value = null
  try {
    await api.deleteCalendarFeed()
    feedActive.value = false
    feedUrl.value = null
    showToast({ message: 'Lien d’agenda désactivé.' })
  } catch (error) {
    feedError.value = `Désactivation impossible : ${error.message}`
  } finally {
    feedBusy.value = false
  }
}

async function copyFeed() {
  try {
    await navigator.clipboard.writeText(feedUrl.value)
    showToast({ message: 'Lien copié.' })
  } catch {
    showToast({ message: 'Copie impossible : sélectionnez le lien pour le copier.', tone: 'error' })
  }
}

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
    const [user, data, rttData, feed] = await Promise.all([getCurrentUser(), api.getSettings(), api.listYearlyRtt(), api.getCalendarFeed()])
    userEmail.value = user?.email ?? ''
    feedActive.value = feed.active

    if (data) {
      form.value = {
        start_year: data.start_year,
        initial_conges: data.initial_conges,
        initial_rtt: data.initial_rtt,
        conges_increment_per_month: data.conges_increment_per_month,
        journee_solidarite: data.journee_solidarite || null,
        contrat: data.contrat ?? 'horaire',
        forfait_jours: data.forfait_jours ?? null,
        rtt_mode: data.rtt_mode ?? 'annuel',
        solidarite_rtt: !!data.solidarite_rtt,
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
    ...(isForfait.value ? [['Jours à travailler par an', form.value.forfait_jours]] : []),
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
  if (isForfait.value && !(Number.isInteger(form.value.forfait_jours) && form.value.forfait_jours >= 1 && form.value.forfait_jours <= 366)) {
    saveError.value = '« Jours à travailler par an » doit être un nombre entier de jours, entre 1 et 366.'
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
        <section class="card section" aria-labelledby="section-contract">
          <h2 id="section-contract">Contrat</h2>
          <div class="field">
            <span class="field-label">Type de contrat</span>
            <SegmentedControl :model-value="form.contrat" :options="contractOptions" label="Type de contrat" @update:model-value="setContract" />
            <span class="field-hint">
              {{ isForfait
                ? 'Au forfait jours, l’app calcule vos RTT d’après les jours à travailler, et compte vos jours travaillés.'
                : 'Au contrat horaire, vos RTT, si vous en avez, se saisissent année par année.' }}
            </span>
          </div>
          <div v-if="isForfait" class="field">
            <label class="field-label" for="settings-forfait">Jours à travailler par an</label>
            <input id="settings-forfait" v-model.number="form.forfait_jours" class="input forfait-input" type="number" step="1" min="1" max="366" />
            <span class="field-hint">Ceux de votre contrat, journée de solidarité comprise : 218 le plus souvent.</span>
          </div>
          <div class="field">
            <label class="field-label" for="settings-solidarite">Journée de solidarité</label>
            <select id="settings-solidarite" v-model="form.journee_solidarite" class="select">
              <option :value="null">Aucune</option>
              <option v-for="h in HOLIDAY_KEYS" :key="h.key" :value="h.key">{{ h.label }}</option>
            </select>
            <span v-if="!isForfait || !form.journee_solidarite" class="field-hint">Ce jour férié est travaillé : il compte comme un jour ouvré.</span>
          </div>
          <div v-if="isForfait && form.journee_solidarite" class="field">
            <span class="field-label">Cette journée est…</span>
            <SegmentedControl v-model="form.solidarite_rtt" :options="solidarityOptions" label="La journée de solidarité" />
            <span class="field-hint">
              {{ form.solidarite_rtt
                ? 'Retirée des RTT : ce jour férié reste chômé, et l’année compte un RTT de moins.'
                : 'Travaillée : ce jour férié compte comme un jour ouvré.' }}
            </span>
          </div>
        </section>

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
            <div v-if="hasRtt" class="field">
              <label class="field-label" for="settings-initial-rtt">RTT initiaux</label>
              <input id="settings-initial-rtt" v-model.number="form.initial_rtt" class="input" type="number" step="0.01" min="0" />
              <span class="field-hint">Solde RTT reporté : seules les décimales passent d’une année à l’autre.</span>
            </div>
          </div>
        </section>

        <section class="card section" aria-labelledby="section-rtt">
          <h2 id="section-rtt">RTT</h2>
          <div class="field">
            <span class="field-label">Acquisition</span>
            <SegmentedControl v-model="form.rtt_mode" :options="rttModeOptions" label="Acquisition des RTT" />
            <span class="field-hint">{{ rttModeHints[form.rtt_mode] }}</span>
          </div>

          <template v-if="isForfait">
            <p class="section-hint">
              Les RTT de chaque année, calculés d’après le forfait. Corrigez une année si votre entreprise en compte autrement.
            </p>
            <ul v-if="forfaitYears.length" class="rtt-list">
              <li v-for="y in forfaitYears" :key="y.year" class="rtt-row">
                <span class="rtt-year num">{{ y.year }}</span>
                <input
                  :value="y.rtt"
                  class="input rtt-input"
                  type="number"
                  step="0.5"
                  min="0"
                  :aria-label="`RTT ${y.year}`"
                  @input="setForfaitRtt(y.year, $event.target.valueAsNumber)"
                />
                <span class="rtt-auto num">
                  <template v-if="y.edited">Corrigé · calcul : {{ formatDays(y.auto) }}</template>
                  <template v-else>{{ y.working }} jours ouvrés − {{ y.cp }} CP − {{ y.forfait }}</template>
                </span>
                <button
                  v-if="y.edited"
                  type="button"
                  class="btn btn-ghost btn-icon"
                  :aria-label="`Revenir au calcul pour ${y.year}`"
                  :title="`Revenir au calcul pour ${y.year}`"
                  @click="resetForfaitRtt(y.year)"
                >
                  <AppIcon name="undo" :size="18" />
                </button>
              </li>
            </ul>
          </template>

          <template v-else-if="hasRtt">
            <p class="section-hint">Les RTT accordés chaque année.</p>
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
          </template>
        </section>

        <div class="form-actions">
          <p v-if="saveError" class="error-text" role="alert">{{ saveError }}</p>
          <router-link v-if="!isNew" to="/" class="btn btn-secondary">Annuler</router-link>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? 'Enregistrement…' : isNew ? 'Commencer' : 'Enregistrer' }}
          </button>
        </div>
      </form>

      <section class="card section" aria-labelledby="section-calendar">
        <h2 id="section-calendar">Agenda</h2>
        <p class="section-hint">Vos congés dans Google Agenda, Outlook ou l’agenda de votre téléphone.</p>

        <div class="calendar-option">
          <div>
            <h3>Une fois</h3>
            <p class="field-hint">Un fichier à importer : l’agenda ne le relit pas ensuite.</p>
          </div>
          <a class="btn btn-secondary" href="/api/calendar.ics" download>
            <AppIcon name="calendar" :size="18" />
            Télécharger le fichier .ics
          </a>
        </div>

        <div class="calendar-option feed">
          <div>
            <h3>Abonnement</h3>
            <p class="field-hint">Un lien privé, que l’agenda relit de lui-même : un congé accepté y passe de provisoire à confirmé.</p>
          </div>
          <div v-if="feedUrl" class="feed-new">
            <p>Voici votre lien. Il ne s’affiche qu’une fois : copiez-le maintenant.</p>
            <input class="input" readonly :value="feedUrl" aria-label="Lien d’abonnement" @focus="$event.target.select()" />
            <div class="feed-actions">
              <button type="button" class="btn btn-primary" @click="copyFeed">Copier le lien</button>
              <a class="btn btn-secondary" :href="webcalUrl">Ouvrir dans l’agenda</a>
            </div>
            <p class="field-hint">Google Agenda : « Autres agendas », « + », puis « À partir de l’URL », et collez le lien.</p>
          </div>
          <p v-else-if="feedActive" class="field-hint">Un lien est actif. Perdu ? Créez-en un nouveau : l’ancien cessera de fonctionner.</p>
          <p class="field-hint">Quiconque a ce lien voit vos congés : ne le partagez pas.</p>
          <div class="feed-actions">
            <button type="button" class="btn" :class="feedActive ? 'btn-secondary' : 'btn-primary'" :disabled="feedBusy" @click="createFeed">
              {{ feedActive ? 'Créer un nouveau lien' : 'Créer le lien d’abonnement' }}
            </button>
            <button v-if="feedActive" type="button" class="btn btn-danger-ghost" :disabled="feedBusy" @click="disableFeed">Désactiver le lien</button>
          </div>
          <p v-if="feedError" class="error-text">{{ feedError }}</p>
        </div>
      </section>

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
    <AppFooter />
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

.rtt-row {
  flex-wrap: wrap;
}

/* Au forfait : d'où vient le nombre, ou qu'il a été corrigé. */
.rtt-auto {
  flex: 1 1 12rem;
  font-size: 0.8rem;
  color: var(--text-subtle);
}

.forfait-input {
  max-width: 9rem;
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

.calendar-option {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1rem;
}

.calendar-option.feed {
  flex-direction: column;
  align-items: stretch;
  padding-top: 0.9rem;
  border-top: 1px solid var(--border);
}

.calendar-option h3 {
  font-size: 0.95rem;
  font-weight: 700;
}

.feed-new {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--focus);
  border-radius: var(--radius);
  background: var(--primary-soft);
}

.feed-new .input {
  font-size: 0.85rem;
}

.feed-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
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
