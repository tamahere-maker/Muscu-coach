-- Aliments saisis à la main par un coach, gardés dans sa bibliothèque pour être réutilisés.
--  * sans code-barres : visibles par le coach, ses athlètes et les autres coachs de ses athlètes
--    (même règle que les exercices perso, fonction voit_exercice_de) ;
--  * avec code-barres (article absent d'Open Food Facts) : partagés comme les produits scannés,
--    un seul exemplaire par code-barres (contrainte unique déjà en place).
-- Les noms restent uniques pour les aliments de base, et par coach pour ses propres aliments.

create unique index if not exists aliments_nom_base_seule on public.aliments(nom) where code_barres is null and source = 'base';
create unique index if not exists aliments_nom_coach on public.aliments(cree_par, lower(nom)) where code_barres is null and source = 'manuel';
drop index if exists public.aliments_nom_base; -- remplacé par les deux index ci-dessus (aucune donnée supprimée)

alter policy aliments_lecture on public.aliments
  using (source <> 'manuel' or code_barres is not null or public.voit_exercice_de(cree_par));

create policy aliments_ajout_manuel on public.aliments for insert to authenticated
  with check (cree_par = auth.uid() and source = 'manuel' and (select role from public.profiles where id = auth.uid()) = 'coach');

create policy aliments_maj on public.aliments for update to authenticated
  using (cree_par = auth.uid() and source in ('manuel', 'Open Food Facts'))
  with check (cree_par = auth.uid() and source in ('manuel', 'Open Food Facts'));
