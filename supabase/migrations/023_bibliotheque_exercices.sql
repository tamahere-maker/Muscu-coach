-- 023 : bibliothèque d'exercices enrichie
--   * import d'exercices depuis wger.de (licence CC-BY-SA, source citée), partagés entre coachs
--   * favoris du coach
--   * vidéo perso du coach par exercice (lien ou fichier), visible de ses athlètes en séance guidée
--   * variantes liées par le coach, proposées en premier dans les substitutions
-- Migration additive : aucune suppression.

-- Exercices wger ----------------------------------------------------------------
alter table public.exercices
  add column if not exists wger_id int unique,
  add column if not exists image_url text,   -- illustration wger (pas de sprite)
  add column if not exists licence text;     -- attribution : licence et auteurs

-- Un exercice wger importé par un coach est visible de tous (un seul exemplaire par exercice wger)
create policy exercices_lecture_wger on public.exercices for select to authenticated using (wger_id is not null);
-- … et n'est ni modifiable ni supprimable par celui qui l'a importé, puisqu'il est partagé
alter policy exercices_maj on public.exercices using (cree_par = auth.uid() and wger_id is null)
  with check (cree_par = auth.uid() and sprite is null and wger_id is null);
alter policy exercices_suppr on public.exercices using (cree_par = auth.uid() and wger_id is null);

-- Favoris du coach ----------------------------------------------------------------
create table if not exists public.favoris_exercices (
  coach_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  exercice_id text not null references public.exercices(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (coach_id, exercice_id)
);
alter table public.favoris_exercices enable row level security;
create policy favoris_coach on public.favoris_exercices for all to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- Vidéo perso du coach ---------------------------------------------------------------
create table if not exists public.videos_exercices (
  coach_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  exercice_id text not null references public.exercices(id) on delete cascade,
  url text,     -- lien YouTube, Vimeo…
  chemin text,  -- ou fichier du bucket « videos-exercices » : <coach_id>/<uuid>.<ext>
  updated_at timestamptz not null default now(),
  primary key (coach_id, exercice_id),
  check ((url is null) <> (chemin is null)),
  check (url is null or url ~ '^https?://')
);
create index if not exists videos_exercices_exercice on public.videos_exercices (exercice_id);
alter table public.videos_exercices enable row level security;
-- Visible du coach, de ses athlètes et des autres coachs de ses athlètes
create policy ve_lecture on public.videos_exercices for select to authenticated using (public.voit_exercice_de(coach_id));
create policy ve_ajout on public.videos_exercices for insert to authenticated
  with check (coach_id = auth.uid() and (select role from public.profiles where id = auth.uid()) = 'coach');
create policy ve_maj on public.videos_exercices for update to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());
create policy ve_suppr on public.videos_exercices for delete to authenticated using (coach_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos-exercices', 'videos-exercices', false, 52428800, array['video/mp4','video/quicktime','video/webm'])
on conflict (id) do nothing;
create policy videos_ex_lecture on storage.objects for select to authenticated
  using (bucket_id = 'videos-exercices' and public.voit_exercice_de(((storage.foldername(name))[1])::uuid));
create policy videos_ex_ajout on storage.objects for insert to authenticated
  with check (bucket_id = 'videos-exercices' and (storage.foldername(name))[1] = auth.uid()::text);
create policy videos_ex_suppr on storage.objects for delete to authenticated
  using (bucket_id = 'videos-exercices' and owner = auth.uid());

-- Variantes liées ----------------------------------------------------------------------
-- Paire non orientée (exercice_a < exercice_b) ; lue par le coach, ses athlètes et ses coachs associés
create table if not exists public.variantes_exercices (
  coach_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  exercice_a text not null references public.exercices(id) on delete cascade,
  exercice_b text not null references public.exercices(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (coach_id, exercice_a, exercice_b),
  check (exercice_a < exercice_b)
);
create index if not exists variantes_exercices_b on public.variantes_exercices (exercice_b);
create index if not exists variantes_exercices_a on public.variantes_exercices (exercice_a);
alter table public.variantes_exercices enable row level security;
create policy var_lecture on public.variantes_exercices for select to authenticated using (public.voit_exercice_de(coach_id));
create policy var_ajout on public.variantes_exercices for insert to authenticated
  with check (coach_id = auth.uid() and (select role from public.profiles where id = auth.uid()) = 'coach');
create policy var_suppr on public.variantes_exercices for delete to authenticated using (coach_id = auth.uid());

grant select, insert, update, delete on public.favoris_exercices, public.videos_exercices, public.variantes_exercices to authenticated;
