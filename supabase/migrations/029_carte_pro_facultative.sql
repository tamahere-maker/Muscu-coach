-- Phase de test (2026-11-08) : la carte professionnelle n'est plus exigée pour envoyer un contrat.
-- Déjà appliqué en base. Côté app : CARTE_OBLIGATOIRE = false dans src/lib/cartePro.jsx.
-- Pour rétablir l'obligation : CARTE_OBLIGATOIRE = true et
--   alter policy contrats_carte_pro on public.contrats with check (public.carte_valide(coach_id));
alter policy contrats_carte_pro on public.contrats with check (true);
