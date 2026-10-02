// Les messages éphémères de l'app (« Congé supprimé · Annuler », erreurs),
// affichés en bas de l'écran par ToastHost.vue.

import { reactive } from 'vue'

const toasts = reactive([])
let nextId = 1

export function useToasts() {
  return toasts
}

/**
 * Affiche un message. `action` : un bouton ({ label, run }) qui ferme le
 * message une fois lancé. `tone` : 'info' ou 'error'.
 */
export function showToast({ message, action = null, tone = 'info', duration = 6000 }) {
  const id = nextId++
  toasts.push({ id, message, action, tone, timer: duration ? setTimeout(() => dismissToast(id), duration) : null })
  return id
}

export function dismissToast(id) {
  const index = toasts.findIndex(t => t.id === id)
  if (index < 0) return
  clearTimeout(toasts[index].timer)
  toasts.splice(index, 1)
}
