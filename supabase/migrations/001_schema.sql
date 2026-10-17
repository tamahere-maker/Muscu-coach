-- Muscu Coach : schéma initial
create extension if not exists pgcrypto;

-- Comptes ------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('athlete','coach')),
  nom text not null default '',
  created_at timestamptz not null default now()
);

create table public.athlete_profiles (
  athlete_id uuid primary key references public.profiles(id) on delete cascade,
  niveau text check (niveau in ('Débutant','Intermédiaire','Avancé')),
  objectifs text[] not null default '{}',
  materiel text[] not null default '{}',
  seances_semaine int check (seances_semaine between 1 and 7),
  duree_min int check (duree_min between 10 and 240),
  poids_kg numeric(5,1),
  taille_cm numeric(5,1),
  age int,
  blessures text not null default '',
  updated_at timestamptz not null default now()
);

-- Lien coach / athlète : un athlète a un coach principal et peut avoir d'autres coachs
create table public.coachings (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  principal boolean not null default false,
  perimetre text not null default 'Entraînement et nutrition' check (perimetre in ('Entraînement','Nutrition','Entraînement et nutrition')),
  created_at timestamptz not null default now(),
  unique (athlete_id, coach_id)
);
create unique index coachings_un_principal on public.coachings(athlete_id) where principal;

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  token uuid not null unique default gen_random_uuid(),
  prix_eur numeric(8,2),
  statut text not null default 'envoyee' check (statut in ('envoyee','acceptee','annulee')),
  athlete_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- Bibliothèques -------------------------------------------------------------
create table public.exercices (
  id text primary key,
  nom text not null,
  consigne text,
  consigne_en text,
  muscles text[] not null default '{}',
  secondaires text[] not null default '{}',
  materiel text not null,
  niveau text,
  categorie text not null,
  force text,
  mecanique text,
  essentiel boolean not null default false,
  sprite int[] not null,          -- [planche, ligne, nb_lignes]
  source text not null,           -- identifiant Free Exercise DB
  cree_par uuid references public.profiles(id) on delete set null
);
create index exercices_muscle on public.exercices using gin (muscles);

create table public.aliments (
  id serial primary key,
  categorie text not null,
  nom text not null unique,
  kcal numeric(6,1) not null,
  proteines numeric(5,1) not null,
  glucides numeric(5,1) not null,
  lipides numeric(5,1) not null,
  unite_nom text,
  unite_pluriel text,
  unite_g numeric(6,1)
);

