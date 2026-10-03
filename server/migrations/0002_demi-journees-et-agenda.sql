-- Les demi-journées : le matin ou l'après-midi. Null : non précisé, comme pour
-- celles posées avant cette migration (et pour toute journée entière). Une
-- colonne ajoutée : aucune ligne existante n'est réécrite.
alter table time_off_entries add column half_day text check (half_day in ('matin', 'apres-midi'));

-- Le lien d'abonnement à l'agenda d'un compte : l'empreinte (SHA-256) de son
-- jeton, jamais le jeton. Un lien par compte ; en créer un autre révoque l'ancien.
create table calendar_feeds (
  user_id text primary key references users (id) on delete cascade,
  token_hash text not null unique,
  created_at text not null
) strict;
