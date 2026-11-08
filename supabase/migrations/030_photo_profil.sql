-- Photo de profil (coach et athlète) : chemin du fichier dans le bucket public « avatars »
-- (avatars/<id du compte>/<uuid>.jpg, 512 px, recadrée en carré dans l'app). Migration additive.
alter table public.profiles add column if not exists photo text;
grant update (photo) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Chacun ne dépose et ne supprime que dans son propre dossier ; l'affichage passe par l'URL publique
-- (la lecture par l'API, nécessaire pour supprimer, reste limitée à son dossier)
create policy avatars_lecture on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_ajout on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_maj on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_suppr on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
