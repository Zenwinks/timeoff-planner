-- Le contrat : horaire (les RTT se saisissent année par année, comme jusqu'ici)
-- ou au forfait jours (les RTT se déduisent des jours à travailler).
alter table user_settings add column contrat text not null default 'horaire' check (contrat in ('horaire', 'forfait_jours'));

-- Le forfait : les jours à travailler dans l'année. Null : pas de forfait.
alter table user_settings add column forfait_jours integer check (forfait_jours between 1 and 366);

-- Les RTT : acquis d'un coup au 1er janvier (« annuel », comme jusqu'ici), un
-- douzième chaque mois (« mensuel »), ou pas de RTT (« aucun »).
alter table user_settings add column rtt_mode text not null default 'annuel' check (rtt_mode in ('annuel', 'mensuel', 'aucun'));

-- Au forfait, une journée de solidarité retirée des RTT plutôt que travaillée :
-- ce jour-là n'est pas travaillé, et l'année compte un RTT de moins.
alter table user_settings add column solidarite_rtt integer not null default 0 check (solidarite_rtt in (0, 1));

-- Les arrêts maladie, un troisième type de jour posé. SQLite ne modifie pas une
-- contrainte CHECK : la table est reconstruite à l'identique, avec toutes ses
-- lignes, puis reprend son nom. Aucune autre table ne pointe vers elle.
create table time_off_entries_0003 (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  date text not null check (date(date) is date),
  type text not null check (type in ('conge', 'rtt', 'maladie')),
  status text not null check (status in ('brouillon', 'demande', 'accepte', 'impose')),
  created_at text,
  updated_at text,
  duration real not null,
  half_day text check (half_day in ('matin', 'apres-midi')),
  unique (user_id, date)
) strict;

insert into time_off_entries_0003 (id, user_id, date, type, status, created_at, updated_at, duration, half_day)
  select id, user_id, date, type, status, created_at, updated_at, duration, half_day from time_off_entries;

drop table time_off_entries;
alter table time_off_entries_0003 rename to time_off_entries;
