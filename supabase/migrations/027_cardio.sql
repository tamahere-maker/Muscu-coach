-- Cardio : objectifs en durée / distance / intensité dans les programmes, saisie durée, distance,
-- fréquence cardiaque et ressenti (RPE) en séance, et nouveaux exercices (natation, extérieur, HIIT).
-- Migration uniquement additive.

-- Objectif d'une ligne de séance. Pour une ligne cardio, « series » = nombre de blocs (1 = continu,
-- plusieurs = intervalles), « repos_s » = récupération entre les blocs, duree_s / distance_m = objectif d'un bloc.
alter table public.seance_exercices
  add column if not exists duree_s int check (duree_s is null or duree_s between 1 and 86400),
  add column if not exists distance_m int check (distance_m is null or distance_m between 1 and 1000000),
  add column if not exists intensite text check (intensite is null or length(intensite) <= 120);

-- Ce qui a été fait, bloc par bloc (reps et charge_kg restent à 0 pour le cardio)
alter table public.series_realisees
  add column if not exists duree_s int check (duree_s is null or duree_s between 1 and 86400),
  add column if not exists distance_m int check (distance_m is null or distance_m between 1 and 1000000),
  add column if not exists fc_moy int check (fc_moy is null or fc_moy between 30 and 250),
  add column if not exists rpe int check (rpe is null or rpe between 1 and 10);

-- Les copies de modèles et de séances gardent les objectifs cardio
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
    insert into seance_exercices(seance_id, ordre, exercice_id, series, reps, charge_kg, repos_s, note, groupe, duree_s, distance_m, intensite)
    select ns, ordre, exercice_id, series, reps, charge_kg, repos_s, note, groupe, duree_s, distance_m, intensite from seance_exercices where seance_id = s.id;
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
  insert into seance_exercices(seance_id, ordre, exercice_id, series, reps, charge_kg, repos_s, note, groupe, duree_s, distance_m, intensite)
  select ns, ordre, exercice_id, series, reps, charge_kg, repos_s, note, groupe, duree_s, distance_m, intensite from seance_exercices where seance_id = s;
  return ns;
end $$;

