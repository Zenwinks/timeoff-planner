-- Les CP s'acquièrent par douzièmes de l'année, comme sur les fiches de paie :
-- 25 jours par an font 25/12 par mois. Le 2,08 proposé jusqu'ici en perdait
-- 0,04 par an ; les comptes qui l'avaient passent à 25 par an tout juste.
update user_settings set conges_increment_per_month = 25.0 / 12 where conges_increment_per_month = 2.08;
