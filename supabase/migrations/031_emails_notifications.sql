-- E-mails (Resend) et notifications à l'athlète. Additif : rien n'est supprimé.
--  * invitations athlète et coach associé envoyées par e-mail (fonction Edge « envois ») ;
--  * e-mail de confirmation du contrat accepté, avec le PDF en pièce jointe ;
--  * quand un coach modifie le programme ou le plan alimentaire actif d'un athlète, les changements sont notés ici,
--    puis regroupés : une seule notification push + un seul e-mail, 10 min après la dernière modification
--    (ou au bout d'une heure si le coach modifie sans s'arrêter). Envoi par « envois », appelée toutes les 5 min par pg_cron.

alter table public.invitations add column if not exists email_envoye_at timestamptz;
alter table public.invitations_coach add column if not exists email_envoye_at timestamptz;
alter table public.contrats add column if not exists email_confirmation_at timestamptz;
-- L'athlète peut couper les e-mails de mise à jour (la notification push reste)
alter table public.profiles add column if not exists emails_maj boolean not null default true;

-- Modifications en attente d'envoi (une ligne par athlète et par type), réservé au serveur
create table if not exists public.maj_en_attente (
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('programme', 'nutrition')),
  objet_id uuid,
  nom text,
  coach_id uuid references public.profiles(id) on delete set null,
  premiere_modif timestamptz not null default now(),
  derniere_modif timestamptz not null default now(),
  primary key (athlete_id, type)
);
alter table public.maj_en_attente enable row level security;
revoke all on public.maj_en_attente from anon, authenticated;

-- Note la modification si elle vient d'un coach (pas de l'athlète lui-même ni du serveur) et vise un programme
-- ou un plan actif d'un athlète. Ne bloque jamais l'enregistrement du coach, même en cas d'erreur.
create or replace function public.noter_maj_athlete() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; a uuid; t text; obj uuid; n text; act boolean;
begin
  if auth.uid() is null then return null; end if;
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  begin
    if tg_table_name = 'programmes' then
      -- L'avancement (prochaine séance, semaine en cours) n'est pas une modification du coach
      if tg_op = 'UPDATE' and (to_jsonb(new) - 'prochaine_seance' - 'semaine_en_cours') = (to_jsonb(old) - 'prochaine_seance' - 'semaine_en_cours') then
        return null;
      end if;
      t := 'programme'; select new.athlete_id, new.id, new.nom, new.actif into a, obj, n, act;
    elsif tg_table_name = 'seances' then
      t := 'programme'; select p.athlete_id, p.id, p.nom, p.actif into a, obj, n, act from programmes p where p.id = r.programme_id;
    elsif tg_table_name = 'seance_exercices' then
      t := 'programme'; select p.athlete_id, p.id, p.nom, p.actif into a, obj, n, act
        from seances s join programmes p on p.id = s.programme_id where s.id = r.seance_id;
    elsif tg_table_name = 'plans_nutrition' then
      t := 'nutrition'; select new.athlete_id, new.id, new.nom, new.actif into a, obj, n, act;
    elsif tg_table_name in ('repas', 'complements') then
      t := 'nutrition'; select p.athlete_id, p.id, p.nom, p.actif into a, obj, n, act from plans_nutrition p where p.id = r.plan_id;
    elsif tg_table_name = 'repas_aliments' then
      t := 'nutrition'; select p.athlete_id, p.id, p.nom, p.actif into a, obj, n, act
        from repas x join plans_nutrition p on p.id = x.plan_id where x.id = r.repas_id;
    end if;
    if a is null or a = auth.uid() or not coalesce(act, false) then return null; end if;
    insert into maj_en_attente(athlete_id, type, objet_id, nom, coach_id) values (a, t, obj, n, auth.uid())
    on conflict (athlete_id, type) do update
      set derniere_modif = now(), objet_id = excluded.objet_id, nom = excluded.nom, coach_id = excluded.coach_id;
  exception when others then
    return null;
  end;
  return null;
end $$;
revoke all on function public.noter_maj_athlete() from public, anon, authenticated;

drop trigger if exists maj_athlete on public.programmes;
create trigger maj_athlete after insert or update on public.programmes for each row execute function public.noter_maj_athlete();
drop trigger if exists maj_athlete on public.seances;
create trigger maj_athlete after insert or update or delete on public.seances for each row execute function public.noter_maj_athlete();
drop trigger if exists maj_athlete on public.seance_exercices;
create trigger maj_athlete after insert or update or delete on public.seance_exercices for each row execute function public.noter_maj_athlete();
drop trigger if exists maj_athlete on public.plans_nutrition;
create trigger maj_athlete after insert or update on public.plans_nutrition for each row execute function public.noter_maj_athlete();
drop trigger if exists maj_athlete on public.repas;
create trigger maj_athlete after insert or update or delete on public.repas for each row execute function public.noter_maj_athlete();
drop trigger if exists maj_athlete on public.repas_aliments;
create trigger maj_athlete after insert or update or delete on public.repas_aliments for each row execute function public.noter_maj_athlete();
drop trigger if exists maj_athlete on public.complements;
create trigger maj_athlete after insert or update or delete on public.complements for each row execute function public.noter_maj_athlete();

-- Envoi des mises à jour regroupées toutes les 5 minutes (même clé que les rappels de compléments)
select cron.schedule('envois-maj', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://zwoiisgjhsofwzajpkrv.supabase.co/functions/v1/envois',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cle-cron', (select valeur from public.config_serveur where cle = 'cle_cron')),
    body := '{"action":"maj"}'::jsonb)
$cron$);
