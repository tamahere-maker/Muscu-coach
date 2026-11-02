-- Nutrition enrichie (additif, rien n'est supprimé) :
--  * jours d'entraînement du programme et plan différent les jours de repos ;
--  * objectif d'eau et compteur de l'athlète ;
--  * recettes du coach, réutilisables dans les plans (les aliments sont copiés dans le repas).
-- La liste de courses est calculée dans l'app à partir du plan : pas de table.

-- Jours d'entraînement prévus par le programme (1 = lundi … 7 = dimanche)
alter table public.programmes add column if not exists jours_entrainement int[] not null default '{}';

-- Plan : jours différents, objectifs du jour de repos, objectif d'eau
alter table public.plans_nutrition
  add column if not exists jours_differents boolean not null default false,
  add column if not exists kcal_repos int,
  add column if not exists proteines_repos int,
  add column if not exists glucides_repos int,
  add column if not exists lipides_repos int,
  add column if not exists eau_ml int check (eau_ml is null or eau_ml between 0 and 10000);

-- Repas d'un type de jour : tous les jours, jour d'entraînement ou jour de repos
alter table public.repas add column if not exists type_jour text not null default 'tous'
  check (type_jour in ('tous', 'entrainement', 'repos'));
-- Nom de la recette dont vient l'aliment (affiché à l'athlète)
alter table public.repas_aliments add column if not exists recette text;

-- Type du jour choisi par l'athlète (remplace le calcul automatique pour ce jour)
create table if not exists public.types_jours (
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  type text not null check (type in ('entrainement', 'repos')),
  primary key (athlete_id, date)
);
alter table public.types_jours enable row level security;
create policy tj_lecture on public.types_jours for select to authenticated using (public.peut_voir(athlete_id));
create policy tj_ecriture on public.types_jours for all to authenticated
  using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());

-- Eau bue par jour
create table if not exists public.hydratation (
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  ml int not null default 0 check (ml between 0 and 20000),
  primary key (athlete_id, date)
);
alter table public.hydratation enable row level security;
create policy hy_lecture on public.hydratation for select to authenticated using (public.peut_voir(athlete_id));
create policy hy_ecriture on public.hydratation for all to authenticated
  using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());

-- Recettes du coach
create table if not exists public.recettes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  nom text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.recette_aliments (
  id uuid primary key default gen_random_uuid(),
  recette_id uuid not null references public.recettes(id) on delete cascade,
  ordre int not null default 0,
  aliment_id int not null references public.aliments(id),
  grammes numeric(7,1) not null,
  unite text check (unite in ('g', 'ml', 'cac', 'cas', 'u'))
);
create index if not exists recettes_coach on public.recettes(coach_id);
create index if not exists recette_aliments_recette on public.recette_aliments(recette_id);
alter table public.recettes enable row level security;
alter table public.recette_aliments enable row level security;
create policy rec_coach on public.recettes for all to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());
create policy reca_coach on public.recette_aliments for all to authenticated
  using (exists(select 1 from public.recettes r where r.id = recette_id and r.coach_id = auth.uid()))
  with check (exists(select 1 from public.recettes r where r.id = recette_id and r.coach_id = auth.uid()));

