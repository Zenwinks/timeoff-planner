export const monthNames = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
]

/**
 * Les statuts qui comptent dans le solde « confirmé » : des congés acquis. Le
 * solde « prévisionnel » compte aussi les brouillons et les demandes.
 */
export const CONFIRMED_STATUSES = new Set(['accepte', 'impose'])

export const statusLabels = {
  brouillon: 'Brouillon',
  demande: 'Demandé',
  accepte: 'Accepté',
  impose: 'Imposé',
}

// Le statut se lit à son icône (et au style de la puce) ; la couleur, elle,
// dit le type. Rien ne repose sur la couleur seule.
export const statusIcons = {
  brouillon: 'draft',
  demande: 'clock',
  accepte: 'check',
  impose: 'lock',
}

export const typeLabels = {
  conge: 'CP',
  rtt: 'RTT',
  maladie: 'Arrêt maladie',
}

/**
 * Un arrêt maladie n'a pas de statut à suivre (il est enregistré « accepté ») :
 * ni brouillon, ni demande, ni place dans la légende des statuts.
 */
export const isSickLeave = entry => entry.type === 'maladie'
