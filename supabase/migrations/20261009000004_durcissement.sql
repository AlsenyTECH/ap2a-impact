-- =====================================================================
-- Durcissement (recommandations du contrôle de sécurité Supabase).
-- =====================================================================

-- search_path figé sur toutes les fonctions.
alter function public.toucher_modifie_le() set search_path = public;
alter function public.attribuer_numero_adherent() set search_path = public;
alter function public.est_gestionnaire() set search_path = public;
alter function public.calculer_chemin_zone() set search_path = public;
alter function public.normaliser_telephone(text) set search_path = public;
alter function public.preparer_cible() set search_path = public;
alter function public.voit_cibles() set search_path = public;
alter function public.beneficiaire_du_fichier(text) set search_path = public;

-- Par défaut, PostgreSQL permet à tout le monde d'exécuter une fonction.
-- Personne n'appelle les fonctions directement : on retire ce droit, puis
-- on ne le rend aux comptes connectés que pour les fonctions utilisées par
-- les règles d'accès (elles ne renseignent que sur le membre connecté).
-- Les fonctions de déclencheur n'ont pas besoin de ce droit pour s'exécuter.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.mon_membre_id(), public.mon_role(), public.a_role(variadic role_membre[]),
  public.est_gestionnaire(), public.voit_cibles(), public.peut_gerer_action(uuid),
  public.dans_equipe(uuid), public.beneficiaire_du_fichier(text), public.normaliser_telephone(text)
to authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
