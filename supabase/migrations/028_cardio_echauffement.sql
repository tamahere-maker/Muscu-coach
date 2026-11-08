-- Cardio : échauffement facultatif (en secondes) avant le premier bloc d'un exercice cardio.
-- Migration uniquement additive.
alter table public.seance_exercices
  add column if not exists echauffement_s int check (echauffement_s is null or echauffement_s between 1 and 7200);

-- Les copies de modèles et de séances gardent l'échauffement
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
    insert into seance_exercices(seance_id, ordre, exercice_id, series, reps, charge_kg, repos_s, note, groupe, duree_s, distance_m, intensite, echauffement_s)
    select ns, ordre, exercice_id, series, reps, charge_kg, repos_s, note, groupe, duree_s, distance_m, intensite, echauffement_s from seance_exercices where seance_id = s.id;
  end loop;
  return nouveau;
end $$;

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
  insert into seance_exercices(seance_id, ordre, exercice_id, series, reps, charge_kg, repos_s, note, groupe, duree_s, distance_m, intensite, echauffement_s)
  select ns, ordre, exercice_id, series, reps, charge_kg, repos_s, note, groupe, duree_s, distance_m, intensite, echauffement_s from seance_exercices where seance_id = s;
  return ns;
end $$;
