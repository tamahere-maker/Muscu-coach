-- Coachs associés : le coach principal d'un athlète invite d'autres coachs, chacun sur un périmètre
-- (entraînement, nutrition ou les deux) et avec sa part du paiement du programme.
alter table public.coachings add column part_pct numeric(5,2) not null default 0 check (part_pct between 0 and 100);

create table public.invitations_coach (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  invite_par uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  perimetre text not null default 'Entraînement et nutrition' check (perimetre in ('Entraînement','Nutrition','Entraînement et nutrition')),
  part_pct numeric(5,2) not null default 0 check (part_pct between 0 and 100),
  token uuid not null unique default gen_random_uuid(),
  statut text not null default 'envoyee' check (statut in ('envoyee','acceptee','annulee')),
  coach_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
alter table public.invitations_coach enable row level security;
create policy ic_principal on public.invitations_coach for all to authenticated
  using (public.est_principal_de(athlete_id)) with check (public.est_principal_de(athlete_id) and invite_par = auth.uid());

-- Droits par périmètre : le coach principal a tout, un coach associé seulement son périmètre
create or replace function public.peut_entrainer(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from coachings where athlete_id = a and coach_id = auth.uid()
    and (principal or perimetre in ('Entraînement','Entraînement et nutrition')))
$$;
create or replace function public.peut_nourrir(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from coachings where athlete_id = a and coach_id = auth.uid()
    and (principal or perimetre in ('Nutrition','Entraînement et nutrition')))
$$;

create or replace function public.peut_modifier_programme(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from programmes where id = p and
    case when athlete_id is null then coach_id = auth.uid() else public.peut_entrainer(athlete_id) end)
$$;
create or replace function public.peut_modifier_plan(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from plans_nutrition where id = p and
    case when athlete_id is null then coach_id = auth.uid() else public.peut_nourrir(athlete_id) end)
$$;

alter policy prog_ecriture on public.programmes
  using (case when athlete_id is null then coach_id = auth.uid() else public.peut_entrainer(athlete_id) end)
  with check (case when athlete_id is null then coach_id = auth.uid() else public.peut_entrainer(athlete_id) end);
alter policy pn_ecriture on public.plans_nutrition
  using (public.peut_nourrir(athlete_id)) with check (public.peut_nourrir(athlete_id));
alter policy repas_ecriture on public.repas
  using (public.peut_nourrir(public.athlete_du_plan(plan_id))) with check (public.peut_nourrir(public.athlete_du_plan(plan_id)));
alter policy ra_ecriture on public.repas_aliments
  using (public.peut_nourrir(public.athlete_du_plan((select plan_id from repas r where r.id = repas_id))))
  with check (public.peut_nourrir(public.athlete_du_plan((select plan_id from repas r where r.id = repas_id))));
alter policy comp_ecriture on public.complements
  using (public.peut_nourrir(public.athlete_du_plan(plan_id))) with check (public.peut_nourrir(public.athlete_du_plan(plan_id)));

-- Attribution d'un modèle : réservée aux coachs qui ont le périmètre correspondant
create or replace function public.attribuer_modele(m uuid, a uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare src programmes; nouveau uuid; s seances; ns uuid;
begin
  select * into src from programmes where id = m and athlete_id is null and coach_id = auth.uid();
  if src.id is null then raise exception 'Modèle introuvable'; end if;
  if not public.peut_entrainer(a) then raise exception 'Cet athlète ne fait pas partie de tes athlètes pour l’entraînement'; end if;
  update programmes set actif = false where athlete_id = a and actif;
  insert into programmes(athlete_id, coach_id, nom, description, prix_eur, modele_id)
  values (a, auth.uid(), src.nom, src.description, src.prix_eur, src.id) returning id into nouveau;
  for s in select * from seances where programme_id = m order by ordre loop
    insert into seances(programme_id, ordre, nom, note) values (nouveau, s.ordre, s.nom, s.note) returning id into ns;
    insert into seance_exercices(seance_id, ordre, exercice_id, series, reps, charge_kg, repos_s, note, groupe)
    select ns, ordre, exercice_id, series, reps, charge_kg, repos_s, note, groupe from seance_exercices where seance_id = s.id;
  end loop;
  return nouveau;
end $$;

create or replace function public.attribuer_plan(m uuid, a uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare src plans_nutrition; nouveau uuid; r repas; nr uuid;
begin
  select * into src from plans_nutrition where id = m and athlete_id is null and coach_id = auth.uid();
  if src.id is null then raise exception 'Plan introuvable'; end if;
  if not public.peut_nourrir(a) then raise exception 'Cet athlète ne fait pas partie de tes athlètes pour la nutrition'; end if;
  update plans_nutrition set actif = false where athlete_id = a and actif;
  insert into plans_nutrition(athlete_id, coach_id, nom, description, kcal, proteines, glucides, lipides, modele_id)
  values (a, auth.uid(), src.nom, src.description, src.kcal, src.proteines, src.glucides, src.lipides, src.id) returning id into nouveau;
  for r in select * from repas where plan_id = m order by ordre loop
    insert into repas(plan_id, ordre, nom, note) values (nouveau, r.ordre, r.nom, r.note) returning id into nr;
    insert into repas_aliments(repas_id, ordre, aliment_id, grammes, alternatives)
    select nr, ordre, aliment_id, grammes, alternatives from repas_aliments where repas_id = r.id;
  end loop;
  insert into complements(plan_id, nom, dose, moment) select nouveau, nom, dose, moment from complements where plan_id = m;
  return nouveau;
end $$;

-- Ce qu'affiche la page d'invitation avant acceptation (le lien suffit à le lire)
create or replace function public.infos_invitation_coach(t uuid) returns table(athlete text, coach text, perimetre text, part_pct numeric)
language sql stable security definer set search_path = public as $$
  select a.nom, c.nom, i.perimetre, i.part_pct from invitations_coach i
  join profiles a on a.id = i.athlete_id join profiles c on c.id = i.invite_par
  where i.token = t and i.statut = 'envoyee'
$$;

-- Le coach invité accepte : il rejoint l'athlète comme coach associé
create or replace function public.accepter_invitation_coach(t uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv invitations_coach;
begin
  select * into inv from invitations_coach where token = t and statut = 'envoyee' for update;
  if inv.id is null then raise exception 'Invitation introuvable ou déjà utilisée'; end if;
  if (select role from profiles where id = auth.uid()) <> 'coach' then raise exception 'Seul un compte coach peut accepter cette invitation'; end if;
  if exists(select 1 from coachings where athlete_id = inv.athlete_id and coach_id = auth.uid()) then raise exception 'Tu suis déjà cet athlète'; end if;
  insert into coachings(athlete_id, coach_id, principal, perimetre, part_pct)
  values (inv.athlete_id, auth.uid(), false, inv.perimetre, inv.part_pct);
  update invitations_coach set statut = 'acceptee', coach_id = auth.uid(), accepted_at = now() where id = inv.id;
  return inv.athlete_id;
end $$;

revoke execute on function public.peut_entrainer(uuid), public.peut_nourrir(uuid), public.infos_invitation_coach(uuid), public.accepter_invitation_coach(uuid) from public, anon;
grant execute on function public.peut_entrainer(uuid), public.peut_nourrir(uuid), public.infos_invitation_coach(uuid), public.accepter_invitation_coach(uuid) to authenticated;
