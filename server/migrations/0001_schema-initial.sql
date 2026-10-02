-- Le schéma repris de Supabase : les trois tables de l'app, colonne pour
-- colonne et dans le même ordre, avec les mêmes identifiants. Les UUID et les
-- dates ('AAAA-MM-JJ') sont du texte, les horodatages de l'ISO 8601. Les
-- numeric de Postgres deviennent des REAL : l'app les lisait déjà comme des
-- nombres JavaScript, et la migration vérifie qu'aucune valeur n'y change.
--
-- La RLS de Supabase (auth.uid() = user_id) devient le filtre par compte que
-- porte chaque requête de server/store.js.

-- Les comptes, repris de auth.users et auth.identities de Supabase. On retrouve
-- un compte par son identifiant Google (`sub`), jamais par son adresse.
create table users (
  id text primary key,
  google_sub text not null unique,
  email text not null,
  created_at text not null,
  last_login_at text
) strict;

-- La base ne garde que l'empreinte (HMAC) du jeton du cookie, jamais le jeton.
create table sessions (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  created_at text not null,
  expires_at text not null
) strict;
create index sessions_user_id on sessions (user_id);
create index sessions_expires_at on sessions (expires_at);

create table user_settings (
  id text primary key,
  user_id text not null unique references users (id) on delete cascade,
  start_year integer not null,
  initial_conges real not null,
  initial_rtt real not null,
  conges_increment_per_month real not null,
  created_at text,
  updated_at text,
  journee_solidarite text
) strict;

create table yearly_rtt (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  year integer not null,
  rtt_count real not null,
  created_at text,
  unique (user_id, year)
) strict;

create table time_off_entries (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  date text not null check (date(date) is date),
  type text not null check (type in ('conge', 'rtt')),
  status text not null check (status in ('brouillon', 'demande', 'accepte', 'impose')),
  created_at text,
  updated_at text,
  duration real not null,
  unique (user_id, date)
) strict;
