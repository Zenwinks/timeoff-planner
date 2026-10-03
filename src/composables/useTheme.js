// Le thème de l'app : « Automatique » (celui du système), « Clair » ou
// « Sombre ». Le choix reste dans ce navigateur : public/theme-init.js le
// rétablit avant le premier affichage, ce module le suit ensuite.

import { computed, ref, watch } from 'vue'

const KEY = 'timeoff-theme'
const media = window.matchMedia('(prefers-color-scheme: light)')

function storedChoice() {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

/** 'system', 'light' ou 'dark'. */
export const themeChoice = ref(storedChoice())

const systemIsLight = ref(media.matches)
media.addEventListener('change', event => {
  systemIsLight.value = event.matches
})

/** Le thème réellement affiché. */
export const isDark = computed(() =>
  themeChoice.value === 'dark' || (themeChoice.value === 'system' && !systemIsLight.value))

watch(themeChoice, choice => {
  const root = document.documentElement
  if (choice === 'system') delete root.dataset.theme
  else root.dataset.theme = choice
  try {
    if (choice === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    // Stockage indisponible : le choix vaut pour cette visite.
  }
})
