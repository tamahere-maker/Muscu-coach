-- Tableau de bord du coach : pour chacun de ses athlètes, activité de la semaine, bilans à lire ou en retard,
-- records battus dans les 7 derniers jours (1RM estimé, formule d'Epley).
create or replace function public.tableau_de_bord() returns table(
  athlete_id uuid, nom text, objectif_semaine int, seances_7j bigint, derniere_seance date,
  bilans_a_lire bigint, bilan_en_retard boolean, records jsonb)
language sql stable security definer set search_path = public as $$
  with mes as (
    select c.athlete_id from coachings c where c.coach_id = auth.uid()
  ), perfs as (
    select r.athlete_id, s.exercice_id, r.date, s.charge_kg * (1 + s.reps / 30.0) as e1rm, s.charge_kg, s.reps
    from seances_realisees r join series_realisees s on s.seance_realisee_id = r.id
    where r.athlete_id in (select athlete_id from mes) and s.charge_kg > 0 and s.reps > 0
  ), avant as (
    select athlete_id, exercice_id, max(e1rm) as best from perfs where date < current_date - 6 group by 1, 2
  ), recents as (
    select distinct on (p.athlete_id, p.exercice_id) p.athlete_id, p.exercice_id, p.e1rm, p.charge_kg, p.reps, p.date
    from perfs p join avant a using (athlete_id, exercice_id)
    where p.date >= current_date - 6 and p.e1rm > a.best
    order by p.athlete_id, p.exercice_id, p.e1rm desc
  )
  select m.athlete_id, pr.nom, ap.seances_semaine,
    (select count(*) from seances_realisees r where r.athlete_id = m.athlete_id and r.date >= current_date - 6),
    (select max(r.date) from seances_realisees r where r.athlete_id = m.athlete_id),
    (select count(*) from bilans b where b.athlete_id = m.athlete_id and b.statut = 'envoye'),
    coalesce(sb.jour_semaine is not null and not exists(
      select 1 from bilans b where b.athlete_id = m.athlete_id and b.envoye_at >= now() - interval '8 days'), false),
    coalesce((select jsonb_agg(jsonb_build_object('exercice', e.nom, 'kg', rc.charge_kg, 'reps', rc.reps, 'date', rc.date) order by rc.date desc)
      from recents rc join exercices e on e.id = rc.exercice_id where rc.athlete_id = m.athlete_id), '[]'::jsonb)
  from mes m
  join profiles pr on pr.id = m.athlete_id
  left join athlete_profiles ap on ap.athlete_id = m.athlete_id
  left join suivi_bilans sb on sb.athlete_id = m.athlete_id
$$;
revoke execute on function public.tableau_de_bord() from public, anon;
grant execute on function public.tableau_de_bord() to authenticated;
