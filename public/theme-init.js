// Avant le premier affichage : le thème choisi dans les Paramètres, s'il y en a
// un. Sans choix, la feuille de style suit le réglage du système. Un fichier à
// part, et non un script dans la page : la politique de sécurité (CSP) n'admet
// que les scripts servis par l'app.
try {
  const theme = localStorage.getItem('timeoff-theme')
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme
} catch {
  // Stockage indisponible (navigation privée stricte) : le thème du système.
}
