# TimeOff Planner

Une PWA pour poser ses congés (CP) et ses RTT, et suivre ses soldes mois par
mois. Connexion avec Google, inscription libre : chacun a son compte et ne voit
que ses données.

- **Deux soldes, au choix** : le **prévisionnel** décompte tous les congés
  posés, brouillons et demandes compris ; le **confirmé** ne décompte que les
  congés acceptés ou imposés.
- **Conçue d'abord pour le mobile**, où l'on consulte, et complète sur
  ordinateur, où l'on pose ses congés. Thème clair ou sombre, celui du système
  par défaut.

En ligne sur `https://timeoff-planner.zenwinks.fr`, servie depuis le VPS de
Lucas par Coolify. Jusqu'en octobre 2026, l'app tournait sur Vercel avec
Supabase (base et connexion). Voir « Sortie de Supabase » plus bas.

## Architecture

- **Un seul service Node** (`server/`) : il sert la PWA construite (`dist/`) et
  une API JSON, sans framework.
- **SQLite** (better-sqlite3) : un fichier dans `/data`. Les migrations de
  `server/migrations/` s'appliquent au démarrage.
- **Le front** (`src/`) : Vue 3 + Vite, PWA (vite-plugin-pwa). `src/api.js`
  parle au serveur ; les soldes se calculent dans le navigateur
  (`src/composables/useBalance.js`).

### Le front

