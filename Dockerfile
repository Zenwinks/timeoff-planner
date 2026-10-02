# TimeOff Planner : la PWA et son API, en un seul service Node, avec sa base
# SQLite dans /data.
#
#   docker build -t timeoff-planner .
#   docker run --rm -p 3000:3000 -v timeoff-data:/data --env-file .env timeoff-planner
#
# Deux étapes. La première construit la PWA ; la seconde ne garde que le
# serveur, ses deux dépendances et la PWA construite : ni sources du front, ni
# outils de build.
#
# La base vit dans /data, à monter en volume persistant : l'image se
# reconstruit à chaque déploiement, les données restent.

# ── Construction ────────────────────────────────────────────────────────────
FROM node:24-alpine AS build
WORKDIR /app

# Les dépendances avant les sources : tant que package.json et le lockfile ne
# bougent pas, cette couche reste en cache.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Ne garder que les dépendances du serveur (better-sqlite3, openid-client).
# better-sqlite3 embarque un binaire par plateforme (17 Mo en tout) : on ne
# garde que celui de cette image, Alpine (musl) sur l'architecture du build.
RUN npm prune --omit=dev \
 && ARCH="$(node -p process.arch)" \
 && find node_modules/better-sqlite3/prebuilds -type f ! -name "linuxmusl-${ARCH}.node" -delete \
 && test -f "node_modules/better-sqlite3/prebuilds/linuxmusl-${ARCH}.node"

# ── Service ─────────────────────────────────────────────────────────────────
FROM node:24-alpine
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/timeoff.sqlite

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/dist ./dist

# Le serveur tourne sous l'utilisateur `node` de l'image, pas sous root.
# Un volume vide monté sur /data reprend ces droits à sa création.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data

EXPOSE 3000

# Le wget de busybox, déjà dans l'image Alpine : rien à ajouter.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "server/index.js"]
