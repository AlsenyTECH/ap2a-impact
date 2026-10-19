-- =====================================================================
-- Mise à zéro avant le démarrage réel (à coller UNE FOIS dans
-- Supabase > SQL Editor, puis « Run »). DÉFINITIF.
--
-- Garde : les comptes d'Alseny DIALLO et de Thierno DIAKHATE, la fiche du
-- partenaire 3FPT, les réglages (catégories, zones, types d'action,
-- profils, rôles et droits, rappels) et les médias du site public.
-- Efface tout le reste : cibles, actions, bénéficiaires, apports, suivis,
-- séances, événements, kits, cartes, accès partenaires, historique,
-- données de démonstration, et les autres comptes de connexion.
-- =====================================================================
begin;
select set_config('ap2a.purge_demo', 'on', true);   -- lève les verrous des actions clôturées

delete from public.rappels_cibles;
delete from public.rappels_envoyes;
delete from public.evenements;              -- invités, présences, liens aux actions
delete from public.actions;                 -- bénéficiaires, apports, suivis, séances, équipe
delete from public.kits_mouvements;
delete from public.kits_modeles;
delete from public.appartenances;
delete from public.cartes
  where cible_id is not null
     or membre_id not in (select id from public.membres where lower(email) in ('mathsnexus2024@gmail.com', 'thdiakhate@gmail.com'));
delete from public.cibles;
delete from public.acces_partenaires;
delete from public.partenaires where nom <> 'Fonds de Financement de la Formation professionnelle et technique';
delete from public.journal;
delete from public.journal_medical;
delete from public.donnees_demo;
delete from public.membres where lower(coalesce(email, '')) not in ('mathsnexus2024@gmail.com', 'thdiakhate@gmail.com');
delete from auth.users where lower(email) not in ('mathsnexus2024@gmail.com', 'thdiakhate@gmail.com');

commit;

-- Vérification : doit afficher 2 membres, 2 comptes, 0 cible, 0 action, 1 partenaire.
select (select count(*) from public.membres) as membres, (select count(*) from auth.users) as comptes,
       (select count(*) from public.cibles) as cibles, (select count(*) from public.actions) as actions,
       (select count(*) from public.partenaires) as partenaires;