| Fichier | Rôle |
| --- | --- |
| `src/style.css` | la base visuelle : couleurs des deux thèmes (variables CSS), boutons, champs, cartes, contrôles segmentés |
| `public/theme-init.js` | pose le thème choisi avant le premier affichage (un fichier à part : la CSP n'admet pas de script dans la page) |
| `src/dashboard.js` | ce que montre le tableau de bord : les deux soldes par mois, les congés d'un seul tenant, le prochain congé, les jours en attente (fonctions pures, `tests/dashboard.test.js`) |
| `shared/` | ce que partagent la PWA et le serveur : les jours fériés (sans état : la journée de solidarité se passe en argument) et le regroupement des jours en congés d'un seul tenant |
| `views/Dashboard.vue` | le résumé, le choix prévisionnel / confirmé, les mois en liste ou l'année en calendrier |
| `components/YearCalendar.vue` | l'année d'un coup d'œil : un clic sur un jour posé ouvre son congé, sur un jour libre en pose un |
| `components/TimeOffSheet.vue` | poser ou modifier un congé : calendrier avec les jours posés et les fériés, effet sur le solde de fin d'année, alertes |
| `components/EntrySheet.vue` | un congé ouvert depuis sa puce : statut en un geste, modifier, supprimer (avec « Annuler ») |
| `components/BottomSheet.vue` | un panneau sur un `<dialog>` natif : monté du bas sur mobile, au centre sur ordinateur |

- **La couleur dit le type** (CP en indigo, RTT en sarcelle), **l'icône et le
  style disent le statut** : plein et coché pour accepté, hachuré et cadenas
  pour imposé, teinté avec une horloge pour demandé, en pointillé pour brouillon.
  Rien ne repose sur la couleur seule ; les textes visent un contraste AA dans
  les deux thèmes.
- **Un congé à cheval sur deux mois** apparaît dans chacun, mais s'ouvre, se
  modifie et se supprime en entier.
- **Les mises à jour arrivent seules** : à l'ouverture de l'app, le service
  worker récupère une version déployée entre-temps, et la page se recharge dès
  qu'elle prend la main (`src/main.js`). `injectRegister` doit rester à `auto`
  dans `vite.config.js` : c'est lui qui fait passer la nouvelle version tout de
  suite ; à `false`, elle attendrait indéfiniment.

### Connexion et cloisonnement

- **« Se connecter avec Google »**, en OpenID Connect (openid-client) : flux
  avec code, `state`, `nonce` et PKCE. Un compte se retrouve par son
  identifiant Google (`sub`), jamais par son adresse ; un `sub` inconnu crée un
  compte.
- **Le client Google peut rester en « Testing »** : l'app ne demande que
  `openid` et `email`, et Google laisse alors entrer tout compte, sans liste de
  comptes de test ni avertissement
  ([aide Google](https://support.google.com/cloud/answer/15549945)). Demander
  un autre accès (Agenda…) réserverait la connexion aux comptes de test,
  jusqu'à publication et vérification de l'app.
- **La session** : un cookie `HttpOnly`, `Secure` (en HTTPS), `SameSite=Lax`,
  préfixé `__Host-`, valable 30 jours et prolongé à l'usage. La base ne garde
  que l'empreinte HMAC du jeton : changer `SESSION_SECRET` déconnecte tout le
  monde.
- **Refus par défaut** (`server/app.js`) : toute route demande une session,
  sauf la connexion et `/healthz`. Une requête qui écrit doit porter l'en-tête
  `Origin` de l'app.
- **Chaque requête est filtrée par le compte de la session**
  (`server/store.js`) : c'est le rôle que jouait la RLS de Supabase. Un
  identifiant d'un autre compte est introuvable (404), et un `user_id` glissé
  dans un corps de requête est refusé (400). `tests/isolation.test.js` vérifie
  que chaque tentative d'un compte sur les données d'un autre échoue.
- **RGPD** : « Supprimer mon compte », dans les Paramètres, efface le compte et
  toutes ses données. La page `/confidentialite` dit ce qui est gardé, et
  pourquoi.

### L'API

| Route | Rôle |
| --- | --- |
| `GET /api/me` | le compte connecté |
| `GET` / `PUT /api/settings` | les paramètres ; avec `yearly_rtt`, le `PUT` remplace aussi la liste des RTT par année, dans la même transaction |
| `GET /api/yearly-rtt` | les RTT par année, triés |
| `GET` / `POST` / `DELETE /api/entries` | les jours posés : lire, poser, retirer (tout ou rien) |
| `PATCH /api/entries` | changer le statut de tous les jours d'un congé, d'un coup |
| `POST /api/entries/replace` | modifier un congé : ses anciens jours remplacés par les nouveaux, tout ou rien |
| `GET /auth/google`, `GET /auth/callback` | la connexion avec Google |
| `POST /auth/logout` | la déconnexion de l'appareil |
| `DELETE /api/account` | la suppression du compte et de toutes ses données |
| `GET /api/calendar.ics` | les congés au format iCalendar, à importer dans un agenda |
| `GET` / `POST` / `DELETE /api/calendar-feed` | le lien d'abonnement à l'agenda : savoir s'il existe, en créer un (l'adresse n'est montrée qu'à ce moment-là, et remplace l'ancienne), le désactiver |
| `GET /calendar/<jeton>.ics` | **sans session** : ce que lit l'agenda abonné. Le jeton (32 octets au hasard) est le secret ; la base n'en garde que l'empreinte SHA-256 |

Un jour posé peut être une demi-journée (`duration` 0,5), le matin ou l'après-midi
(`half_day` : `matin`, `apres-midi`, ou `null` pour celles posées avant octobre
2026, sans moment précisé).

`POST /api/yearly-rtt`, `PATCH` et `DELETE /api/yearly-rtt/:id` ne servent plus
à l'app depuis octobre 2026 : elles restent pour un onglet resté ouvert sur une
ancienne version, et pourront partir à la prochaine version.

Les lignes ont le format que renvoyait Supabase : mêmes colonnes, nombres en
nombres, dates en `AAAA-MM-JJ`.

## Développement

```bash
cp .env.example .env    # puis GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET
npm install
npm run dev:server      # l'API, sur http://localhost:3000
npm run dev             # la PWA, sur http://localhost:5173 (relaie /api et /auth)
npm test                # serveur, cloisonnement entre comptes, calculs du tableau de bord
npm run test:e2e        # parcours dans le navigateur, sur ordinateur et sur mobile
```

Le client Google doit connaître `http://localhost:5173/auth/callback` comme
adresse de retour (ou `:3000` pour le serveur seul et Docker).

- **Les tests dans le navigateur** (`e2e/`, Playwright) pilotent l'Edge déjà
  installé (`PW_CHANNEL=chrome` pour Chrome) : rien à télécharger. Chaque test a
  son propre compte fictif, et le navigateur vit le lundi 5 octobre 2026.
- **Voir l'app sans données réelles** : `npm run demo:seed` crée
  `.data/demo.sqlite` avec un compte fictif (`scripts/lib/demo.mjs`) et affiche
  la ligne à coller dans la console du navigateur pour s'y connecter. Lancer
  ensuite le serveur avec `DATABASE_PATH=.data/demo.sqlite`.
- **Les icônes PNG** (Android, iPhone) se tirent du SVG avec
  `node scripts/generate-icons.mjs`, seulement quand l'icône change.

## Sortie de Supabase

Supabase reste intact : référence jusqu'à la bascule, secours au moins un mois
après. Les scripts ne font que le lire.

1. **Sauvegarder** (lecture seule ; la chaîne « Session pooler » dans un fichier
   hors du dépôt, par défaut `~/.secrets/timeoff-planner/supabase-pooler.url`) :

   ```bash
   node scripts/backup-supabase.mjs \
     --out  F:/sauvegardes/timeoff-planner/supabase-AAAA-MM-JJ \
     --copy D:/sauvegardes/timeoff-planner
   ```

   Un instantané exporté (`pg_export_snapshot`) que reprennent `pg_dump`
   (schémas `public` et `auth`, format custom et SQL) et les exports JSON/CSV ;
   la référence de contrôle (lignes par table, empreintes, soldes de chaque
   compte calculés par `useBalance`) ; une restauration de contrôle dans un
   Postgres jetable ; une seconde copie, vérifiée par SHA-256. **Ces dossiers
   contiennent des données personnelles : jamais dans le dépôt** (qui est
   public). Le script refuse d'écrire dans le dépôt, et `.gitignore` comme
   `.dockerignore` rattrapent une copie égarée.

2. **Migrer** (ne lit que la sauvegarde) :

   ```bash
   node scripts/migrate-from-supabase.mjs --backup <dossier> --dry-run
   node scripts/migrate-from-supabase.mjs --backup <dossier> --out <fichier.sqlite>
   ```

   La base se construit à part, puis se contrôle : mêmes nombres de lignes,
   chaque ligne relue par le serveur identique à l'export, mêmes soldes par
   compte, mois par mois. Au moindre écart, rien n'est produit.

3. **Vérifier une base déposée**, avant que quiconque y écrive :
   `node scripts/verify-sqlite.mjs --backup <dossier> --db <fichier.sqlite>`.

## Fiche de déploiement

À destination de la conversation infra (Coolify sur le VPS).

| | |
| --- | --- |
| Adresse | `https://timeoff-planner.zenwinks.fr`, redéployée à chaque push sur `main` |
| Build | `Dockerfile` à la racine, contexte `/` |
| Image | Node 24 Alpine, en deux étapes ; tourne sous l'utilisateur `node` |
| Port exposé | `3000` |
| Stockage persistant | **volume sur `/data`** : la base `timeoff.sqlite` (et ses fichiers `-wal`, `-shm`) y vit. Sans volume, les données disparaissent au prochain déploiement |
| Santé | `GET /healthz` → `ok` (serveur **et** base) ; `HEALTHCHECK` déjà dans l'image |
| Variables de build | aucune |
| Variables d'exécution | `PUBLIC_URL=https://timeoff-planner.zenwinks.fr` (pas secrète, obligatoire) ; **secrets, saisis par Lucas** : `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` (au hasard, 32 caractères au moins, par exemple `openssl rand -base64 48`). Sans eux, la connexion reste fermée et le journal dit pourquoi ; `/healthz` répond quand même. `NODE_ENV`, `PORT` et `DATABASE_PATH` sont fixées dans l'image |
| Adresse de retour Google | `https://timeoff-planner.zenwinks.fr/auth/callback` |
| HTTPS | obligatoire : cookies `Secure` et `__Host-`, HSTS |
| Proxy | l'app compare l'en-tête `Origin` à `PUBLIC_URL` ; elle n'utilise ni `Host` ni `X-Forwarded-*` |
| Migrations | appliquées par le serveur au démarrage. Avant d'en appliquer une à une base qui a des données, il la copie dans `/data/sauvegardes/` (`VACUUM INTO`, une copie cohérente) ; les copies de plus de 30 jours s'effacent au démarrage |
| Arrêt | `SIGTERM` : finit les requêtes en cours et ferme la base |
| Déposer une base migrée | conteneur arrêté : **retirer `timeoff.sqlite-wal` et `timeoff.sqlite-shm`** de la base précédente (SQLite rejouerait sinon son journal sur la nouvelle), copier `timeoff.sqlite` dans le volume (propriétaire `node`, uid 1000), comparer son SHA-256 à celui qu'a affiché la migration, puis démarrer. Les comptes créés sur la base précédente disparaissent avec elle : chacun retrouve le sien, repris de Supabase, par son `sub` |
