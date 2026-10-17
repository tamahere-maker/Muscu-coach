-- Sexe de l'athlète, nécessaire au calcul du métabolisme de base (Mifflin-St Jeor)
alter table public.athlete_profiles add column sexe text check (sexe in ('Homme','Femme'));
