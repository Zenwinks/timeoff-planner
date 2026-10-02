# TimeOff Planner

Une PWA pour poser ses congés (CP) et ses RTT, et suivre ses soldes mois par
mois. Connexion avec Google, inscription libre : chacun a son compte et ne voit
que ses données.

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

| Route | Remplace (supabase-js) |
| --- | --- |
| `GET /api/me` | `auth.getUser()`, `auth.getSession()` |
| `GET` / `PUT /api/settings` | `user_settings` : select, insert, update |
| `GET` / `POST /api/yearly-rtt` | `yearly_rtt` : select (trié par année), insert |
| `PATCH` / `DELETE /api/yearly-rtt/:id` | `yearly_rtt` : update, delete |
| `GET` / `POST` / `DELETE /api/entries` | `time_off_entries` : select, insert, delete |
| `GET /auth/google`, `GET /auth/callback` | `auth.signInWithOAuth({ provider: 'google' })` |
| `POST /auth/logout` | `auth.signOut()` |
| `DELETE /api/account` | (nouveau) suppression du compte et de ses données |

Les lignes ont le format que renvoyait Supabase : mêmes colonnes, nombres en
nombres, dates en `AAAA-MM-JJ`.

## Développement

```bash
cp .env.example .env    # puis GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET
npm install
npm run dev:server      # l'API, sur http://localhost:3000
npm run dev             # la PWA, sur http://localhost:5173 (relaie /api et /auth)
npm test                # serveur et cloisonnement entre comptes
```

Le client Google doit connaître `http://localhost:5173/auth/callback` comme
adresse de retour (ou `:3000` pour le serveur seul et Docker).

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
| Migrations | appliquées par le serveur au démarrage |
| Arrêt | `SIGTERM` : finit les requêtes en cours et ferme la base |
| Déposer une base migrée | conteneur arrêté : copier `timeoff.sqlite` dans le volume (propriétaire `node`, uid 1000), sans `-wal` ni `-shm` à côté, comparer son SHA-256 à celui qu'a affiché la migration, puis démarrer |
