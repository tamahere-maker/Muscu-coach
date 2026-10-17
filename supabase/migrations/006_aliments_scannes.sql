-- Aliments ajoutés en scannant le code-barres d'un article (données Open Food Facts)
alter table public.aliments add column code_barres text unique;
alter table public.aliments add column marque text;
alter table public.aliments add column source text not null default 'base';
alter table public.aliments add column cree_par uuid references public.profiles(id) on delete set null;
alter table public.aliments drop constraint aliments_nom_key;
create unique index aliments_nom_base on public.aliments(nom) where code_barres is null;

create policy aliments_ajout on public.aliments for insert to authenticated
  with check (cree_par = auth.uid() and code_barres is not null and source = 'Open Food Facts');
