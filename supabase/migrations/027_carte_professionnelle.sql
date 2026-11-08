-- Carte professionnelle d'éducateur sportif des coachs (additif, rien n'est supprimé).
-- Code du sport L212-1 et L212-11 : un coach payé, même à distance, doit être diplômé et déclaré (carte pro, 5 ans).
--  * cartes_pro : une ligne par coach (numéro, diplôme, expiration, déclaration sur l'honneur, acceptation des CGU coach) ;
--  * la vérification (registre public eapspublic.sports.gouv.fr) est faite à la main par un administrateur de l'app ;
--  * un contrat ne peut être envoyé qu'avec une carte renseignée, non expirée, et les CGU coach acceptées.

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
create policy admins_soi on public.admins for select to authenticated using (user_id = auth.uid());

create or replace function public.est_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from admins where user_id = auth.uid())
$$;

create table if not exists public.cartes_pro (
  coach_id uuid primary key references public.profiles(id) on delete cascade,
  numero text not null default '',             -- numéro de carte professionnelle
  diplome text not null default '',            -- ex. CQP Instructeur fitness option MPT, BPJEPS AF
  expire_le date,                              -- fin de validité (5 ans après la déclaration)
  attestation_at timestamptz,                  -- déclaration sur l'honneur (qualification, honorabilité, RC pro)
  cgu_version int,                             -- version des CGU coach acceptée
  cgu_at timestamptz,
  verifiee_at timestamptz,                     -- vérifiée par un administrateur sur le registre public
  verifiee_par uuid references auth.users(id) on delete set null,
  refus_motif text,                            -- motif si la vérification a échoué
  updated_at timestamptz not null default now()
);

-- Seule la fonction verifier_carte (administrateurs) peut marquer une carte vérifiée ou refusée ; toute modification du numéro,
-- du diplôme ou de la date d'expiration par le coach remet la carte « à vérifier ».
create or replace function public.garder_verification_carte() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.verif_carte', true) = '1' then return new; end if;
  if tg_op = 'INSERT' then
    new.verifiee_at := null; new.verifiee_par := null; new.refus_motif := null;
  elsif new.numero is distinct from old.numero or new.diplome is distinct from old.diplome or new.expire_le is distinct from old.expire_le then
    new.verifiee_at := null; new.verifiee_par := null; new.refus_motif := null;
  else
    new.verifiee_at := old.verifiee_at; new.verifiee_par := old.verifiee_par; new.refus_motif := old.refus_motif;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists cartes_pro_verif on public.cartes_pro;
create trigger cartes_pro_verif before insert or update on public.cartes_pro for each row execute function public.garder_verification_carte();

alter table public.cartes_pro enable row level security;
-- Le coach gère sa carte
create policy cp_coach on public.cartes_pro for all to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());
-- Lue par ses athlètes, les autres coachs de ses athlètes et les administrateurs
create policy cp_lecture on public.cartes_pro for select to authenticated using (
  public.est_admin() or exists(select 1 from public.coachings c where c.coach_id = cartes_pro.coach_id and public.peut_voir(c.athlete_id))
);

-- Carte utilisable : renseignée, non expirée, déclaration sur l'honneur et CGU acceptées
create or replace function public.carte_valide(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from cartes_pro where coach_id = c and trim(numero) <> '' and trim(diplome) <> ''
    and expire_le >= current_date and attestation_at is not null and cgu_at is not null)
$$;

-- Envoi de contrat : règle restrictive qui s'ajoute à contrats_envoi
create policy contrats_carte_pro on public.contrats as restrictive for insert to authenticated
  with check (public.carte_valide(coach_id));

-- Vérification par un administrateur (ok = false : refus avec motif)
create or replace function public.verifier_carte(c uuid, ok boolean, motif text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.est_admin() then raise exception 'Réservé aux administrateurs'; end if;
  perform set_config('app.verif_carte', '1', true);
  update cartes_pro set verifiee_at = case when ok then now() end, verifiee_par = case when ok then auth.uid() end,
    refus_motif = case when ok then null else coalesce(nullif(trim(motif), ''), 'Carte introuvable sur le registre public') end
  where coach_id = c;
  perform set_config('app.verif_carte', '', true);
end $$;

-- Liste des cartes pour l'écran de vérification (nom et e-mail du coach)
create or replace function public.cartes_a_verifier()
returns table (coach_id uuid, nom text, email text, numero text, diplome text, expire_le date,
  attestation_at timestamptz, verifiee_at timestamptz, refus_motif text, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.est_admin() then raise exception 'Réservé aux administrateurs'; end if;
  return query select k.coach_id, p.nom, u.email::text, k.numero, k.diplome, k.expire_le, k.attestation_at, k.verifiee_at, k.refus_motif, k.updated_at
    from cartes_pro k join profiles p on p.id = k.coach_id join auth.users u on u.id = k.coach_id
    order by (k.verifiee_at is not null), k.updated_at desc;
end $$;

revoke all on function public.verifier_carte(uuid, boolean, text) from public, anon;
revoke all on function public.cartes_a_verifier() from public, anon;
grant execute on function public.verifier_carte(uuid, boolean, text) to authenticated;
grant execute on function public.cartes_a_verifier() to authenticated;
grant execute on function public.carte_valide(uuid) to authenticated;
grant execute on function public.est_admin() to authenticated;

-- Administrateur de l'app : le compte « Tama Coach » du propriétaire (ajouter d'autres lignes au besoin)
insert into public.admins(user_id) select id from auth.users where email = 'tamaherem@gmail.com' on conflict do nothing;
