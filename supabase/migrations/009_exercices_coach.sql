-- Exercices créés par un coach : visibles par lui, ses athlètes et les autres coachs de ses athlètes.
alter table public.exercices alter column sprite drop not null;
alter table public.exercices alter column source drop not null;
alter table public.exercices add column lien_video text;

create or replace function public.voit_exercice_de(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select c = auth.uid() or exists(select 1 from coachings k where k.coach_id = c
    and (k.athlete_id = auth.uid() or public.est_coach_de(k.athlete_id)))
$$;
revoke execute on function public.voit_exercice_de(uuid) from public, anon;
grant execute on function public.voit_exercice_de(uuid) to authenticated;

alter policy exercices_lecture on public.exercices using (cree_par is null or public.voit_exercice_de(cree_par));
create policy exercices_ajout on public.exercices for insert to authenticated
  with check (cree_par = auth.uid() and sprite is null and (select role from profiles where id = auth.uid()) = 'coach');
create policy exercices_maj on public.exercices for update to authenticated
  using (cree_par = auth.uid()) with check (cree_par = auth.uid() and sprite is null);
create policy exercices_suppr on public.exercices for delete to authenticated using (cree_par = auth.uid());
