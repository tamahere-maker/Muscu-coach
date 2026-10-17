-- Modèles de programmes : un programme sans athlète appartient à son coach, qui peut le préparer à l'avance
-- puis l'attribuer (copie) à un athlète.
alter table public.programmes alter column athlete_id drop not null;
alter table public.programmes add column description text not null default '';
alter table public.programmes add column modele_id uuid references public.programmes(id) on delete set null;
create index programmes_coach on public.programmes(coach_id) where athlete_id is null;

create or replace function public.peut_modifier_programme(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from programmes where id = p and
    case when athlete_id is null then coach_id = auth.uid() else public.est_coach_de(athlete_id) end)
$$;
create or replace function public.peut_lire_programme(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.peut_modifier_programme(p) or exists(select 1 from programmes where id = p and athlete_id = auth.uid())
$$;

drop policy prog_lecture on public.programmes;
drop policy prog_ecriture on public.programmes;
drop policy seances_lecture on public.seances;
drop policy seances_ecriture on public.seances;
drop policy se_lecture on public.seance_exercices;
drop policy se_ecriture on public.seance_exercices;

create policy prog_lecture on public.programmes for select to authenticated
  using (case when athlete_id is null then coach_id = auth.uid() else public.peut_voir(athlete_id) end);
create policy prog_ecriture on public.programmes for all to authenticated
  using (case when athlete_id is null then coach_id = auth.uid() else public.est_coach_de(athlete_id) end)
  with check (case when athlete_id is null then coach_id = auth.uid() else public.est_coach_de(athlete_id) end);
create policy seances_lecture on public.seances for select to authenticated using (public.peut_lire_programme(programme_id));
create policy seances_ecriture on public.seances for all to authenticated
  using (public.peut_modifier_programme(programme_id)) with check (public.peut_modifier_programme(programme_id));
create policy se_lecture on public.seance_exercices for select to authenticated
  using (public.peut_lire_programme((select programme_id from seances s where s.id = seance_id)));
create policy se_ecriture on public.seance_exercices for all to authenticated
  using (public.peut_modifier_programme((select programme_id from seances s where s.id = seance_id)))
  with check (public.peut_modifier_programme((select programme_id from seances s where s.id = seance_id)));

-- Copie un modèle vers un athlète suivi ; le nouveau programme devient son programme actif.
create or replace function public.attribuer_modele(m uuid, a uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare src programmes; nouveau uuid; s seances; ns uuid;
begin
  select * into src from programmes where id = m and athlete_id is null and coach_id = auth.uid();
  if src.id is null then raise exception 'Modèle introuvable'; end if;
  if not public.est_coach_de(a) then raise exception 'Cet athlète ne fait pas partie de tes athlètes'; end if;
  update programmes set actif = false where athlete_id = a and actif;
  insert into programmes(athlete_id, coach_id, nom, description, prix_eur, modele_id)
  values (a, auth.uid(), src.nom, src.description, src.prix_eur, src.id) returning id into nouveau;
  for s in select * from seances where programme_id = m order by ordre loop
    insert into seances(programme_id, ordre, nom) values (nouveau, s.ordre, s.nom) returning id into ns;
    insert into seance_exercices(seance_id, ordre, exercice_id, series, reps, charge_kg, repos_s)
    select ns, ordre, exercice_id, series, reps, charge_kg, repos_s from seance_exercices where seance_id = s.id;
  end loop;
  return nouveau;
end $$;

revoke execute on function public.peut_modifier_programme(uuid), public.peut_lire_programme(uuid), public.attribuer_modele(uuid, uuid) from public, anon;
grant execute on function public.peut_modifier_programme(uuid), public.peut_lire_programme(uuid), public.attribuer_modele(uuid, uuid) to authenticated;
