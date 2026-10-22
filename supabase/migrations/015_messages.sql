-- Messagerie : une conversation par athlète, partagée entre l'athlète et tous ses coachs.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  auteur_id uuid not null references public.profiles(id) on delete cascade,
  texte text not null check (length(trim(texte)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index messages_athlete on public.messages(athlete_id, created_at);

-- Jusqu'où chacun a lu la conversation d'un athlète
create table public.lectures_messages (
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  lecteur_id uuid not null references public.profiles(id) on delete cascade,
  lu_jusqu_a timestamptz not null default now(),
  primary key (athlete_id, lecteur_id)
);

alter table public.messages enable row level security;
alter table public.lectures_messages enable row level security;
create policy messages_lecture on public.messages for select to authenticated using (public.peut_voir(athlete_id));
create policy messages_ajout on public.messages for insert to authenticated
  with check (auteur_id = auth.uid() and public.peut_voir(athlete_id));
create policy messages_suppr on public.messages for delete to authenticated using (auteur_id = auth.uid());
create policy lectures_perso on public.lectures_messages for all to authenticated
  using (lecteur_id = auth.uid()) with check (lecteur_id = auth.uid() and public.peut_voir(athlete_id));

-- Nombre de messages non lus par conversation, pour l'utilisateur connecté
create or replace function public.messages_non_lus() returns table(athlete_id uuid, n bigint)
language sql stable security definer set search_path = public as $$
  select m.athlete_id, count(*) from messages m
  left join lectures_messages l on l.athlete_id = m.athlete_id and l.lecteur_id = auth.uid()
  where m.auteur_id <> auth.uid() and m.created_at > coalesce(l.lu_jusqu_a, '-infinity')
    and (m.athlete_id = auth.uid() or exists(select 1 from coachings c where c.athlete_id = m.athlete_id and c.coach_id = auth.uid()))
  group by m.athlete_id
$$;
revoke execute on function public.messages_non_lus() from public, anon;
grant execute on function public.messages_non_lus() to authenticated;

-- Nouveaux messages reçus en direct dans l'app
alter publication supabase_realtime add table public.messages;
