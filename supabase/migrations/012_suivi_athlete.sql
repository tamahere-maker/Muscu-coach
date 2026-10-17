-- Suivi de l'athlète : il n'enregistre des séances, des aliments et des prises de compléments
-- que sur son propre programme et son propre plan.
alter policy sr_ecriture on public.seances_realisees
  using (athlete_id = auth.uid())
  with check (athlete_id = auth.uid() and (seance_id is null
    or public.athlete_du_programme((select programme_id from public.seances s where s.id = seance_id)) = auth.uid()));

alter policy ja_ecriture on public.journal_aliments
  using (athlete_id = auth.uid())
  with check (athlete_id = auth.uid()
    and public.athlete_du_plan((select r.plan_id from public.repas_aliments ra join public.repas r on r.id = ra.repas_id where ra.id = repas_aliment_id)) = auth.uid());

alter policy pc_ecriture on public.prises_complements
  using (athlete_id = auth.uid())
  with check (athlete_id = auth.uid()
    and public.athlete_du_plan((select plan_id from public.complements c where c.id = complement_id)) = auth.uid());
