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
exception when insufficient_privilege or check_violation then
  raise notice 'ok - refusé : %', msg;
end $$;
create function t.qui(email text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', (select id::text from auth.users u where u.email = qui.email), false)
$$;
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
select t.refuse($$insert into cibles (type, nom) values ('groupe', 'GIE pirate')$$, 'inconnu : création de cible');
reset role;
set role anon;
select t.refuse($$select * from membres$$, 'anonyme : lecture des membres');
reset role;
set role authenticated;

-- ===== Coordinateur =====
select t.qui('coord@ap2a.sn');
insert into cibles (type, nom, prenom, sexe, telephone, zone_id)
  values ('personne', 'Diop', 'Mamadou', 'M', '+221 77 000 11 22', (select id from zones where nom = 'Unité 17'));
insert into cibles (type, nom, sous_type, effectif, prenom) values ('asc', 'ASC Jappo', 'football', 40, 'ignoré');
select t.ok((select prenom from cibles where nom = 'ASC Jappo') is null, 'collectif : le prénom est effacé');
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

-- ===== Bureau et admin =====
select t.qui('bureau@ap2a.sn');
update actions set statut = 'terminee', date_fin = '2026-05-31';
select t.ok((select statut from actions) = 'terminee', 'bureau : gère toutes les actions');
select t.refuse($$update membres set role = 'bureau' where email = 'membre@ap2a.sn'$$, 'bureau : changer un rôle');
select t.qui('admin@ap2a.sn');
update membres set role = 'coordinateur' where email = 'membre@ap2a.sn';
select t.ok((select role from membres where email = 'membre@ap2a.sn') = 'coordinateur', 'admin : change le rôle d''un membre');
select t.refuse($$update membres set role = 'membre' where email = 'admin@ap2a.sn'$$, 'admin : changer son propre rôle');
update membres set actif = false where email = 'coord2@ap2a.sn';
select t.qui('coord2@ap2a.sn');
select t.ok((select count(*) from actions) = 0, 'membre désactivé : plus aucun accès');
reset role;
\echo 'Tous les tests sont passés.'
