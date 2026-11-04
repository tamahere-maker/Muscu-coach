-- Rappels de compléments : changer l'heure d'un complément reprogramme le rappel du jour
-- (sinon un rappel déjà envoyé aujourd'hui bloquait la nouvelle heure jusqu'au lendemain).
create or replace function public.rearmer_rappel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from rappels_envoyes where complement_id = new.id;
  return new;
end $$;
revoke execute on function public.rearmer_rappel() from public, anon, authenticated;

create or replace trigger complements_rearmer_rappel
  after update of heure on public.complements
  for each row when (new.heure is distinct from old.heure)
  execute function public.rearmer_rappel();
