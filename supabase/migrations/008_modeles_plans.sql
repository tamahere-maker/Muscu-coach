-- Plans alimentaires préparés à l'avance : un plan sans athlète est un modèle du coach,
-- attribué ensuite (copie) à un athlète, comme les programmes.
alter table public.plans_nutrition alter column athlete_id drop not null;
alter table public.plans_nutrition add column nom text not null default 'Plan alimentaire';
alter table public.plans_nutrition add column description text not null default '';
alter table public.plans_nutrition add column modele_id uuid references public.plans_nutrition(id) on delete set null;
alter table public.repas add column note text not null default '';
create index plans_coach on public.plans_nutrition(coach_id) where athlete_id is null;

create or replace function public.peut_modifier_plan(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from plans_nutrition where id = p and
    case when athlete_id is null then coach_id = auth.uid() else public.est_coach_de(athlete_id) end)
$$;

-- Règles en plus des existantes (elles s'additionnent) : accès du coach à ses modèles de plan.
create policy pn_modele on public.plans_nutrition for all to authenticated
  using (athlete_id is null and coach_id = auth.uid()) with check (athlete_id is null and coach_id = auth.uid());
create policy repas_modele on public.repas for all to authenticated
  using (public.peut_modifier_plan(plan_id)) with check (public.peut_modifier_plan(plan_id));
create policy ra_modele on public.repas_aliments for all to authenticated
  using (public.peut_modifier_plan((select plan_id from repas r where r.id = repas_id)))
  with check (public.peut_modifier_plan((select plan_id from repas r where r.id = repas_id)));
create policy comp_modele on public.complements for all to authenticated
  using (public.peut_modifier_plan(plan_id)) with check (public.peut_modifier_plan(plan_id));

-- Copie un modèle de plan vers un athlète suivi ; il devient son plan actif.
create or replace function public.attribuer_plan(m uuid, a uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare src plans_nutrition; nouveau uuid; r repas; nr uuid;
begin
  select * into src from plans_nutrition where id = m and athlete_id is null and coach_id = auth.uid();
  if src.id is null then raise exception 'Plan introuvable'; end if;
  if not public.est_coach_de(a) then raise exception 'Cet athlète ne fait pas partie de tes athlètes'; end if;
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

revoke execute on function public.peut_modifier_plan(uuid), public.attribuer_plan(uuid, uuid) from public, anon;
grant execute on function public.peut_modifier_plan(uuid), public.attribuer_plan(uuid, uuid) to authenticated;
