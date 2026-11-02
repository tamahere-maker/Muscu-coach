-- Contrat de coaching entre le coach principal et l'athlète (additif, rien n'est supprimé).
--  * contrats_modeles : informations légales et clauses propres à chaque coach (une ligne par coach) ;
--  * contrats : un contrat par athlète et par programme, texte figé au moment de l'envoi + empreinte SHA-256 ;
--  * acceptations_contrat : preuve d'acceptation, en insertion seule (personne ne peut la modifier ni la supprimer).
-- L'athlète accepte ou met fin au contrat uniquement via les fonctions accepter_contrat et finir_contrat.

create table if not exists public.contrats_modeles (
  coach_id uuid primary key references public.profiles(id) on delete cascade,
  denomination text not null default '',      -- nom ou raison sociale
  statut_juridique text not null default '',  -- micro-entreprise, SASU…
  siret text not null default '',
  adresse text not null default '',
  email_contact text not null default '',
  diplome text not null default '',           -- diplôme ou carte professionnelle d'éducateur sportif
  assurance text not null default '',         -- assureur et numéro de contrat RC pro
  mediateur text not null default '',         -- nom et site du médiateur de la consommation
  delai_reponse text not null default '48 heures ouvrées',
  preavis_jours int not null default 15 check (preavis_jours between 0 and 90),
  clauses_perso text not null default '',
  version int not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.contrats (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  programme_id uuid references public.programmes(id) on delete set null,
  titre text not null,
  prix_eur numeric(8,2) not null default 0 check (prix_eur >= 0),
  date_debut date not null,
  date_fin date,
  texte text not null,
  empreinte text not null default '',
  modele_version int,
  statut text not null default 'envoye'
    check (statut in ('envoye', 'accepte', 'retracte', 'resilie', 'annule', 'remplace')),
  created_at timestamptz not null default now(),
  accepte_at timestamptz,
  demarrage_anticipe boolean not null default false,
  fin_at timestamptz,
  fin_par uuid references public.profiles(id) on delete set null,
  motif_fin text
);
create index if not exists contrats_athlete on public.contrats(athlete_id, created_at desc);

create table if not exists public.acceptations_contrat (
  id uuid primary key default gen_random_uuid(),
  contrat_id uuid not null references public.contrats(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  empreinte text not null,
  accepte_contrat boolean not null,
  demarrage_anticipe boolean not null,
  consentement_sante boolean not null,
  ip text,
  navigateur text,
  created_at timestamptz not null default now()
);

-- L'empreinte est toujours calculée par la base à partir du texte, et le texte ne peut plus changer ensuite
create or replace function public.figer_contrat() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (new.texte <> old.texte or new.prix_eur <> old.prix_eur or new.athlete_id <> old.athlete_id
    or new.coach_id <> old.coach_id or new.date_debut <> old.date_debut or new.date_fin is distinct from old.date_fin) then
    raise exception 'Un contrat envoyé ne peut plus être modifié : envoie une nouvelle version';
  end if;
  new.empreinte := encode(sha256(convert_to(new.texte, 'UTF8')), 'hex');
  return new;
end $$;
drop trigger if exists contrats_figer on public.contrats;
create trigger contrats_figer before insert or update on public.contrats for each row execute function public.figer_contrat();

alter table public.contrats_modeles enable row level security;
alter table public.contrats enable row level security;
alter table public.acceptations_contrat enable row level security;

-- Modèle : le coach seul
create policy cm_coach on public.contrats_modeles for all to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());
-- Contrats : lus par l'athlète et ses coachs ; créés par le coach principal, au statut « envoyé »
create policy contrats_lecture on public.contrats for select to authenticated using (public.peut_voir(athlete_id));
create policy contrats_envoi on public.contrats for insert to authenticated
  with check (coach_id = auth.uid() and public.est_principal_de(athlete_id) and statut = 'envoye' and accepte_at is null);
-- Preuves : lecture seule pour l'athlète et ses coachs (écriture via accepter_contrat uniquement)
create policy ac_lecture on public.acceptations_contrat for select to authenticated using (public.peut_voir(athlete_id));

-- Acceptation par l'athlète : l'empreinte du texte affiché doit correspondre au texte enregistré
create or replace function public.accepter_contrat(c uuid, p_empreinte text, p_anticipe boolean, p_sante boolean, p_navigateur text default null)
returns void language plpgsql security definer set search_path = public as $$
declare k contrats; hdr json;
begin
  select * into k from contrats where id = c for update;
  if k.id is null or k.athlete_id <> auth.uid() then raise exception 'Contrat introuvable'; end if;
  if k.statut <> 'envoye' then raise exception 'Ce contrat n’est plus en attente d’acceptation'; end if;
  if p_empreinte is distinct from k.empreinte then raise exception 'Le texte affiché ne correspond pas au contrat : recharge la page'; end if;
  if not coalesce(p_sante, false) then raise exception 'Le consentement au traitement des données de santé est nécessaire au suivi'; end if;
  begin hdr := current_setting('request.headers', true)::json; exception when others then hdr := null; end;
  insert into acceptations_contrat(contrat_id, athlete_id, empreinte, accepte_contrat, demarrage_anticipe, consentement_sante, ip, navigateur)
  values (k.id, k.athlete_id, k.empreinte, true, coalesce(p_anticipe, false), true,
          split_part(coalesce(hdr->>'cf-connecting-ip', hdr->>'x-forwarded-for', ''), ',', 1), left(p_navigateur, 300));
  -- L'ancien contrat en cours avec ce coach est remplacé par le nouveau
  update contrats set statut = 'remplace', fin_at = now(), fin_par = auth.uid()
    where athlete_id = k.athlete_id and coach_id = k.coach_id and statut = 'accepte' and id <> k.id;
  update contrats set statut = 'accepte', accepte_at = now(), demarrage_anticipe = coalesce(p_anticipe, false) where id = k.id;
end $$;

-- Fin de contrat :
--  * athlète : « retracte » (14 jours après l'acceptation) ou « resilie » ;
--  * coach principal : « annule » (contrat pas encore accepté) ou « resilie ».
create or replace function public.finir_contrat(c uuid, p_type text, p_motif text default null)
returns void language plpgsql security definer set search_path = public as $$
declare k contrats; athlete boolean; coach boolean;
begin
  select * into k from contrats where id = c for update;
  if k.id is null then raise exception 'Contrat introuvable'; end if;
  athlete := k.athlete_id = auth.uid();
  coach := k.coach_id = auth.uid() and public.est_principal_de(k.athlete_id);
  if not (athlete or coach) then raise exception 'Contrat introuvable'; end if;
  if p_type = 'retracte' then
    if not athlete or k.statut <> 'accepte' then raise exception 'Rétractation impossible pour ce contrat'; end if;
    if now() > k.accepte_at + interval '14 days' then raise exception 'Le délai de rétractation de 14 jours est dépassé : tu peux résilier le contrat'; end if;
  elsif p_type = 'resilie' then
    if k.statut <> 'accepte' then raise exception 'Seul un contrat en cours peut être résilié'; end if;
  elsif p_type = 'annule' then
    if not coach or k.statut <> 'envoye' then raise exception 'Seul un contrat pas encore accepté peut être annulé'; end if;
  else
    raise exception 'Type de fin inconnu';
  end if;
  update contrats set statut = p_type, fin_at = now(), fin_par = auth.uid(), motif_fin = nullif(trim(p_motif), '') where id = k.id;
end $$;

revoke all on function public.accepter_contrat(uuid, text, boolean, boolean, text) from public, anon;
revoke all on function public.finir_contrat(uuid, text, text) from public, anon;
grant execute on function public.accepter_contrat(uuid, text, boolean, boolean, text) to authenticated;
grant execute on function public.finir_contrat(uuid, text, text) to authenticated;