-- Sépare un plan en jour d'entraînement / jour de repos : les repas actuels deviennent ceux du jour
-- d'entraînement et sont copiés pour le jour de repos (le coach ajuste ensuite).
create or replace function public.separer_jours(p uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare r repas; nr uuid;
begin
  if not public.peut_modifier_plan(p) then raise exception 'Plan introuvable'; end if;
  if (select jours_differents from plans_nutrition where id = p) then return; end if;
  for r in select * from repas where plan_id = p and type_jour = 'tous' order by ordre loop
    update repas set type_jour = 'entrainement' where id = r.id;
    insert into repas(plan_id, ordre, nom, note, type_jour) values (p, r.ordre, r.nom, r.note, 'repos') returning id into nr;
    insert into repas_aliments(repas_id, ordre, aliment_id, grammes, alternatives, unite, recette)
    select nr, ordre, aliment_id, grammes, alternatives, unite, recette from repas_aliments where repas_id = r.id;
  end loop;
  update plans_nutrition set jours_differents = true,
    kcal_repos = coalesce(kcal_repos, kcal), proteines_repos = coalesce(proteines_repos, proteines),
    glucides_repos = coalesce(glucides_repos, glucides), lipides_repos = coalesce(lipides_repos, lipides)
  where id = p;
end $$;

-- Revient à un plan unique : les repas du jour d'entraînement servent tous les jours,
-- ceux du jour de repos sont retirés.
create or replace function public.reunir_jours(p uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not public.peut_modifier_plan(p) then raise exception 'Plan introuvable'; end if;
  delete from repas where plan_id = p and type_jour = 'repos';
  update repas set type_jour = 'tous' where plan_id = p;
  update plans_nutrition set jours_differents = false where id = p;
end $$;

-- Ajoute une recette à un repas (copie de ses aliments et de sa note)
create or replace function public.ajouter_recette(rec uuid, rp uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare n text; nt text; base int;
begin
  select nom, note into n, nt from recettes where id = rec and coach_id = auth.uid();
  if n is null then raise exception 'Recette introuvable'; end if;
  if not public.peut_modifier_plan((select plan_id from repas where id = rp)) then raise exception 'Repas introuvable'; end if;
  select coalesce(max(ordre) + 1, 0) into base from repas_aliments where repas_id = rp;
  insert into repas_aliments(repas_id, ordre, aliment_id, grammes, unite, recette)
  select rp, base + row_number() over (order by ordre) - 1, aliment_id, grammes, unite, n from recette_aliments where recette_id = rec;
  -- La note de la recette (préparation) rejoint la note du repas
  if nt <> '' then
    update repas set note = case when note = '' then n || ' : ' || nt else note || ' · ' || n || ' : ' || nt end where id = rp;
  end if;
end $$;

-- Copie d'un modèle de plan : reprend aussi les jours, l'eau et les recettes
create or replace function public.attribuer_plan(m uuid, a uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare src plans_nutrition; nouveau uuid; r repas; nr uuid;
begin
  select * into src from plans_nutrition where id = m and athlete_id is null and coach_id = auth.uid();
  if src.id is null then raise exception 'Plan introuvable'; end if;
  if not public.peut_nourrir(a) then raise exception 'Cet athlète ne fait pas partie de tes athlètes pour la nutrition'; end if;
  update plans_nutrition set actif = false where athlete_id = a and actif;
  insert into plans_nutrition(athlete_id, coach_id, nom, description, kcal, proteines, glucides, lipides, modele_id,
    jours_differents, kcal_repos, proteines_repos, glucides_repos, lipides_repos, eau_ml)
  values (a, auth.uid(), src.nom, src.description, src.kcal, src.proteines, src.glucides, src.lipides, src.id,
    src.jours_differents, src.kcal_repos, src.proteines_repos, src.glucides_repos, src.lipides_repos, src.eau_ml) returning id into nouveau;
  for r in select * from repas where plan_id = m order by ordre loop
    insert into repas(plan_id, ordre, nom, note, type_jour) values (nouveau, r.ordre, r.nom, r.note, r.type_jour) returning id into nr;
    insert into repas_aliments(repas_id, ordre, aliment_id, grammes, alternatives, unite, recette)
    select nr, ordre, aliment_id, grammes, alternatives, unite, recette from repas_aliments where repas_id = r.id;
  end loop;
  insert into complements(plan_id, nom, dose, moment) select nouveau, nom, dose, moment from complements where plan_id = m;
  return nouveau;
end $$;

-- Copie d'un modèle de programme : reprend aussi les jours d'entraînement
create or replace function public.attribuer_modele(m uuid, a uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare src programmes; nouveau uuid; s seances; ns uuid;
begin
  select * into src from programmes where id = m and athlete_id is null and coach_id = auth.uid();
  if src.id is null then raise exception 'Modèle introuvable'; end if;
  if not public.peut_entrainer(a) then raise exception 'Cet athlète ne fait pas partie de tes athlètes pour l’entraînement'; end if;
  update programmes set actif = false where athlete_id = a and actif;
  insert into programmes(athlete_id, coach_id, nom, description, prix_eur, modele_id, jours_entrainement)
  values (a, auth.uid(), src.nom, src.description, src.prix_eur, src.id, src.jours_entrainement) returning id into nouveau;
  for s in select * from seances where programme_id = m order by ordre loop
    insert into seances(programme_id, ordre, nom, note) values (nouveau, s.ordre, s.nom, s.note) returning id into ns;
    insert into seance_exercices(seance_id, ordre, exercice_id, series, reps, charge_kg, repos_s, note, groupe)
    select ns, ordre, exercice_id, series, reps, charge_kg, repos_s, note, groupe from seance_exercices where seance_id = s.id;
  end loop;
  return nouveau;
end $$;

revoke execute on function public.separer_jours(uuid), public.reunir_jours(uuid), public.ajouter_recette(uuid, uuid) from public, anon;
grant execute on function public.separer_jours(uuid), public.reunir_jours(uuid), public.ajouter_recette(uuid, uuid) to authenticated;
