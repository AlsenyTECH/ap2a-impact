-- Tests des règles d'accès. Chaque vérification lève une erreur si elle
-- échoue ; le script s'arrête alors (ON_ERROR_STOP).
\set QUIET on
create schema t;
grant usage on schema t to authenticated, anon;
create function t.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'ÉCHEC : %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
create function t.refuse(requete text, msg text) returns void language plpgsql as $$
begin
  execute requete;
  raise exception 'ÉCHEC (aurait dû être refusé) : %', msg;
exception when insufficient_privilege or check_violation or unique_violation then
  raise notice 'ok - refusé : %', msg;
end $$;
create function t.qui(email text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', (select id::text from auth.users u where u.email = qui.email), false)
$$;
create function t.cat(motif text) returns int language sql security definer as $$ select id from public.categories_cible where libelle like motif order by id limit 1 $$;
create function t.profil(motif text) returns int language sql security definer as $$ select id from public.profils_personne where libelle like motif order by id limit 1 $$;
grant execute on all functions in schema t to authenticated, anon;
grant select on auth.users to authenticated;

-- Fiches membres préparées par le bureau, puis comptes créés : le lien se fait par l'email.
insert into membres (prenom, nom, email, role) values
  ('Fatou Kiné', 'Diakhaté', 'admin@ap2a.sn', 'admin'),
  ('Awa', 'Ndiaye', 'bureau@ap2a.sn', 'bureau'),
  ('Moussa', 'Fall', 'coord@ap2a.sn', 'coordinateur'),
  ('Ibrahima', 'Sow', 'coord2@ap2a.sn', 'coordinateur'),
  ('Aminata', 'Ba', 'membre@ap2a.sn', 'membre');
insert into auth.users (email) values
  ('admin@ap2a.sn'), ('BUREAU@ap2a.sn'), ('coord@ap2a.sn'), ('coord2@ap2a.sn'), ('membre@ap2a.sn'), ('inconnu@gmail.com');
update auth.users set email = lower(email);

select t.ok((select count(*) from membres where user_id is not null) = 5, 'les 5 comptes sont reliés à leur fiche (email insensible à la casse)');
select t.ok((select numero_adherent from membres where email = 'admin@ap2a.sn') = 'AP2A-00001', 'numéro d''adhérent automatique');
select t.ok((select count(*) from zones where niveau = 'region') = 14, '14 régions');
select t.ok((select count(*) from zones where niveau = 'departement') = 46, '46 départements');
select t.ok(exists (select 1 from zones where chemin = 'Dakar > Dakar > Parcelles Assainies > Unité 17'), 'Unité 17 des Parcelles Assainies');
select t.ok(normaliser_telephone('+221 77 123 45 67') = '771234567' and normaliser_telephone('00221771234567') = '771234567', 'normalisation du téléphone');

set role authenticated;

-- ===== Inconnu (compte sans fiche) et anonyme =====
select t.qui('inconnu@gmail.com');
select t.ok((select count(*) from membres) = 0, 'inconnu : ne voit aucun membre');
select t.ok((select count(*) from zones) = 0, 'inconnu : ne voit pas les référentiels');
select t.refuse($$insert into cibles (categorie_id, nom) values (1, 'GIE pirate')$$, 'inconnu : création de cible');
reset role;
set role anon;
select t.refuse($$select * from membres$$, 'anonyme : lecture des membres');
reset role;
set role authenticated;

-- ===== Coordinateur =====
select t.qui('coord@ap2a.sn');
insert into cibles (categorie_id, nom, prenom, sexe, telephone, zone_id)
  values (t.cat('Personne'), 'Diop', 'Mamadou', 'M', '+221 77 000 11 22', (select id from zones where nom = 'Unité 17'));
insert into cibles (categorie_id, nom, sous_type, effectif, prenom, situation_id) values (t.cat('ASC%'), 'ASC Jappo', 'football', 40, 'ignoré', t.profil('Salarié%'));
select t.ok((select type from cibles where nom = 'ASC Jappo') = 'collectif', 'la nature découle de la catégorie');
select t.ok((select prenom is null and situation_id is null from cibles where nom = 'ASC Jappo'), 'collectif : prénom et situation effacés');
select t.refuse($$insert into cibles (categorie_id, nom, prenom, vulnerabilites) values (t.cat('Personne'), 'X', 'Y', array[t.profil('Salarié%')])$$, 'une situation donnée comme vulnérabilité');
select t.refuse($$insert into cibles (categorie_id, nom, situation_id, prenom) values (t.cat('Personne'), 'X', t.profil('Handicap'), 'Y')$$, 'une vulnérabilité donnée comme situation');
update cibles set situation_id = t.profil('Apprenti%'), vulnerabilites = array[t.profil('Orphelin%')], metier = 'Électricité' where nom = 'Diop';
select t.ok((select metier from cibles where nom = 'Diop') = 'Électricité' and (select cardinality(vulnerabilites) from cibles where nom = 'Diop') = 1, 'personne : situation, métier et vulnérabilités');
insert into appartenances (personne_id, collectif_id, role) values ((select id from cibles where nom = 'Diop'), (select id from cibles where nom = 'ASC Jappo'), 'trésorier');
select t.ok((select count(*) from appartenances) = 1, 'coordinateur : ajoute un membre à l''ASC');
select t.refuse($$insert into appartenances (personne_id, collectif_id) values ((select id from cibles where nom = 'ASC Jappo'), (select id from cibles where nom = 'Diop'))$$, 'un collectif membre d''une personne');
-- Ménage : créé avec son chef en une opération.
insert into cibles (categorie_id, nom, prenom, sexe) values (t.cat('Personne'), 'Ndiaye', 'Coumba', 'F');
select t.ok(creer_menage((select id from cibles where prenom = 'Coumba'), 6) is not null, 'creer_menage renvoie le ménage');
select t.ok((select nom || '/' || effectif || '/' || type from cibles where categorie_id = t.cat('Ménage')) = 'Ménage Coumba Ndiaye/6/menage', 'ménage créé avec son nom et sa taille');
select t.ok((select role from appartenances a join cibles c on c.id = a.collectif_id where c.type = 'menage') = 'Chef de ménage', 'chef de ménage inscrit');
select t.refuse($$insert into appartenances (personne_id, collectif_id, role) values ((select id from cibles where nom = 'Diop'), (select id from cibles where type = 'menage'), 'Chef de ménage')$$ , 'deux chefs pour un ménage');
insert into appartenances (personne_id, collectif_id, role) values ((select id from cibles where nom = 'Diop'), (select id from cibles where type = 'menage'), 'Enfant');
select t.ok((select count(*) from appartenances a join cibles c on c.id = a.collectif_id where c.type = 'menage') = 2, 'autre membre du ménage ajouté');
select t.ok((select groupes from cibles where nom = 'Diop') = 'ASC Jappo, Ménage Coumba Ndiaye', 'groupes de la personne tenus à jour');
select t.ok((select count(*) from cibles where type = 'personne' and recherche like '%asc jappo%') = 1, 'recherche par le nom du groupe (sans accents ni majuscules)');
select t.ok((select count(*) from cibles where type = 'personne' and recherche like '%menage coumba%') = 2, 'recherche sans accents');
update cibles set nom = 'ASC Jappo Unité 17' where nom = 'ASC Jappo';
select t.ok((select groupes from cibles where nom = 'Diop') like 'ASC Jappo Unité 17%', 'groupe renommé : membres mis à jour');
select t.ok((select count(*) from familles_cible) = 11 and (select count(*) from categories_cible) > 40, 'familles et catégories lisibles');
select t.refuse($$insert into familles_cible (nom) values ('X')$$, 'coordinateur : ajouter une famille');
select t.refuse($$insert into profils_personne (genre, libelle) values ('situation', 'X')$$, 'coordinateur : ajouter une situation');
select t.ok((select cree_par from cibles where nom = 'Diop') = mon_membre_id(), 'coordinateur : auteur rempli automatiquement');
select t.ok((select telephone_normalise from cibles where nom = 'Diop') = '770001122', 'téléphone normalisé à l''enregistrement');
insert into actions (type_id, titre, date_debut, responsable_id)
  values ((select id from types_action where code = 'formation'), 'Formation électricité bâtiment', '2026-03-01', mon_membre_id());
insert into action_partenaires values ((select id from actions), (select id from partenaires where sigle = '3FPT'), 'formateur');
insert into action_equipe values ((select id from actions), (select id from membres where email = 'membre@ap2a.sn'), 'logistique');
insert into beneficiaires (action_id, cible_id) values ((select id from actions), (select id from cibles where nom = 'Diop'));
insert into apports (beneficiaire_id, nature, description, partenaire_id, numero_document)
  values ((select id from beneficiaires), 'certificat', 'Certificat électricité bâtiment', (select id from partenaires where sigle = '3FPT'), '3FPT-2026-0042');
insert into apports (beneficiaire_id, nature, description, valeur_fcfa)
  values ((select id from beneficiaires), 'kit', 'Kit d''électricien', 150000);
insert into storage.objects (bucket_id, name) values ('justificatifs', (select id from beneficiaires) || '/certificat.jpg');
select t.ok((select count(*) from apports) = 2, 'coordinateur : enregistre certificat (partenaire) et kit');
update membres set role = 'admin' where email = 'coord@ap2a.sn';
select t.ok(mon_role() = 'coordinateur', 'coordinateur : ne peut pas se donner le rôle admin');
select t.refuse($$insert into partenaires (nom) values ('X')$$, 'coordinateur : modifier les référentiels');

-- ===== Autre coordinateur : voit, mais ne gère pas l'action d'un autre =====
select t.qui('coord2@ap2a.sn');
select t.ok((select count(*) from beneficiaires) = 1, 'coordinateur 2 : voit les bénéficiaires');
update actions set titre = 'piraté';
select t.ok((select titre from actions) = 'Formation électricité bâtiment', 'coordinateur 2 : ne modifie pas l''action d''un autre');
select t.refuse($$insert into apports (beneficiaire_id, nature, description) values ((select id from beneficiaires), 'don', 'x')$$, 'coordinateur 2 : ajout d''apport sur l''action d''un autre');
select t.refuse($$insert into storage.objects (bucket_id, name) values ('justificatifs', (select id from beneficiaires) || '/faux.jpg')$$, 'coordinateur 2 : dépôt de fichier');
update cibles set notes = 'x' where nom = 'Diop';
select t.ok((select notes from cibles where nom = 'Diop') is null, 'coordinateur 2 : ne modifie pas une cible qui n''est pas la sienne');

-- ===== Membre simple =====
select t.qui('membre@ap2a.sn');
select t.ok((select count(*) from actions) = 1, 'membre : voit les actions');
select t.ok((select count(*) from cibles) = 1, 'membre de l''équipe : voit seulement les bénéficiaires de son action');
select t.ok((select count(*) from storage.objects) = 1, 'membre de l''équipe : voit le certificat');
select t.refuse($$insert into actions (type_id, titre, date_debut) values (1, 'x', current_date)$$, 'membre : créer une action');
reset role;
delete from action_equipe;
set role authenticated;
select t.ok((select count(*) from cibles) = 0 and (select count(*) from apports) = 0, 'membre hors équipe : ne voit aucune donnée personnelle');

-- ===== Séances et présences (action en cours) =====
select t.qui('coord@ap2a.sn');
insert into seances (action_id, date, heure_debut, heure_fin, theme) values
  ((select id from actions), '2026-03-02', '09:00', '12:00', 'Sécurité électrique'),
  ((select id from actions), '2026-03-03', '09:00', '12:00', 'Schémas électriques');
insert into action_equipe values ((select id from actions), (select id from membres where email = 'membre@ap2a.sn'), 'Appel');
select t.ok((select count(*) from seances) = 2, 'responsable : planifie les séances');
select t.qui('membre@ap2a.sn');
insert into presences (seance_id, beneficiaire_id, present) select id, (select id from beneficiaires), true from seances;
select t.ok((select count(*) from presences where present) = 2, 'membre de l''équipe : fait l''appel');
select t.refuse($$insert into seances (action_id, date) values ((select id from actions), current_date)$$, 'membre de l''équipe : créer une séance');
select t.qui('coord2@ap2a.sn');
update presences set present = false;
select t.ok((select count(*) from presences where not present) = 0, 'autre coordinateur : ne modifie pas l''appel');

-- ===== Bureau et admin =====
select t.qui('bureau@ap2a.sn');
update actions set statut = 'terminee', date_fin = '2026-05-31';
select t.ok((select statut from actions) = 'terminee', 'bureau : gère toutes les actions');
-- Action clôturée : tout est figé, sauf le bilan.
select t.refuse($$insert into beneficiaires (action_id, cible_id) values ((select id from actions), (select id from cibles where prenom = 'Coumba'))$$, 'clôturée : ajouter un bénéficiaire');
select t.refuse($$update beneficiaires set statut = 'abandon'$$, 'clôturée : changer le statut d''un bénéficiaire');
select t.refuse($$delete from beneficiaires$$, 'clôturée : retirer un bénéficiaire');
select t.refuse($$insert into apports (beneficiaire_id, nature, description) values ((select id from beneficiaires), 'don', 'x')$$, 'clôturée : ajouter un apport');
select t.refuse($$delete from apports$$, 'clôturée : retirer un apport');
select t.refuse($$insert into action_equipe values ((select id from actions), (select id from membres where email = 'coord2@ap2a.sn'), null)$$, 'clôturée : modifier l''équipe');
select t.refuse($$insert into seances (action_id, date) values ((select id from actions), current_date)$$, 'clôturée : ajouter une séance');
select t.refuse($$update presences set present = false$$, 'clôturée : modifier l''appel');
select t.refuse($$update actions set titre = 'Autre titre'$$, 'clôturée : modifier l''action');
update actions set bilan = 'Promotion réussie';
select t.ok((select bilan from actions) = 'Promotion réussie', 'clôturée : le bilan peut être complété');
select t.refuse($$update actions set statut = 'en_cours'$$, 'bureau : rouvrir une action clôturée');
-- Journal
select t.ok(exists (select 1 from journal where table_nom = 'actions' and details->'statut'->>1 = 'terminee' and membre_id = mon_membre_id()), 'journal : clôture enregistrée avec son auteur');
select t.ok(exists (select 1 from journal where table_nom = 'beneficiaires' and operation = 'INSERT' and libelle = 'Mamadou Diop'), 'journal : ajout de bénéficiaire enregistré avec son nom');
select t.ok(exists (select 1 from journal where table_nom = 'action_equipe' and libelle like 'Aminata Ba (AP2A-%)'), 'journal : membre d''équipe identifié par son numéro');
select t.refuse($$insert into journal (table_nom, operation) values ('x', 'y')$$, 'journal : écriture directe interdite');
select t.refuse($$update membres set role = 'bureau' where email = 'membre@ap2a.sn'$$, 'bureau : changer un rôle');
select t.qui('admin@ap2a.sn');
update membres set role = 'coordinateur' where email = 'membre@ap2a.sn';
select t.ok((select role from membres where email = 'membre@ap2a.sn') = 'coordinateur', 'admin : change le rôle d''un membre');
select t.refuse($$update membres set role = 'membre' where email = 'admin@ap2a.sn'$$, 'admin : changer son propre rôle');
update membres set actif = false where email = 'coord2@ap2a.sn';
select t.qui('coord2@ap2a.sn');
select t.ok((select count(*) from actions) = 0, 'membre désactivé : plus aucun accès');

-- ===== V2 : suivis d'impact =====
-- Le bureau a clôturé l'action (fin le 31 mai 2026, type formation : 3, 6, 12 mois).
select t.qui('admin@ap2a.sn');
select t.ok((select count(*) from suivis) = 3, 'clôture : 3 suivis planifiés pour le bénéficiaire');
select t.ok((select array_agg(date_prevue order by echeance_mois) from suivis) = '{2026-08-31,2026-11-30,2027-05-31}'::date[], 'dates prévues à 3, 6 et 12 mois après la fin');
select t.ok((select charge_id from suivis_detail limit 1) = (select id from membres where email = 'coord@ap2a.sn'), 'chargé du suivi : le responsable de l''action (pas de référent)');
update actions set statut = 'en_cours';
select t.ok((select statut from actions) = 'en_cours', 'admin : rouvre une action clôturée');
update actions set date_fin = '2026-06-30';
update actions set statut = 'terminee';
select t.ok((select min(date_prevue) from suivis) = '2026-09-30', 'date de fin modifiée puis reclôture : suivis non faits recalés');

select t.qui('coord@ap2a.sn');
update suivis set fait_le = '2026-09-02', situation = 'reussi', activite = 'Électricien à son compte',
  revenu_mensuel_fcfa = 120000, emplois_crees = 1, utilise_apport = true
  where echeance_mois = 3;
select t.ok((select situation from suivis where echeance_mois = 3) = 'reussi', 'chargé du suivi : renseigne le suivi à 3 mois');
select t.refuse($$update suivis set fait_le = current_date where echeance_mois = 6$$, 'suivi fait sans situation');
insert into suivis (beneficiaire_id, fait_le, situation, commentaire)
  values ((select id from beneficiaires), current_date, 'en_progres', 'Visite à l''atelier');
select t.ok((select count(*) from suivis) = 4, 'suivi spontané ajouté');

select t.qui('admin@ap2a.sn');
update actions set statut = 'en_cours';
update actions set date_fin = '2026-07-15';
update beneficiaires set statut = 'abandon';
select t.ok((select count(*) from suivis) = 2, 'abandon : suivis planifiés non faits supprimés, suivis faits conservés');
update beneficiaires set statut = 'termine';
update actions set statut = 'terminee';
select t.ok((select count(*) from suivis) = 4, 'retour puis reclôture : suivis replanifiés');
select t.ok((select fait_le from suivis where echeance_mois = 3) = '2026-09-02' and (select date_prevue from suivis where echeance_mois = 3) = '2026-09-30', 'suivi déjà fait : jamais recalé');
select t.ok((select cible_groupes from suivis_detail limit 1) like 'ASC Jappo%' and (select charge_numero from suivis_detail limit 1) like 'AP2A-%', 'vue des suivis : groupes et numéro du chargé');

-- Un coordinateur qui n'est ni responsable ni référent ne renseigne pas.
reset role;
update membres set actif = true where email = 'coord2@ap2a.sn';
set role authenticated;
select t.qui('coord2@ap2a.sn');
update suivis set commentaire = 'piraté' where echeance_mois = 6;
select t.ok((select commentaire from suivis where echeance_mois = 6) is null, 'autre coordinateur : ne renseigne pas le suivi');
-- ... sauf s'il devient le référent de la cible.
select t.qui('admin@ap2a.sn');
update cibles set referent_id = (select id from membres where email = 'coord2@ap2a.sn');
select t.qui('coord2@ap2a.sn');
update suivis set commentaire = 'Appel fait' where echeance_mois = 6;
select t.ok((select commentaire from suivis where echeance_mois = 6) = 'Appel fait', 'référent de la cible : renseigne le suivi');
select t.ok((select count(*) from suivis_detail where charge_id = mon_membre_id()) = 4, 'vue : les suivis de la cible lui sont attribués');
select t.qui('membre@ap2a.sn');
select t.ok((select count(*) from suivis) = 4, 'coordinateur (ex-membre) : lit les suivis');
select t.qui('inconnu@gmail.com');
select t.ok((select count(*) from suivis_detail) = 0, 'inconnu : ne voit aucun suivi');
reset role;
-- ===== Rappels par email =====
set role authenticated;
select t.qui('coord2@ap2a.sn');
select t.refuse($$select donnees_rappels('hebdo')$$, 'membre : ne lit pas le contenu des rappels');
reset role;
update suivis set date_prevue = current_date - 20 where echeance_mois = 6;
select t.ok((select jsonb_array_length(x->'suivis') from jsonb_array_elements(donnees_rappels('hebdo')) x where x->>'email' = 'coord2@ap2a.sn') = 1, 'rappel hebdo : le suivi en retard va à son chargé');
select t.ok((select (x->'suivis'->0->>'retard')::int from jsonb_array_elements(donnees_rappels('hebdo')) x where x->>'email' = 'coord2@ap2a.sn') = 20, 'rappel hebdo : nombre de jours de retard');
select t.ok((select jsonb_array_length(x->'retards') from jsonb_array_elements(donnees_rappels('hebdo')) x where x->>'email' = 'admin@ap2a.sn') = 1, 'rappel hebdo : l''admin est alerté des retards de plus de 15 jours');
select t.ok((select x->'retards' from jsonb_array_elements(donnees_rappels('hebdo')) x where x->>'email' = 'coord2@ap2a.sn') <> '[]', 'rappel hebdo : les coordinateurs sont aussi alertés des retards');
set role authenticated;
select t.qui('coord2@ap2a.sn');
select regler_rappels(false);
reset role;
select t.ok(not exists (select 1 from jsonb_array_elements(donnees_rappels('hebdo')) x where x->>'email' = 'coord2@ap2a.sn'), 'rappels désactivés : plus d''email');
select t.ok(jsonb_array_length(donnees_rappels('hebdo', (select id from membres where email = 'coord2@ap2a.sn'))) = 1, 'aperçu : envoyé même si les rappels sont désactivés');
select t.ok(donnees_rappels('seances') = '[]', 'rappel séances : aucune séance aujourd''hui');
\echo 'Tous les tests sont passés.'
