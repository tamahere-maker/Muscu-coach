-- Suite de la gestion des athlètes (032). Additif : rien n'est supprimé.
--  * Pause avec date de reprise facultative : le suivi reprend tout seul ce jour-là (reprise notée dans
--    evenements_suivi avec details.auto, l'athlète est prévenu comme pour une reprise manuelle).
--  * Rappel au coach principal quand une pause dure depuis 30 jours (puis tous les 30 jours) : evenements_suivi de
--    type « pause » avec details.rappel, e-mail au coach seulement.
--  * L'athlète peut mettre fin lui-même à son suivi : evenements_suivi de type « fin » avec details.par_athlete
--    (coach_id = son coach principal). Même effet que la fin par le coach.
-- Reprises et rappels : fonction suivi_quotidien(), appelée chaque heure par pg_cron ; les e-mails partent au
-- passage suivant de « envois » (rattrapage des événements non notifiés, toutes les 5 min).

alter table public.coachings add column if not exists pause_jusqu_au date;
alter table public.coachings add column if not exists pause_rappel_at timestamptz;

-- Pause ou reprise avec date de reprise (remplace mettre_en_pause dans l'app, qui reste disponible)
create or replace function public.changer_pause(a uuid, p_pause boolean, p_motif text default null, p_jusqu_au date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare ev uuid; deja boolean; m text := nullif(trim(p_motif), '');
begin
  if not public.est_principal_de(a) then raise exception 'Seul le coach principal peut mettre ce suivi en pause'; end if;
  if p_pause and p_jusqu_au is not null and p_jusqu_au <= current_date then raise exception 'La date de reprise doit être après aujourd’hui'; end if;
  select bool_or(pause_depuis is not null) into deja from coachings where athlete_id = a;
  if p_pause and deja then raise exception 'Ce suivi est déjà en pause'; end if;
  if not p_pause and not deja then raise exception 'Ce suivi n’est pas en pause'; end if;
  if p_pause then
    -- Les mises à jour en attente sont consommées sans notification pendant la pause (fonction « envois »)
    update coachings set pause_depuis = now(), pause_motif = m, pause_jusqu_au = p_jusqu_au, pause_rappel_at = null where athlete_id = a;
  else
    update coachings set pause_depuis = null, pause_motif = null, pause_jusqu_au = null, pause_rappel_at = null where athlete_id = a;
  end if;
  insert into evenements_suivi(athlete_id, coach_id, type, motif, details)
  values (a, auth.uid(), case when p_pause then 'pause' else 'reprise' end, m,
    case when p_pause and p_jusqu_au is not null then jsonb_build_object('jusqu_au', p_jusqu_au) else '{}'::jsonb end)
  returning id into ev;
  return ev;
end $$;

-- Reprises automatiques et rappels de pause longue (pg_cron, chaque heure)
create or replace function public.suivi_quotidien() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select athlete_id, coach_id, pause_jusqu_au from coachings
           where principal and pause_depuis is not null and pause_jusqu_au is not null
             and pause_jusqu_au <= (now() at time zone 'Europe/Paris')::date loop
    update coachings set pause_depuis = null, pause_motif = null, pause_jusqu_au = null, pause_rappel_at = null where athlete_id = r.athlete_id;
    insert into evenements_suivi(athlete_id, coach_id, type, details)
    values (r.athlete_id, r.coach_id, 'reprise', jsonb_build_object('auto', true, 'prevue', r.pause_jusqu_au));
  end loop;
  for r in select athlete_id, coach_id, pause_depuis from coachings
           where principal and pause_depuis is not null and pause_depuis < now() - interval '30 days'
             and coalesce(pause_rappel_at, pause_depuis) < now() - interval '30 days' loop
    update coachings set pause_rappel_at = now() where athlete_id = r.athlete_id and principal;
    insert into evenements_suivi(athlete_id, coach_id, type, details)
    values (r.athlete_id, r.coach_id, 'pause', jsonb_build_object('rappel', true, 'depuis', r.pause_depuis));
  end loop;
end $$;
revoke all on function public.suivi_quotidien() from public, anon, authenticated;

-- L'athlète met fin à son suivi (tous ses coachs)
create or replace function public.quitter_suivi(p_motif text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare ev uuid; m text := nullif(trim(p_motif), ''); princ uuid; assoc jsonb; ctr jsonb; a uuid := auth.uid();
begin
  select coach_id into princ from coachings where athlete_id = a and principal;
  if princ is null then select coach_id into princ from coachings where athlete_id = a limit 1; end if;
  if princ is null then raise exception 'Tu n’as pas de coach en ce moment'; end if;
  perform set_config('suivi.motif', coalesce(m, 'Fin du suivi demandée par l’athlète'), true);
  select coalesce(jsonb_agg(jsonb_build_object('id', c.coach_id, 'nom', p.nom)), '[]'::jsonb) into assoc
    from coachings c join profiles p on p.id = c.coach_id where c.athlete_id = a and c.coach_id <> princ;
  with fins as (
    update contrats set statut = case when statut = 'accepte' then 'resilie' else 'annule' end,
      fin_at = now(), fin_par = a, motif_fin = coalesce(m, 'Fin du suivi demandée par l’athlète')
    where athlete_id = a and statut in ('accepte', 'envoye')
    returning titre, statut)
  select coalesce(jsonb_agg(jsonb_build_object('titre', titre, 'statut', statut)), '[]'::jsonb) into ctr from fins;
  update invitations_coach set statut = 'annulee' where athlete_id = a and statut = 'envoyee';
  delete from maj_en_attente where athlete_id = a;
  delete from coachings where athlete_id = a;
  insert into evenements_suivi(athlete_id, coach_id, type, motif, details)
  values (a, princ, 'fin', m, jsonb_build_object('par_athlete', true, 'associes', assoc, 'contrats', ctr)) returning id into ev;
  return ev;
end $$;

revoke all on function public.changer_pause(uuid, boolean, text, date), public.quitter_suivi(text) from public, anon;
grant execute on function public.changer_pause(uuid, boolean, text, date), public.quitter_suivi(text) to authenticated;

select cron.schedule('suivi-quotidien', '7 * * * *', 'select public.suivi_quotidien()');
