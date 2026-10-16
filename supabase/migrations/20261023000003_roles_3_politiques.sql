-- Rôles et droits, fin : chaque règle d'accès porte sur le droit de la
-- fonctionnalité concernée (règles modifiées sur place).

-- Cibles
alter policy cibles_ajout on public.cibles with check (public.a_permission('cibles.ajouter') or public.a_permission('cibles.gerer'));
alter policy cibles_modif on public.cibles
  using (public.a_permission('cibles.gerer')
         or (public.a_permission('cibles.ajouter') and public.mon_membre_id() in (referent_id, cree_par)))
  with check (public.a_permission('cibles.ajouter') or public.a_permission('cibles.gerer'));
alter policy cibles_suppr on public.cibles using (public.a_permission('cibles.gerer'));
alter policy appartenances_gestion on public.appartenances
  using (public.a_permission('cibles.ajouter') or public.a_permission('cibles.gerer'))
  with check (public.a_permission('cibles.ajouter') or public.a_permission('cibles.gerer'));

-- Actions et événements
alter policy actions_ajout on public.actions with check (public.a_permission('actions.creer') or public.a_permission('actions.gerer'));
alter policy actions_modif on public.actions
  using (public.peut_gerer_action(id))
  with check (public.a_permission('actions.creer') or public.a_permission('actions.gerer'));
alter policy evenements_ajout on public.evenements with check (public.a_permission('evenements.creer') or public.a_permission('evenements.gerer'));

-- Listes de référence
alter policy categories_gestion on public.categories_cible using (public.a_permission('referentiels.gerer')) with check (public.a_permission('referentiels.gerer'));
alter policy categories_gestion on public.categories_cible_v0 using (public.a_permission('referentiels.gerer')) with check (public.a_permission('referentiels.gerer'));
alter policy familles_gestion on public.familles_cible using (public.a_permission('referentiels.gerer')) with check (public.a_permission('referentiels.gerer'));
alter policy profils_gestion on public.profils_personne using (public.a_permission('referentiels.gerer')) with check (public.a_permission('referentiels.gerer'));
alter policy types_gestion on public.types_action using (public.a_permission('referentiels.gerer')) with check (public.a_permission('referentiels.gerer'));
alter policy zones_gestion on public.zones using (public.a_permission('referentiels.gerer')) with check (public.a_permission('referentiels.gerer'));

-- Kits
alter policy kits_modeles_ajout on public.kits_modeles with check (public.a_permission('kits.gerer'));
alter policy kits_modeles_modif on public.kits_modeles using (public.a_permission('kits.gerer')) with check (public.a_permission('kits.gerer'));
alter policy kits_modeles_suppr on public.kits_modeles using (public.a_permission('kits.gerer'));
alter policy kits_mouvements_ajout on public.kits_mouvements with check (public.a_permission('kits.gerer') and motif <> 'remise');
alter policy kits_mouvements_modif on public.kits_mouvements
  using (public.a_permission('kits.gerer') and motif <> 'remise') with check (public.a_permission('kits.gerer') and motif <> 'remise');
alter policy kits_mouvements_suppr on public.kits_mouvements using (public.a_permission('kits.gerer') and motif <> 'remise');

-- Partenaires et leurs accès
alter policy partenaires_gestion on public.partenaires using (public.a_permission('partenaires.gerer')) with check (public.a_permission('partenaires.gerer'));
alter policy acces_gestion on public.acces_partenaires with check (public.a_permission('partenaires.gerer'));
alter policy acces_lecture on public.acces_partenaires using (public.a_permission('partenaires.gerer') or user_id = auth.uid());
alter policy acces_modif on public.acces_partenaires using (public.a_permission('partenaires.gerer')) with check (public.a_permission('partenaires.gerer'));
alter policy acces_suppr on public.acces_partenaires using (public.a_permission('partenaires.gerer'));

-- Membres
alter policy membres_ajout on public.membres with check (public.a_permission('membres.gerer'));
alter policy membres_modif on public.membres using (public.a_permission('membres.gerer')) with check (public.a_permission('membres.gerer'));
alter policy membres_suppr on public.membres using (public.a_permission('membres.supprimer'));

-- Historique, journal médical
alter policy journal_lecture on public.journal using (public.a_permission('journal.voir') or (action_id is not null and public.peut_gerer_action(action_id)));
alter policy journal_medical_lecture on public.journal_medical using (public.a_permission('medical.journal'));

-- Rappels
alter policy rappels_cibles_lecture on public.rappels_cibles using (public.a_permission('rappels.voir') or envoye_par = public.mon_membre_id());
alter policy rappels_lecture on public.rappels_envoyes using (public.a_permission('rappels.voir') or membre_id = public.mon_membre_id());
alter policy rappels_lancements_lecture on public.rappels_lancements using (public.a_permission('rappels.voir'));
alter policy reglages_rappels_modif on public.reglages_rappels using (public.a_permission('rappels.regler')) with check (public.a_permission('rappels.regler'));

-- Médias du site public
alter policy vitrine_ajout on public.vitrine_medias with check (public.a_permission('vitrine.gerer'));
alter policy vitrine_lecture on public.vitrine_medias using (publie or public.a_permission('vitrine.gerer'));
alter policy vitrine_modif on public.vitrine_medias using (public.a_permission('vitrine.gerer')) with check (public.a_permission('vitrine.gerer'));
alter policy vitrine_suppr on public.vitrine_medias using (public.a_permission('vitrine.gerer'));
alter policy vitrine_fichiers_depot on storage.objects with check (bucket_id = 'vitrine' and public.a_permission('vitrine.gerer'));
alter policy vitrine_fichiers_lecture on storage.objects using (bucket_id = 'vitrine' and public.a_permission('vitrine.gerer'));
alter policy vitrine_fichiers_remplacement on storage.objects
  using (bucket_id = 'vitrine' and public.a_permission('vitrine.gerer')) with check (bucket_id = 'vitrine' and public.a_permission('vitrine.gerer'));
alter policy vitrine_fichiers_suppr on storage.objects using (bucket_id = 'vitrine' and public.a_permission('vitrine.gerer'));
