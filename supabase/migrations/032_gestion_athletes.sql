-- Gestion des athlètes par le coach : mise en pause, reprise et fin du suivi. Additif : rien n'est supprimé.
--  * Pause (coach principal) : l'athlète garde son compte, son historique, son programme et son plan, et peut toujours
--    écrire à ses coachs ; il sort du tableau de bord et des « À relancer » et ne reçoit plus les notifications de
--    mise à jour de programme ou de plan, jusqu'à la reprise. La pause vaut pour tous ses coachs. Le contrat n'est pas touché.
--  * Fin du suivi (coach principal) : toutes les lignes de coaching de l'athlète sont archivées (coachings_archives)
--    puis supprimées, donc plus aucun accès des coachs à ses données ; ses données restent dans son espace et
--    réapparaissent pour un coach qu'il rejoindrait plus tard. Le contrat en cours est résilié, un contrat pas encore
--    accepté est annulé, les invitations de coachs associés en attente sont annulées.
--  * Un coach associé peut quitter le suivi d'un athlète ; le coach principal peut retirer un coach associé.
--  * Chaque action est notée dans evenements_suivi : la fonction Edge « envois » prévient l'athlète (push + e-mail),
--    et les coachs concernés par e-mail.

alter table public.coachings add column if not exists pause_depuis timestamptz;
alter table public.coachings add column if not exists pause_motif text;

-- Liens coach / athlète terminés (copie de la ligne de coaching au moment de la fin)
create table if not exists public.coachings_archives (
  id uuid primary key default gen_random_uuid(),
  coaching_id uuid not null,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  principal boolean not null,
  perimetre text not null,
  part_pct numeric(5,2) not null default 0,
  nom_athlete text not null default '',
  debut_at timestamptz not null,
  fin_at timestamptz not null default now(),
  fin_par uuid references public.profiles(id) on delete set null,
  motif text
);
create index if not exists coachings_archives_coach on public.coachings_archives(coach_id, fin_at desc);
alter table public.coachings_archives enable row level security;
drop policy if exists ca_lecture on public.coachings_archives;
create policy ca_lecture on public.coachings_archives for select to authenticated
  using (coach_id = auth.uid() or athlete_id = auth.uid());

