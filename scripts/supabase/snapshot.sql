-- Instantané lisible d'une base au schéma Supabase : celle de production, puis
-- sa restauration de contrôle. Une seule transaction en lecture seule : les
-- nombres, les empreintes et les exports décrivent le même état de la base.
-- Avec la variable `snapshot` (psql -v snapshot=…), la transaction reprend un
-- instantané exporté, celui que pg_dump --snapshot reprend aussi : le dump et
-- ces exports décrivent alors exactement le même état.
--
-- Écrit dans /out (le dossier de sauvegarde, monté par backup-supabase.mjs) :
--   snapshot.json   nombre de lignes et empreinte md5 de chaque table de
--                   public et auth, à comparer après restauration ;
--   tables/*.json   les tables utiles à l'app, lisibles ;
--   tables/*.csv    les mêmes, pour un tableur.

\set ON_ERROR_STOP on
set default_transaction_read_only = on;
-- Les dates et nombres s'écrivent pareil des deux côtés, quel que soit le serveur.
set timezone = 'UTC';
set datestyle = 'ISO, YMD';
set intervalstyle = 'postgres';
set extra_float_digits = 1;

begin isolation level repeatable read read only;
\if :{?snapshot}
set transaction snapshot :'snapshot';
\endif

\pset format unaligned
\pset tuples_only on
\pset footer off

-- Pour chaque table : son nombre de lignes et le md5 de ses lignes en texte,
-- triées. Deux bases au contenu identique donnent les mêmes valeurs. Le tri
-- est en collation "C" : Supabase trie avec ICU, un Postgres sous Docker avec
-- la glibc, et les deux rangent différemment majuscules et ponctuation.
\o /out/snapshot.json
select jsonb_pretty(jsonb_build_object(
  'taken_at', now(),
  'server_version', current_setting('server_version'),
  'tables', (
    select jsonb_object_agg(name, stats order by name)
    from (
      select format('%s.%s', n.nspname, c.relname) as name,
             (xpath('/row/stats/text()', query_to_xml(format(
               $q$select jsonb_build_object('rows', count(*), 'md5', md5(coalesce(string_agg(t::text, E'\n' order by t::text collate "C"), ''))) as stats from %I.%I t$q$,
               n.nspname, c.relname), false, true, '')))[1]::text::jsonb as stats
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'auth') and c.relkind in ('r', 'p')
    ) s
  )
));

\o /out/tables/time_off_entries.json
select coalesce(jsonb_pretty(jsonb_agg(to_jsonb(t) order by t.id)), '[]') from public.time_off_entries t;
\o /out/tables/user_settings.json
select coalesce(jsonb_pretty(jsonb_agg(to_jsonb(t) order by t.id)), '[]') from public.user_settings t;
\o /out/tables/yearly_rtt.json
select coalesce(jsonb_pretty(jsonb_agg(to_jsonb(t) order by t.id)), '[]') from public.yearly_rtt t;
\o /out/tables/auth.users.json
select coalesce(jsonb_pretty(jsonb_agg(to_jsonb(t) order by t.id)), '[]') from auth.users t;
\o /out/tables/auth.identities.json
select coalesce(jsonb_pretty(jsonb_agg(to_jsonb(t) order by t.id)), '[]') from auth.identities t;
\o

\copy (select * from public.time_off_entries order by user_id, date) to '/out/tables/time_off_entries.csv' with (format csv, header)
\copy (select * from public.user_settings order by user_id) to '/out/tables/user_settings.csv' with (format csv, header)
\copy (select * from public.yearly_rtt order by user_id, year) to '/out/tables/yearly_rtt.csv' with (format csv, header)
\copy (select * from auth.users order by created_at) to '/out/tables/auth.users.csv' with (format csv, header)
\copy (select * from auth.identities order by created_at) to '/out/tables/auth.identities.csv' with (format csv, header)

commit;
