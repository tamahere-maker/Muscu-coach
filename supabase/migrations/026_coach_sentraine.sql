-- Le coach s'entraîne lui-même : il peut s'attribuer un programme et un plan alimentaire
-- (lui-même comme athlète) et les suivre comme un athlète. Aucune ligne de coaching n'est créée :
-- il n'apparaît donc ni dans sa liste d'athlètes, ni dans le tableau de bord, ni dans la messagerie.

-- Droits d'entraînement et de nutrition : en plus de ses athlètes, un coach a tous les droits sur lui-même
create or replace function public.peut_entrainer(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from coachings where athlete_id = a and coach_id = auth.uid()
    and (principal or perimetre in ('Entraînement','Entraînement et nutrition')))
    or (a = auth.uid() and exists(select 1 from profiles where id = a and role = 'coach'))
$$;
create or replace function public.peut_nourrir(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from coachings where athlete_id = a and coach_id = auth.uid()
    and (principal or perimetre in ('Nutrition','Entraînement et nutrition')))
    or (a = auth.uid() and exists(select 1 from profiles where id = a and role = 'coach'))
$$;

-- Fiche sportive du coach (matériel, fuseau des rappels…), créée à l'ouverture de « Moi »
create or replace function public.ouvrir_espace_perso() returns void
language sql security definer set search_path = public as $$
  insert into athlete_profiles(athlete_id)
  select id from profiles where id = auth.uid() and role = 'coach'
  on conflict (athlete_id) do nothing
$$;
revoke execute on function public.ouvrir_espace_perso() from public, anon;
grant execute on function public.ouvrir_espace_perso() to authenticated;
