// Les gestes communs des tests dans le navigateur, sur l'interface de l'app.

import { expect } from '@playwright/test'

export async function openDashboard(page) {
  await page.goto('/')
  await expect(page.locator('.month-list')).toBeVisible()
}

/** Le panneau ouvert (détail d'un congé, formulaire). */
export const sheet = page => page.getByRole('dialog')

/** « Poser un congé » : le bouton de la barre du haut, ou le bouton rond sur mobile. */
export async function openNewForm(page) {
  await page.getByRole('button', { name: 'Poser un congé' }).click()
  await expect(sheet(page).getByRole('heading', { name: 'Poser un congé' })).toBeVisible()
}

/**
 * Choisit une période dans le calendrier du formulaire (dates AAAA-MM-JJ, sur
 * le mois affiché). Par la date de la case : survolé, un jour déjà posé affiche
 * son infobulle dans sa case, et son texte n'est plus seulement son numéro.
 */
export async function pickPeriod(page, from, to) {
  const day = date => sheet(page).locator(`[data-test-id="dp-${date}"]`)
  await day(from).click()
  await day(to).click()
}

/** Un choix dans un contrôle segmenté (« Statut », « Durée »…) du panneau. */
export const choice = (page, group, option) =>
  sheet(page).getByRole('group', { name: group, exact: true }).getByRole('button', { name: option, exact: true })

/** La puce d'un congé, par ce qu'elle annonce : « CP du 21 au 24 décembre… ». */
export const chip = (page, text) => page.locator('.month-list').getByRole('button', { name: new RegExp(text) })

export async function openChip(page, text) {
  await chip(page, text).first().click()
  await expect(sheet(page)).toBeVisible()
}
