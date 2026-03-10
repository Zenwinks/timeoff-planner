<script setup>
import { ref, computed } from 'vue'
import VueDatePicker from '@vuepic/vue-datepicker'
import '@vuepic/vue-datepicker/dist/main.css'
import { isHolidayDate } from '../holidays'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['submit', 'update:modelValue'])

const formDateRange = ref(null)
const formType = ref('conge')
const formStatus = ref('brouillon')
const formDuration = ref(1)
const formSaving = ref(false)
const showWarning = ref(false)
const warningMessages = ref([])

const isSingleDay = computed(() => {
  if (!formDateRange.value) return false
  const range = formDateRange.value
  if (!Array.isArray(range)) return true
  const start = range[0]
  const end = range[1]
  if (!start || !end) return true
  return start.getTime() === end.getTime()
})

function disabledDates(date) {
  const day = date.getDay()
  return day === 0 || day === 6 || isHolidayDate(date)
}

function onSubmit() {
  emit('submit', {
    dateRange: formDateRange.value,
    type: formType.value,
    status: formStatus.value,
    duration: Number(formDuration.value),
  })
}

function setWarnings(warnings) {
  warningMessages.value = warnings
  showWarning.value = true
}

function cancelWarning() {
  showWarning.value = false
  warningMessages.value = []
}

function setSaving(val) {
  formSaving.value = val
}

function reset() {
  formDateRange.value = null
  formType.value = 'conge'
  formStatus.value = 'brouillon'
  formDuration.value = 1
  showWarning.value = false
  warningMessages.value = []
  formSaving.value = false
  emit('update:modelValue', false)
}

defineExpose({ setWarnings, cancelWarning, setSaving, reset })
</script>

<template>
  <Transition name="slide-form">
    <div class="form-card" v-if="modelValue">
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

      <Transition name="fade">
        <div class="warning-banner" v-if="showWarning">
          <div class="warning-icon">!</div>
          <div class="warning-content">
            <strong>Solde négatif détecté</strong>
            <ul>
              <li v-for="(msg, i) in warningMessages" :key="i">{{ msg }}</li>
            </ul>
            <div class="warning-actions">
              <button class="btn-warning-confirm" @click="onSubmit">Confirmer quand même</button>
              <button class="btn-warning-cancel" @click="cancelWarning">Annuler</button>
            </div>
          </div>
        </div>
      </Transition>

      <button v-if="!showWarning" class="btn-submit" @click="onSubmit" :disabled="formSaving || !formDateRange">
        {{ formSaving ? 'Enregistrement...' : 'Valider' }}
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.form-card {
  background: #1a1a2e;
  border-radius: 10px;
  padding: 1.25rem;
  margin-bottom: 1rem;
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
  transition: border-color 0.2s;
}

.form-group select:focus {
  outline: none;
  border-color: #646cff;
}

.date-picker-group {
  flex: 2;
}

.warning-banner {
  display: flex;
  gap: 0.75rem;
  background: rgba(231, 76, 60, 0.12);
  border: 1px solid rgba(231, 76, 60, 0.4);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  margin-top: 0.5rem;
  margin-bottom: 0.25rem;
}

.warning-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #e74c3c;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.85rem;
}

.warning-content {
  flex: 1;
  font-size: 0.8rem;
}

.warning-content strong {
  color: #e74c3c;
  display: block;
  margin-bottom: 0.25rem;
}

.warning-content ul {
  margin: 0 0 0.5rem;
  padding-left: 1.1rem;
  color: #ccc;
}

.warning-content li {
  margin-bottom: 0.1rem;
}

.warning-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-warning-confirm {
  padding: 0.35rem 0.75rem;
  border: none;
  border-radius: 5px;
  background: #e74c3c;
  color: #fff;
  cursor: pointer;
  font-size: 0.8rem;
  transition: background 0.2s;
}

.btn-warning-confirm:hover {
  background: #c0392b;
}

.btn-warning-cancel {
  padding: 0.35rem 0.75rem;
  border: 1px solid #555;
  border-radius: 5px;
  background: transparent;
  color: #ccc;
  cursor: pointer;
  font-size: 0.8rem;
  transition: border-color 0.2s;
}

.btn-warning-cancel:hover {
  border-color: #888;
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
  transition: background 0.2s;
}

.btn-submit:hover {
  background: #535bf2;
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.slide-form-enter-active {
  animation: slideDown 0.25s ease-out;
}

.slide-form-leave-active {
  animation: slideDown 0.2s ease-in reverse;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 600px) {
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

  .warning-banner {
    flex-direction: column;
    gap: 0.5rem;
  }

  .warning-actions {
    flex-direction: column;
  }

  .warning-actions button {
    min-height: 44px;
  }
}
</style>