-- Nouveaux exercices cardio, partagés avec tous les coachs
insert into public.exercices(id, nom, consigne, muscles, secondaires, materiel, niveau, categorie, essentiel, source) values
  ('cardio-crawl', 'Natation crawl', 'Corps allongé, gainé. Bras qui tirent sous le corps jusqu''à la cuisse, battements de jambes réguliers depuis la hanche. Respire sur le côté tous les 2 ou 3 temps.', '{Grand dorsal}', '{Épaules,Triceps,Abdominaux,Quadriceps}', 'Autre', 'Intermédiaire', 'Cardio', true, 'Muscu Coach'),
  ('cardio-brasse', 'Natation brasse', 'Tirage des bras en cœur, puis ciseau des jambes talons vers les fesses. Glisse bras tendus après chaque coup de pied.', '{Pectoraux}', '{Adducteurs,Quadriceps,Épaules}', 'Autre', 'Débutant', 'Cardio', true, 'Muscu Coach'),
  ('cardio-dos', 'Natation dos crawlé', 'Sur le dos, tête dans l''axe, hanches hautes. Bras alternés qui entrent dans l''eau dans le prolongement de l''épaule, battements de jambes continus.', '{Grand dorsal}', '{Épaules,Lombaires,Quadriceps}', 'Autre', 'Intermédiaire', 'Cardio', false, 'Muscu Coach'),
  ('cardio-papillon', 'Natation papillon', 'Les deux bras ensemble, ondulation du corps depuis la poitrine, deux battements de jambes par cycle de bras.', '{Épaules}', '{Grand dorsal,Pectoraux,Abdominaux}', 'Autre', 'Avancé', 'Cardio', false, 'Muscu Coach'),
  ('cardio-nage-libre', 'Natation (nage au choix)', 'Nage continue dans la nage de ton choix, à l''allure demandée par ton coach. Note la distance à la fin.', '{Grand dorsal}', '{Épaules,Pectoraux,Quadriceps}', 'Autre', 'Débutant', 'Cardio', true, 'Muscu Coach'),
  ('cardio-aquajogging', 'Aquajogging', 'Course dans l''eau sans toucher le fond (ceinture de flottaison si besoin). Buste droit, genoux qui montent, bras actifs.', '{Quadriceps}', '{Ischio-jambiers,Fessiers,Abdominaux}', 'Autre', 'Débutant', 'Cardio', false, 'Muscu Coach'),
  ('cardio-course', 'Course à pied', 'Course en extérieur. Foulée souple, buste légèrement penché vers l''avant, appuis sous le bassin. Respecte l''allure ou la zone cardio demandée.', '{Quadriceps}', '{Ischio-jambiers,Mollets,Fessiers}', 'Poids du corps', 'Débutant', 'Cardio', true, 'Muscu Coach'),
  ('cardio-fractionne', 'Fractionné course', 'Alterne blocs rapides et récupération en trottinant. Échauffe-toi 10 min avant. Chaque bloc rapide se court à allure régulière, sans partir trop vite.', '{Quadriceps}', '{Ischio-jambiers,Mollets,Fessiers}', 'Poids du corps', 'Intermédiaire', 'Cardio', true, 'Muscu Coach'),
  ('cardio-cotes', 'Course en côte', 'Monte la côte en petites foulées dynamiques, genoux hauts, bras actifs. Redescends en marchant ou en trottinant pour récupérer.', '{Fessiers}', '{Quadriceps,Mollets,Ischio-jambiers}', 'Poids du corps', 'Intermédiaire', 'Cardio', false, 'Muscu Coach'),
  ('cardio-sprint', 'Sprint', 'Sprint à fond sur une courte distance (30 à 100 m). Récupération complète entre chaque sprint.', '{Quadriceps}', '{Ischio-jambiers,Fessiers,Mollets}', 'Poids du corps', 'Avancé', 'Cardio', false, 'Muscu Coach'),
  ('cardio-marche-rapide', 'Marche rapide', 'Marche soutenue, pas déroulés du talon à la pointe, bras qui balancent. Tu dois pouvoir parler mais pas chanter.', '{Quadriceps}', '{Mollets,Fessiers}', 'Poids du corps', 'Débutant', 'Cardio', true, 'Muscu Coach'),
  ('cardio-marche-nordique', 'Marche nordique', 'Marche avec bâtons plantés en arrière du corps, bras tendus qui poussent. Grand pas, buste légèrement penché.', '{Quadriceps}', '{Grand dorsal,Triceps,Fessiers}', 'Autre', 'Débutant', 'Cardio', false, 'Muscu Coach'),
  ('cardio-randonnee', 'Randonnée', 'Marche en terrain varié, à rythme régulier. Note la durée, la distance et si possible le dénivelé dans la note au coach.', '{Quadriceps}', '{Fessiers,Mollets,Ischio-jambiers}', 'Poids du corps', 'Débutant', 'Cardio', false, 'Muscu Coach'),
  ('cardio-velo-route', 'Vélo de route', 'Sortie à vélo en extérieur. Cadence régulière (80 à 95 tours par minute), selle à la bonne hauteur, buste relâché.', '{Quadriceps}', '{Fessiers,Mollets,Ischio-jambiers}', 'Autre', 'Débutant', 'Cardio', true, 'Muscu Coach'),
  ('cardio-vtt', 'VTT', 'Sortie à VTT. Reste souple sur le vélo, regarde loin, adapte le braquet avant les montées.', '{Quadriceps}', '{Fessiers,Mollets,Avant-bras}', 'Autre', 'Intermédiaire', 'Cardio', false, 'Muscu Coach'),
  ('cardio-velo-fractionne', 'Vélo d''appartement fractionné', 'Alterne blocs à forte résistance ou cadence rapide et récupération en pédalant doucement.', '{Quadriceps}', '{Fessiers,Mollets}', 'Machine', 'Intermédiaire', 'Cardio', false, 'Muscu Coach'),
  ('cardio-airbike', 'Air bike', 'Vélo à ventilateur : pousse avec les jambes et tire-pousse avec les bras en même temps. Idéal en intervalles courts.', '{Quadriceps}', '{Épaules,Pectoraux,Grand dorsal}', 'Machine', 'Intermédiaire', 'Cardio', false, 'Muscu Coach'),
  ('cardio-rameur-fractionne', 'Rameur fractionné', 'Blocs rapides au rameur avec récupération en ramant doucement. Garde l''ordre jambes, buste, bras, puis le retour inverse.', '{Quadriceps}', '{Grand dorsal,Milieu du dos,Biceps,Fessiers}', 'Machine', 'Intermédiaire', 'Cardio', false, 'Muscu Coach'),
  ('cardio-skierg', 'SkiErg', 'Debout face à la machine, tire les poignées de haut en bas en fléchissant hanches et genoux, comme en ski de fond.', '{Grand dorsal}', '{Triceps,Abdominaux,Épaules}', 'Machine', 'Intermédiaire', 'Cardio', false, 'Muscu Coach'),
  ('cardio-hiit', 'HIIT au poids du corps', 'Circuit d''exercices au poids du corps (burpees, jumping jacks, mountain climbers…) à fond pendant le temps d''effort, puis récupération.', '{Quadriceps}', '{Épaules,Abdominaux,Fessiers}', 'Poids du corps', 'Intermédiaire', 'Cardio', true, 'Muscu Coach'),
  ('cardio-tabata', 'Tabata', '8 tours de 20 s à fond et 10 s de récupération sur un même exercice (vélo, burpees, rameur…). 4 minutes très intenses.', '{Quadriceps}', '{Épaules,Abdominaux}', 'Poids du corps', 'Avancé', 'Cardio', false, 'Muscu Coach'),
  ('cardio-burpees', 'Burpees', 'Accroupi, mains au sol, saute pieds en arrière en planche, poitrine au sol, reviens pieds sous les mains et saute bras en l''air.', '{Quadriceps}', '{Pectoraux,Épaules,Triceps,Abdominaux}', 'Poids du corps', 'Intermédiaire', 'Cardio', true, 'Muscu Coach'),
  ('cardio-jumping-jacks', 'Jumping jacks', 'Saute en écartant les jambes et en levant les bras au-dessus de la tête, puis reviens pieds joints bras le long du corps.', '{Mollets}', '{Épaules,Quadriceps,Abducteurs}', 'Poids du corps', 'Débutant', 'Cardio', false, 'Muscu Coach'),
  ('cardio-boxe', 'Boxe au sac', 'Enchaînements de coups au sac de frappe (directs, crochets, uppercuts) en restant mobile sur les appuis. Garde haute.', '{Épaules}', '{Pectoraux,Triceps,Abdominaux,Mollets}', 'Autre', 'Intermédiaire', 'Cardio', false, 'Muscu Coach'),
  ('cardio-shadow', 'Shadow boxing', 'Boxe dans le vide, en déplacement, avec des enchaînements variés. Mains qui reviennent toujours à la garde.', '{Épaules}', '{Abdominaux,Mollets,Triceps}', 'Poids du corps', 'Débutant', 'Cardio', false, 'Muscu Coach')
on conflict (id) do nothing;
