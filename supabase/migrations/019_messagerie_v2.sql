-- Messagerie v2 : photos et vidéos, modification, message lié à un exercice d'une séance, « Vu »,
-- boîte de réception du coach, notifications push.

-- Un message peut ne contenir qu'une pièce jointe, sans texte
alter table public.messages drop constraint messages_texte_check;
alter table public.messages alter column texte set default '';
alter table public.messages
  add column piece_chemin text,      -- fichier du bucket « messages » : <athlete_id>/<uuid>.<ext>
  add column piece_type text check (piece_type in ('image', 'video')),
  add column seance_id uuid references public.seances(id) on delete set null,
  add column exercice_id text references public.exercices(id) on delete set null,
  add column modifie_at timestamptz,
  add constraint messages_contenu check (length(texte) <= 4000 and (length(trim(texte)) > 0 or piece_chemin is not null));

-- Modification : l'auteur ne peut changer que le texte de ses messages
create or replace function public.proteger_message() returns trigger language plpgsql as $$
begin
  if new.athlete_id <> old.athlete_id or new.auteur_id <> old.auteur_id or new.created_at <> old.created_at
     or new.piece_chemin is distinct from old.piece_chemin or new.piece_type is distinct from old.piece_type
     or (new.seance_id is not null and new.seance_id is distinct from old.seance_id)
     or (new.exercice_id is not null and new.exercice_id is distinct from old.exercice_id) then
    raise exception 'Seul le texte d''un message peut être modifié';
  end if;
  if new.texte <> old.texte then new.modifie_at := now(); end if;
  return new;
end $$;
create trigger proteger_message before update on public.messages for each row execute function public.proteger_message();
revoke execute on function public.proteger_message() from public, anon, authenticated;
create policy messages_modif on public.messages for update to authenticated
  using (auteur_id = auth.uid()) with check (auteur_id = auth.uid());

-- « Vu » : chacun voit jusqu'où les autres participants ont lu la conversation
create policy lectures_voir on public.lectures_messages for select to authenticated using (public.peut_voir(athlete_id));
alter publication supabase_realtime add table public.lectures_messages;

-- Boîte de réception du coach : ses conversations, la plus récente d'abord
create or replace function public.conversations() returns table(
  athlete_id uuid, nom text, dernier_texte text, dernier_type text, dernier_at timestamptz,
  dernier_auteur uuid, dernier_auteur_nom text, non_lus bigint)
language sql stable security definer set search_path = public as $$
  select c.athlete_id, p.nom, d.texte, d.piece_type, d.created_at, d.auteur_id, a.nom,
    (select count(*) from messages m
      left join lectures_messages l on l.athlete_id = m.athlete_id and l.lecteur_id = auth.uid()
      where m.athlete_id = c.athlete_id and m.auteur_id <> auth.uid() and m.created_at > coalesce(l.lu_jusqu_a, '-infinity'))
  from coachings c
  join profiles p on p.id = c.athlete_id
  left join lateral (select m.texte, m.piece_type, m.created_at, m.auteur_id from messages m
    where m.athlete_id = c.athlete_id order by m.created_at desc limit 1) d on true
  left join profiles a on a.id = d.auteur_id
  where c.coach_id = auth.uid()
  order by d.created_at desc nulls last, p.nom
$$;
revoke execute on function public.conversations() from public, anon;
grant execute on function public.conversations() to authenticated;

-- Photos et vidéos : stockage privé, un dossier par conversation (messages/<athlete_id>/…)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('messages', 'messages', false, 52428800,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm'])
on conflict (id) do nothing;
create policy messages_pieces_lecture on storage.objects for select to authenticated
  using (bucket_id = 'messages' and public.peut_voir(((storage.foldername(name))[1])::uuid));
create policy messages_pieces_ajout on storage.objects for insert to authenticated
  with check (bucket_id = 'messages' and public.peut_voir(((storage.foldername(name))[1])::uuid));
create policy messages_pieces_suppr on storage.objects for delete to authenticated
  using (bucket_id = 'messages' and owner = auth.uid());

-- Notifications push : un abonnement par appareil, rattaché au compte connecté dessus
create table public.abonnements_push (
  endpoint text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index abonnements_push_user on public.abonnements_push(user_id);
alter table public.abonnements_push enable row level security;
create policy abonnements_perso on public.abonnements_push for select to authenticated using (user_id = auth.uid());

-- Enregistre l'appareil pour le compte connecté (le reprend à un autre compte connecté avant sur le même appareil)
create or replace function public.enregistrer_push(p_endpoint text, p_p256dh text, p_auth text) returns void
language sql volatile security definer set search_path = public as $$
  insert into abonnements_push (endpoint, user_id, p256dh, auth) values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
$$;
create or replace function public.retirer_push(p_endpoint text) returns void
language sql volatile security definer set search_path = public as $$
  delete from abonnements_push where endpoint = p_endpoint and user_id = auth.uid()
$$;
revoke execute on function public.enregistrer_push(text, text, text), public.retirer_push(text) from public, anon;
grant execute on function public.enregistrer_push(text, text, text), public.retirer_push(text) to authenticated;

-- Réglages réservés au serveur (clés VAPID des notifications, créées par la fonction « notifier »)
create table public.config_serveur (
  cle text primary key,
  valeur text not null
);
alter table public.config_serveur enable row level security;
revoke all on public.config_serveur from anon, authenticated;
