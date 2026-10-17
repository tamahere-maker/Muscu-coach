-- Bilans de l'athlète : initial (à l'inscription), hebdomadaire (jour fixé par le coach) ou ponctuel (demandé par le coach).
create table public.bilans (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'hebdo' check (type in ('initial','hebdo','ponctuel')),
  statut text not null default 'demande' check (statut in ('demande','envoye','vu')),
  demande_par uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  envoye_at timestamptz,
  -- mensurations (kg, cm, %)
  poids_kg numeric(5,1), tour_taille numeric(5,1), tour_hanches numeric(5,1), tour_poitrine numeric(5,1),
  tour_bras numeric(5,1), tour_cuisse numeric(5,1), masse_grasse numeric(4,1),
  -- ressentis notés de 1 à 5
  entrainement int check (entrainement between 1 and 5), moral int check (moral between 1 and 5),
  nutrition int check (nutrition between 1 and 5), recuperation int check (recuperation between 1 and 5),
  sommeil int check (sommeil between 1 and 5), stress int check (stress between 1 and 5), energie int check (energie between 1 and 5),
  commentaire_entrainement text not null default '', commentaire_nutrition text not null default '',
  commentaire_recuperation text not null default '', commentaire text not null default '',
  photos text[] not null default '{}',          -- chemins dans le stockage « bilans »
  reponse_coach text not null default '', reponse_par uuid references public.profiles(id) on delete set null, vu_at timestamptz
);
create index bilans_athlete on public.bilans(athlete_id, created_at desc);

-- Fréquence des bilans hebdomadaires, réglée par le coach (1 = lundi … 7 = dimanche, null = pas de bilan hebdo)
create table public.suivi_bilans (
  athlete_id uuid primary key references public.profiles(id) on delete cascade,
  jour_semaine int check (jour_semaine between 1 and 7),
  updated_at timestamptz not null default now()
);

alter table public.bilans enable row level security;
alter table public.suivi_bilans enable row level security;

create policy bilans_lecture on public.bilans for select to authenticated using (public.peut_voir(athlete_id));
create policy bilans_ajout on public.bilans for insert to authenticated
  with check ((athlete_id = auth.uid() and reponse_coach = '' and statut <> 'vu') or (public.est_coach_de(athlete_id) and statut = 'demande'));
create policy bilans_maj on public.bilans for update to authenticated
  using (public.peut_voir(athlete_id)) with check (public.peut_voir(athlete_id));
create policy bilans_suppr on public.bilans for delete to authenticated
  using (public.est_coach_de(athlete_id) and statut = 'demande');

create policy suivi_lecture on public.suivi_bilans for select to authenticated using (public.peut_voir(athlete_id));
create policy suivi_ecriture on public.suivi_bilans for all to authenticated
  using (public.est_coach_de(athlete_id)) with check (public.est_coach_de(athlete_id));

-- Le coach ne peut modifier que sa réponse et le statut « vu » ; l'athlète remplit un bilan demandé une seule fois
-- et ne touche pas à la réponse du coach.
create or replace function public.proteger_bilan() returns trigger
language plpgsql security definer set search_path = public as $$
declare rep text := new.reponse_coach; par uuid := new.reponse_par; vu timestamptz := new.vu_at; st text := new.statut;
begin
  if auth.uid() is null then return new; end if;
  if auth.uid() = old.athlete_id then
    if old.statut <> 'demande' then raise exception 'Ce bilan a déjà été envoyé'; end if;
    new.reponse_coach := old.reponse_coach; new.reponse_par := old.reponse_par; new.vu_at := old.vu_at;
    if new.statut = 'vu' then new.statut := 'envoye'; end if;
    if new.statut = 'envoye' then new.envoye_at := now(); end if;
  else
    new := old;
    new.reponse_coach := rep; new.reponse_par := par; new.vu_at := vu;
    if st = 'vu' and old.statut <> 'demande' then new.statut := 'vu'; end if;
  end if;
  return new;
end $$;
create trigger proteger_bilan before update on public.bilans for each row execute function public.proteger_bilan();
revoke execute on function public.proteger_bilan() from public, anon, authenticated;

-- Photos : stockage privé, un dossier par athlète (bilans/<athlete_id>/<bilan_id>/…)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bilans', 'bilans', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy bilans_photos_lecture on storage.objects for select to authenticated
  using (bucket_id = 'bilans' and public.peut_voir(((storage.foldername(name))[1])::uuid));
create policy bilans_photos_ajout on storage.objects for insert to authenticated
  with check (bucket_id = 'bilans' and (storage.foldername(name))[1] = auth.uid()::text);
create policy bilans_photos_suppr on storage.objects for delete to authenticated
  using (bucket_id = 'bilans' and (storage.foldername(name))[1] = auth.uid()::text);
