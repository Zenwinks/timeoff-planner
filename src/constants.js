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
}