-- Programmes ----------------------------------------------------------------
create table public.programmes (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid references public.profiles(id) on delete set null,
  nom text not null,
  prix_eur numeric(8,2),
  semaine_en_cours int not null default 1,
  prochaine_seance int not null default 0,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.seances (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programmes(id) on delete cascade,
  ordre int not null,
  nom text not null
);
create table public.seance_exercices (
  id uuid primary key default gen_random_uuid(),
  seance_id uuid not null references public.seances(id) on delete cascade,
  ordre int not null,
  exercice_id text not null references public.exercices(id),
  series int not null default 3,
  reps int not null default 10,
  charge_kg numeric(6,1) not null default 0,
  repos_s int not null default 90
);

-- Suivi des séances ----------------------------------------------------------
create table public.seances_realisees (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  seance_id uuid references public.seances(id) on delete set null,
  nom text not null,
  date date not null default current_date,
  created_at timestamptz not null default now()
);
create table public.series_realisees (
  id uuid primary key default gen_random_uuid(),
  seance_realisee_id uuid not null references public.seances_realisees(id) on delete cascade,
  exercice_id text not null references public.exercices(id),
  exercice_prevu_id text references public.exercices(id),   -- rempli quand l'athlète a pris une substitution
  ordre int not null,
  reps int not null,
  charge_kg numeric(6,1) not null
);

-- Nutrition -----------------------------------------------------------------
create table public.plans_nutrition (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid references public.profiles(id) on delete set null,
  kcal int, proteines int, glucides int, lipides int,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.repas (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans_nutrition(id) on delete cascade,
  ordre int not null,
  nom text not null
);
create table public.repas_aliments (
  id uuid primary key default gen_random_uuid(),
  repas_id uuid not null references public.repas(id) on delete cascade,
  ordre int not null,
  aliment_id int not null references public.aliments(id),
  grammes numeric(7,1) not null,
  alternatives int[] not null default '{}'   -- alternatives proposées par le coach
);
create table public.complements (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans_nutrition(id) on delete cascade,
  nom text not null, dose text not null default '', moment text not null default ''
);
create table public.journal_aliments (
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  repas_aliment_id uuid not null references public.repas_aliments(id) on delete cascade,
  aliment_id int references public.aliments(id),   -- null = aliment du plan
  grammes numeric(7,1),                            -- null = quantité du plan
  confirme boolean not null default false,
  primary key (athlete_id, date, repas_aliment_id)
);
create table public.prises_complements (
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  complement_id uuid not null references public.complements(id) on delete cascade,
  date date not null,
  primary key (athlete_id, complement_id, date)
);

-- Fonctions d'accès -----------------------------------------------------------
create or replace function public.est_coach_de(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from coachings where athlete_id = a and coach_id = auth.uid())
$$;
create or replace function public.est_principal_de(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from coachings where athlete_id = a and coach_id = auth.uid() and principal)
$$;
create or replace function public.peut_voir(a uuid) returns boolean
language sql stable as $$ select a = auth.uid() or public.est_coach_de(a) $$;
create or replace function public.athlete_du_programme(p uuid) returns uuid
language sql stable security definer set search_path = public as $$ select athlete_id from programmes where id = p $$;
create or replace function public.athlete_du_plan(p uuid) returns uuid
language sql stable security definer set search_path = public as $$ select athlete_id from plans_nutrition where id = p $$;

-- Profil créé automatiquement à l'inscription (rôle et nom passés dans les métadonnées)
create or replace function public.creer_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, role, nom)
  values (new.id, coalesce(new.raw_user_meta_data->>'role','athlete'), coalesce(new.raw_user_meta_data->>'nom',''));
  if coalesce(new.raw_user_meta_data->>'role','athlete') = 'athlete' then
    insert into athlete_profiles(athlete_id) values (new.id);
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.creer_profil();

-- Acceptation d'une invitation : l'athlète connecté devient suivi par le coach, qui en est le coach principal
create or replace function public.accepter_invitation(t uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv invitations;
begin
  select * into inv from invitations where token = t and statut = 'envoyee' for update;
  if inv.id is null then raise exception 'Invitation introuvable ou déjà utilisée'; end if;
  if (select role from profiles where id = auth.uid()) <> 'athlete' then raise exception 'Seul un compte athlète peut accepter une invitation'; end if;
  insert into coachings(athlete_id, coach_id, principal)
  values (auth.uid(), inv.coach_id, not exists(select 1 from coachings where athlete_id = auth.uid() and principal))
  on conflict (athlete_id, coach_id) do nothing;
  update invitations set statut = 'acceptee', athlete_id = auth.uid(), accepted_at = now() where id = inv.id;
  return inv.coach_id;
end $$;

-- Sécurité ligne par ligne ----------------------------------------------------
alter table public.profiles enable row level security;
alter table public.athlete_profiles enable row level security;
alter table public.coachings enable row level security;
alter table public.invitations enable row level security;
alter table public.exercices enable row level security;
alter table public.aliments enable row level security;
alter table public.programmes enable row level security;
alter table public.seances enable row level security;
alter table public.seance_exercices enable row level security;
alter table public.seances_realisees enable row level security;
alter table public.series_realisees enable row level security;
alter table public.plans_nutrition enable row level security;
alter table public.repas enable row level security;
alter table public.repas_aliments enable row level security;
alter table public.complements enable row level security;
alter table public.journal_aliments enable row level security;
alter table public.prises_complements enable row level security;

-- profils : chacun voit le sien, ceux de ses athlètes, et les coachs qui le suivent
create policy profils_lecture on public.profiles for select to authenticated using (
  id = auth.uid() or public.est_coach_de(id)
  or exists(select 1 from coachings c where c.coach_id = profiles.id and c.athlete_id = auth.uid())
  or exists(select 1 from coachings c where c.coach_id = profiles.id and public.est_coach_de(c.athlete_id)));
create policy profils_maj on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy ap_lecture on public.athlete_profiles for select to authenticated using (public.peut_voir(athlete_id));
create policy ap_maj on public.athlete_profiles for update to authenticated using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());

create policy coachings_lecture on public.coachings for select to authenticated using (athlete_id = auth.uid() or public.est_coach_de(athlete_id));
create policy coachings_ajout on public.coachings for insert to authenticated with check (public.est_principal_de(athlete_id) and not principal);
create policy coachings_maj on public.coachings for update to authenticated using (public.est_principal_de(athlete_id)) with check (public.est_principal_de(athlete_id));
create policy coachings_retrait on public.coachings for delete to authenticated using (public.est_principal_de(athlete_id) and not principal);

create policy invitations_coach on public.invitations for all to authenticated using (coach_id = auth.uid()) with check (coach_id = auth.uid());

create policy exercices_lecture on public.exercices for select to authenticated using (true);
create policy aliments_lecture on public.aliments for select to authenticated using (true);

create policy prog_lecture on public.programmes for select to authenticated using (public.peut_voir(athlete_id));
create policy prog_ecriture on public.programmes for all to authenticated using (public.est_coach_de(athlete_id)) with check (public.est_coach_de(athlete_id));
create policy seances_lecture on public.seances for select to authenticated using (public.peut_voir(public.athlete_du_programme(programme_id)));
create policy seances_ecriture on public.seances for all to authenticated using (public.est_coach_de(public.athlete_du_programme(programme_id))) with check (public.est_coach_de(public.athlete_du_programme(programme_id)));
create policy se_lecture on public.seance_exercices for select to authenticated using (public.peut_voir(public.athlete_du_programme((select programme_id from seances s where s.id = seance_id))));
create policy se_ecriture on public.seance_exercices for all to authenticated
  using (public.est_coach_de(public.athlete_du_programme((select programme_id from seances s where s.id = seance_id))))
  with check (public.est_coach_de(public.athlete_du_programme((select programme_id from seances s where s.id = seance_id))));

create policy sr_lecture on public.seances_realisees for select to authenticated using (public.peut_voir(athlete_id));
create policy sr_ecriture on public.seances_realisees for all to authenticated using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy ser_lecture on public.series_realisees for select to authenticated using (public.peut_voir((select athlete_id from seances_realisees r where r.id = seance_realisee_id)));
create policy ser_ecriture on public.series_realisees for all to authenticated
  using ((select athlete_id from seances_realisees r where r.id = seance_realisee_id) = auth.uid())
  with check ((select athlete_id from seances_realisees r where r.id = seance_realisee_id) = auth.uid());

create policy pn_lecture on public.plans_nutrition for select to authenticated using (public.peut_voir(athlete_id));
create policy pn_ecriture on public.plans_nutrition for all to authenticated using (public.est_coach_de(athlete_id)) with check (public.est_coach_de(athlete_id));
create policy repas_lecture on public.repas for select to authenticated using (public.peut_voir(public.athlete_du_plan(plan_id)));
create policy repas_ecriture on public.repas for all to authenticated using (public.est_coach_de(public.athlete_du_plan(plan_id))) with check (public.est_coach_de(public.athlete_du_plan(plan_id)));
create policy ra_lecture on public.repas_aliments for select to authenticated using (public.peut_voir(public.athlete_du_plan((select plan_id from repas r where r.id = repas_id))));
create policy ra_ecriture on public.repas_aliments for all to authenticated
  using (public.est_coach_de(public.athlete_du_plan((select plan_id from repas r where r.id = repas_id))))
  with check (public.est_coach_de(public.athlete_du_plan((select plan_id from repas r where r.id = repas_id))));
create policy comp_lecture on public.complements for select to authenticated using (public.peut_voir(public.athlete_du_plan(plan_id)));
create policy comp_ecriture on public.complements for all to authenticated using (public.est_coach_de(public.athlete_du_plan(plan_id))) with check (public.est_coach_de(public.athlete_du_plan(plan_id)));

create policy ja_lecture on public.journal_aliments for select to authenticated using (public.peut_voir(athlete_id));
create policy ja_ecriture on public.journal_aliments for all to authenticated using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy pc_lecture on public.prises_complements for select to authenticated using (public.peut_voir(athlete_id));
create policy pc_ecriture on public.prises_complements for all to authenticated using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());

revoke execute on function public.creer_profil() from public, anon, authenticated;

-- Le rôle ne se change pas depuis l'app : seul le nom est modifiable
revoke update on public.profiles from authenticated;
grant update (nom) on public.profiles to authenticated;

-- L'athlète fait avancer son programme à la fin d'une séance, sans pouvoir modifier le reste
create or replace function public.avancer_programme(p uuid) returns void
language sql security definer set search_path = public as $$
  update programmes set prochaine_seance = prochaine_seance + 1 where id = p and athlete_id = auth.uid()
$$;
