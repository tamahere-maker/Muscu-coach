-- Notes du coach (séance, exercice) et supersets : des exercices consécutifs d'une séance qui partagent
-- le même `groupe` s'enchaînent sans repos, le repos venant après le dernier du groupe.
alter table public.seances add column note text not null default '';
alter table public.seance_exercices add column note text not null default '';
alter table public.seance_exercices add column groupe int;

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
    insert into seances(programme_id, ordre, nom, note) values (nouveau, s.ordre, s.nom, s.note) returning id into ns;
    insert into seance_exercices(seance_id, ordre, exercice_id, series, reps, charge_kg, repos_s, note, groupe)
    select ns, ordre, exercice_id, series, reps, charge_kg, repos_s, note, groupe from seance_exercices where seance_id = s.id;
  end loop;
  return nouveau;
end $$;