-- Toute ligne de coaching supprimée est archivée (sauf quand le compte de l'athlète ou du coach est lui-même supprimé)
create or replace function public.archiver_coaching() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists(select 1 from profiles where id = old.athlete_id) and exists(select 1 from profiles where id = old.coach_id) then
    insert into coachings_archives(coaching_id, athlete_id, coach_id, principal, perimetre, part_pct, nom_athlete, debut_at, fin_par, motif)
    values (old.id, old.athlete_id, old.coach_id, old.principal, old.perimetre, old.part_pct,
      coalesce((select nom from profiles where id = old.athlete_id), ''), old.created_at, auth.uid(),
      nullif(current_setting('suivi.motif', true), ''));
  end if;
  return null;
end $$;
revoke all on function public.archiver_coaching() from public, anon, authenticated;
drop trigger if exists coachings_archiver on public.coachings;
create trigger coachings_archiver after delete on public.coachings for each row execute function public.archiver_coaching();

-- Journal des actions, à notifier par « envois »
create table if not exists public.evenements_suivi (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,   -- auteur de l'action
  type text not null check (type in ('pause', 'reprise', 'fin', 'depart_associe', 'retrait_associe')),
  motif text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  notifie_at timestamptz
);
create index if not exists evenements_suivi_a_notifier on public.evenements_suivi(created_at) where notifie_at is null;
alter table public.evenements_suivi enable row level security;
drop policy if exists es_lecture on public.evenements_suivi;
create policy es_lecture on public.evenements_suivi for select to authenticated
  using (coach_id = auth.uid() or athlete_id = auth.uid());

-- Le coach garde la lecture de ses contrats (preuve), même après la fin du suivi
drop policy if exists contrats_lecture_coach on public.contrats;
create policy contrats_lecture_coach on public.contrats for select to authenticated using (coach_id = auth.uid());

-- Pause ou reprise, par le coach principal
create or replace function public.mettre_en_pause(a uuid, p_pause boolean, p_motif text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare ev uuid; deja boolean;
begin
  if not public.est_principal_de(a) then raise exception 'Seul le coach principal peut mettre ce suivi en pause'; end if;
  select bool_or(pause_depuis is not null) into deja from coachings where athlete_id = a;
  if p_pause and deja then raise exception 'Ce suivi est déjà en pause'; end if;
  if not p_pause and not deja then raise exception 'Ce suivi n’est pas en pause'; end if;
  if p_pause then
    update coachings set pause_depuis = now(), pause_motif = nullif(trim(p_motif), '') where athlete_id = a;
    delete from maj_en_attente where athlete_id = a;
  else
    update coachings set pause_depuis = null, pause_motif = null where athlete_id = a;
  end if;
  insert into evenements_suivi(athlete_id, coach_id, type, motif)
  values (a, auth.uid(), case when p_pause then 'pause' else 'reprise' end, nullif(trim(p_motif), ''))
  returning id into ev;
  return ev;
end $$;

-- Fin du suivi : le coach principal met fin à tout le suivi, un coach associé quitte le sien
create or replace function public.retirer_athlete(a uuid, p_motif text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare ev uuid; m text := nullif(trim(p_motif), ''); assoc jsonb; ctr jsonb; princ uuid;
begin
  perform set_config('suivi.motif', coalesce(m, ''), true);
  if public.est_principal_de(a) then
    select coalesce(jsonb_agg(jsonb_build_object('id', c.coach_id, 'nom', p.nom)), '[]'::jsonb) into assoc
      from coachings c join profiles p on p.id = c.coach_id where c.athlete_id = a and not c.principal;
    with fins as (
      update contrats set statut = case when statut = 'accepte' then 'resilie' else 'annule' end,
        fin_at = now(), fin_par = auth.uid(), motif_fin = coalesce(m, 'Fin du suivi par le coach')
      where athlete_id = a and coach_id = auth.uid() and statut in ('accepte', 'envoye')
      returning titre, statut)
    select coalesce(jsonb_agg(jsonb_build_object('titre', titre, 'statut', statut)), '[]'::jsonb) into ctr from fins;
    update invitations_coach set statut = 'annulee' where athlete_id = a and statut = 'envoyee';
    delete from maj_en_attente where athlete_id = a;
    delete from coachings where athlete_id = a;
    insert into evenements_suivi(athlete_id, coach_id, type, motif, details)
    values (a, auth.uid(), 'fin', m, jsonb_build_object('associes', assoc, 'contrats', ctr)) returning id into ev;
  elsif public.est_coach_de(a) then
    select coach_id into princ from coachings where athlete_id = a and principal;
    delete from coachings where athlete_id = a and coach_id = auth.uid();
    insert into evenements_suivi(athlete_id, coach_id, type, motif, details)
    values (a, auth.uid(), 'depart_associe', m, jsonb_build_object('principal', princ)) returning id into ev;
  else
    raise exception 'Cet athlète ne fait pas partie de tes athlètes';
  end if;
  return ev;
end $$;

-- Le coach principal retire un coach associé
create or replace function public.retirer_coach_associe(c uuid, p_motif text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare k coachings; ev uuid; m text := nullif(trim(p_motif), '');
begin
  select * into k from coachings where id = c;
  if k.id is null or k.principal or not public.est_principal_de(k.athlete_id) then raise exception 'Coach associé introuvable'; end if;
  perform set_config('suivi.motif', coalesce(m, ''), true);
  delete from coachings where id = c;
  insert into evenements_suivi(athlete_id, coach_id, type, motif, details)
  values (k.athlete_id, auth.uid(), 'retrait_associe', m,
    jsonb_build_object('associe', k.coach_id, 'nom', (select nom from profiles where id = k.coach_id))) returning id into ev;
  return ev;
end $$;

revoke all on function public.mettre_en_pause(uuid, boolean, text), public.retirer_athlete(uuid, text), public.retirer_coach_associe(uuid, text) from public, anon;
grant execute on function public.mettre_en_pause(uuid, boolean, text), public.retirer_athlete(uuid, text), public.retirer_coach_associe(uuid, text) to authenticated;

-- Tableau de bord : les athlètes en pause n'y apparaissent plus
create or replace function public.tableau_de_bord() returns table(
  athlete_id uuid, nom text, objectif_semaine int, seances_7j bigint, derniere_seance date,
  bilans_a_lire bigint, bilan_en_retard boolean, records jsonb)
language sql stable security definer set search_path = public as $$
  with mes as (
    select c.athlete_id from coachings c where c.coach_id = auth.uid() and c.pause_depuis is null
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
