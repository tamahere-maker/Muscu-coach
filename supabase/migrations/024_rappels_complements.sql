-- Rappels de compléments : le coach règle une heure de prise, l'athlète reçoit une notification push
-- s'il n'a pas encore coché « pris ». Envoi par la fonction Edge « rappels », appelée toutes les 5 min par pg_cron.

-- Heure de prise (null = pas de rappel), dans le fuseau horaire de l'athlète
alter table public.complements add column if not exists heure time;
-- Fuseau de l'athlète, mis à jour par l'app depuis son appareil
alter table public.athlete_profiles add column if not exists fuseau text not null default 'Europe/Paris';
-- Heure à laquelle l'athlète a coché « pris » (visible dans le Suivi du coach)
alter table public.prises_complements add column if not exists pris_a timestamptz not null default now();

-- Rappels déjà envoyés (un par complément et par jour), réservé au serveur
create table if not exists public.rappels_envoyes (
  complement_id uuid not null references public.complements(id) on delete cascade,
  date date not null,
  envoye_a timestamptz not null default now(),
  primary key (complement_id, date)
);
alter table public.rappels_envoyes enable row level security;
revoke all on public.rappels_envoyes from anon, authenticated;

-- La copie d'un modèle de plan reprend aussi l'heure des compléments
create or replace function public.attribuer_plan(m uuid, a uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare src plans_nutrition; nouveau uuid; r repas; nr uuid;
begin
  select * into src from plans_nutrition where id = m and athlete_id is null and coach_id = auth.uid();
  if src.id is null then raise exception 'Plan introuvable'; end if;
  if not public.peut_nourrir(a) then raise exception 'Cet athlète ne fait pas partie de tes athlètes pour la nutrition'; end if;
  update plans_nutrition set actif = false where athlete_id = a and actif;
  insert into plans_nutrition(athlete_id, coach_id, nom, description, kcal, proteines, glucides, lipides, modele_id,
    jours_differents, kcal_repos, proteines_repos, glucides_repos, lipides_repos, eau_ml)
  values (a, auth.uid(), src.nom, src.description, src.kcal, src.proteines, src.glucides, src.lipides, src.id,
    src.jours_differents, src.kcal_repos, src.proteines_repos, src.glucides_repos, src.lipides_repos, src.eau_ml) returning id into nouveau;
  for r in select * from repas where plan_id = m order by ordre loop
    insert into repas(plan_id, ordre, nom, note, type_jour) values (nouveau, r.ordre, r.nom, r.note, r.type_jour) returning id into nr;
    insert into repas_aliments(repas_id, ordre, aliment_id, grammes, alternatives, unite, recette)
    select nr, ordre, aliment_id, grammes, alternatives, unite, recette from repas_aliments where repas_id = r.id;
  end loop;
  insert into complements(plan_id, nom, dose, moment, heure) select nouveau, nom, dose, moment, heure from complements where plan_id = m;
  return nouveau;
end $$;

-- Clé partagée entre pg_cron et la fonction « rappels » (personne d'autre ne peut la déclencher)
insert into public.config_serveur(cle, valeur) values ('cle_cron', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (cle) do nothing;

-- Appel de la fonction toutes les 5 minutes
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('rappels-complements', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://zwoiisgjhsofwzajpkrv.supabase.co/functions/v1/rappels',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cle-cron', (select valeur from public.config_serveur where cle = 'cle_cron')),
    body := '{}'::jsonb)
$cron$);
