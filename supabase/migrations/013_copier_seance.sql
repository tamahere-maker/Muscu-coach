-- Copie une séance (avec ses exercices, notes et supersets) à la fin d'un programme.
-- Le coach doit pouvoir modifier la séance d'origine et le programme de destination.
create or replace function public.copier_seance(s uuid, p uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare src seances; ns uuid;
begin
  select * into src from seances where id = s;
  if src.id is null or not public.peut_modifier_programme(src.programme_id) or not public.peut_modifier_programme(p) then
    raise exception 'Séance ou programme inaccessible';
  end if;
  insert into seances(programme_id, ordre, nom, note)
  values (p, coalesce((select max(ordre) + 1 from seances where programme_id = p), 0),
          src.nom || case when src.programme_id = p then ' (copie)' else '' end, src.note)
  returning id into ns;
  insert into seance_exercices(seance_id, ordre, exercice_id, series, reps, charge_kg, repos_s, note, groupe)
  select ns, ordre, exercice_id, series, reps, charge_kg, repos_s, note, groupe from seance_exercices where seance_id = s;
  return ns;
end $$;
revoke execute on function public.copier_seance(uuid, uuid) from public, anon;
grant execute on function public.copier_seance(uuid, uuid) to authenticated;
