-- Fichier généré par supabase/demo/generer.py — ne pas modifier à la main.
-- Données fictives de démonstration (noms et numéros inventés).
-- ===== PARTIE 1/4 =====
-- Identifiants déterministes : chaque partie du fichier peut s'exécuter seule.
create or replace function pg_temp.k(c text) returns uuid language sql immutable as $$ select md5('ap2a-demo:' || c)::uuid $$;
create or replace function pg_temp.d(n int) returns date language sql as $$ select current_date + n $$;
create or replace function pg_temp.z(u int) returns int language sql as $$
  select id from public.zones where chemin = 'Dakar > Dakar > Parcelles Assainies > Unité ' || u $$;
create or replace function pg_temp.c(l text) returns int language sql as $$ select id from public.categories_cible where libelle = l $$;
create or replace function pg_temp.p(g text, l text) returns int language sql as $$
  select id from public.profils_personne where left(genre, 1) = g and libelle = l $$;
create or replace function pg_temp.t(c text) returns int language sql as $$ select id from public.types_action where code = c $$;
create or replace function pg_temp.f() returns uuid language sql as $$ select id from public.partenaires where sigle = '3FPT' limit 1 $$;
create or replace function pg_temp.pers(cle text, pre text, nm text, sx text, naiss int, tel text, sit text, met text, vul text[], u int, ref text) returns void
language sql as $$
  insert into public.cibles (id, categorie_id, prenom, nom, sexe, date_naissance, telephone, situation_id, metier, vulnerabilites, zone_id, referent_id)
  values (pg_temp.k(cle), pg_temp.c('Personne'), pre, nm, sx, pg_temp.d(naiss), tel, pg_temp.p('s', sit), met,
          coalesce((select array_agg(pg_temp.p('v', v)) from unnest(vul) v), '{}'), pg_temp.z(u),
          case when ref is null then null else pg_temp.k('membre-' || ref) end) $$;
create or replace function pg_temp.benef(cle text, act text, cib text, st text, via text) returns void language sql as $$
  insert into public.beneficiaires (id, action_id, cible_id, statut, via_collectif_id)
  values (pg_temp.k(cle), pg_temp.k('action-' || act), pg_temp.k(cib), st::public.statut_beneficiaire,
          case when via is null then null else pg_temp.k(via) end) $$;
create or replace function pg_temp.apport(b text, nat text, descr text, val bigint, qte numeric, par text, num text, j int) returns void language sql as $$
  insert into public.apports (beneficiaire_id, nature, description, valeur_fcfa, quantite, partenaire_id, numero_document, date_remise)
  values (pg_temp.k(b), nat::public.nature_apport, descr, val, qte,
          case when par is null then null when par = '3fpt' then pg_temp.f() else pg_temp.k('partenaire-' || par) end, num, pg_temp.d(j)) $$;
create or replace function pg_temp.suivi(b text, mois int, retard int, sit text, act text, rev bigint, emp int, ut boolean, com text, par text) returns void language sql as $$
  update public.suivis set fait_le = least(current_date, date_prevue + retard), situation = sit::public.situation_suivi, activite = act,
    revenu_mensuel_fcfa = rev, emplois_crees = emp, utilise_apport = ut, commentaire = com, saisi_par = pg_temp.k('membre-' || par)
  where beneficiaire_id = pg_temp.k(b) and echeance_mois = mois $$;
begin;
insert into public.membres (id, prenom, nom, telephone, email, role, fonction, date_adhesion) values (pg_temp.k('membre-mariama'), 'Mariama', 'Ba', '77 427 74 75', 'mariama@demo.ap2a.sn', 'bureau', 'Trésorière', pg_temp.d(-862));
insert into public.membres (id, prenom, nom, telephone, email, role, fonction, date_adhesion) values (pg_temp.k('membre-moussa'), 'Moussa', 'Fall', '77 328 86 89', 'moussa@demo.ap2a.sn', 'coordinateur', 'Coordinateur formations', pg_temp.d(-769));
insert into public.membres (id, prenom, nom, telephone, email, role, fonction, date_adhesion) values (pg_temp.k('membre-awa'), 'Awa', 'Ndiaye', '70 902 83 80', 'awa@demo.ap2a.sn', 'coordinateur', 'Coordinatrice santé et social', pg_temp.d(-702));
insert into public.membres (id, prenom, nom, telephone, email, role, fonction, date_adhesion) values (pg_temp.k('membre-ibrahima'), 'Ibrahima', 'Sarr', '70 345 10 88', 'ibrahima@demo.ap2a.sn', 'coordinateur', 'Coordinateur environnement', pg_temp.d(-282));
insert into public.membres (id, prenom, nom, telephone, email, role, fonction, date_adhesion) values (pg_temp.k('membre-khady'), 'Khady', 'Sène', '77 394 22 67', 'khady@demo.ap2a.sn', 'membre', 'Chargée de communication', pg_temp.d(-211));
insert into public.membres (id, prenom, nom, telephone, email, role, fonction, date_adhesion) values (pg_temp.k('membre-ousmane'), 'Ousmane', 'Diouf', '70 795 50 36', 'ousmane@demo.ap2a.sn', 'membre', null, pg_temp.d(-606));
insert into public.membres (id, prenom, nom, telephone, email, role, fonction, date_adhesion) values (pg_temp.k('membre-pape'), 'Pape', 'Gueye', '76 456 55 58', 'pape@demo.ap2a.sn', 'membre', null, pg_temp.d(-725));
insert into public.partenaires (id, nom, sigle, domaine, contact_nom, telephone) values (pg_temp.k('partenaire-hopital'), 'Clinique ophtalmologique partenaire (démo)', 'COP', 'Santé', 'Dr Ndèye Mbaye', '77 840 53 21');
insert into public.partenaires (id, nom, sigle, domaine, contact_nom, telephone) values (pg_temp.k('partenaire-banque'), 'Banque alimentaire de Dakar (démo)', 'BAD', 'Aide alimentaire', 'Cheikh Kane', '76 394 68 28');
insert into public.partenaires (id, nom, sigle, domaine, contact_nom, telephone) values (pg_temp.k('partenaire-mairie'), 'Services municipaux (démo)', null, 'Collectivité', 'Service social', '76 125 57 56');
insert into public.partenaires (id, nom, sigle, domaine, contact_nom, telephone) values (pg_temp.k('partenaire-quincaillerie'), 'Quincaillerie Touba Parcelles (démo)', null, 'Fournisseur de kits', 'Modou Seck', '70 532 21 61');
select pg_temp.pers('personne-elec0', 'Alioune', 'Sow', 'M', -10114, '70 507 77 43', 'Apprenti(e)', 'Électricité', '{}', 16, 'moussa');
select pg_temp.pers('personne-elec1', 'Alioune', 'Diouf', 'M', -8772, '78 884 26 16', 'Apprenti(e)', 'Électricité', '{}', 19, 'moussa');
select pg_temp.pers('personne-elec2', 'Modou', 'Touré', 'M', -9709, '70 245 71 39', 'Apprenti(e)', 'Électricité', '{}', 22, 'moussa');
select pg_temp.pers('personne-elec3', 'Souleymane', 'Mbengue', 'M', -7214, '76 673 61 95', 'Apprenti(e)', 'Électricité', '{"Orphelin(e)"}', 17, 'moussa');
select pg_temp.pers('personne-elec4', 'Alioune', 'Cissé', 'M', -8133, '76 951 44 11', 'Apprenti(e)', 'Électricité', '{}', 16, 'moussa');
select pg_temp.pers('personne-elec5', 'Souleymane', 'Diouf', 'M', -6754, '78 366 98 72', 'En recherche d''emploi', 'Électricité', '{}', 17, 'moussa');
select pg_temp.pers('personne-elec6', 'Alioune', 'Kane', 'M', -9142, '76 424 68 22', 'Apprenti(e)', 'Électricité', '{}', 19, 'moussa');
select pg_temp.pers('personne-elec7', 'Adama', 'Thiam', 'F', -9342, '70 165 93 44', 'Apprenti(e)', 'Électricité', '{}', 11, 'moussa');
select pg_temp.pers('personne-elec8', 'Coumba', 'Faye', 'F', -9335, '78 560 11 21', 'Sans activité', 'Électricité', '{}', 25, 'moussa');
select pg_temp.pers('personne-plomb0', 'Souleymane', 'Camara', 'M', -6612, '78 353 25 89', 'En recherche d''emploi', 'Plomberie', '{}', 19, 'moussa');
select pg_temp.pers('personne-plomb1', 'Omar', 'Mbengue', 'M', -6752, '78 105 50 95', 'En recherche d''emploi', 'Plomberie', '{}', 26, 'moussa');
select pg_temp.pers('personne-plomb2', 'Babacar', 'Niang', 'M', -9367, '78 712 98 74', 'En recherche d''emploi', 'Plomberie', '{}', 13, 'moussa');
select pg_temp.pers('personne-plomb3', 'Cheikh', 'Kane', 'M', -8111, '78 902 85 49', 'En recherche d''emploi', 'Plomberie', '{}', 24, 'moussa');
select pg_temp.pers('personne-plomb4', 'Idrissa', 'Cissé', 'M', -9566, '78 485 11 23', 'En recherche d''emploi', 'Plomberie', '{}', 26, 'moussa');
select pg_temp.pers('personne-plomb5', 'Cheikh', 'Ndiaye', 'M', -8940, '77 126 75 70', 'En recherche d''emploi', 'Plomberie', '{}', 15, 'moussa');
select pg_temp.pers('personne-gpf0', 'Dieynaba', 'Thiam', 'F', -11846, '77 609 69 83', 'Sans activité', 'Couture', '{}', 17, 'awa');
select pg_temp.pers('personne-gpf1', 'Astou', 'Camara', 'F', -15231, '78 544 89 53', 'Au foyer', 'Couture', '{"Femme cheffe de ménage"}', 17, 'awa');
select pg_temp.pers('personne-gpf2', 'Sokhna', 'Mbengue', 'F', -13175, '70 134 35 92', 'Sans activité', 'Couture', '{}', 17, 'awa');
select pg_temp.pers('personne-gpf3', 'Fatou', 'Thiam', 'F', -9951, '70 828 96 12', 'Au foyer', 'Couture', '{}', 17, 'awa');
select pg_temp.pers('personne-gpf4', 'Bineta', 'Diouf', 'F', -9560, '78 777 33 59', 'Sans activité', 'Couture', '{"Femme cheffe de ménage"}', 17, 'awa');
select pg_temp.pers('personne-gpf5', 'Maimouna', 'Fall', 'F', -11146, '76 291 54 32', 'À son compte (artisan, commerçant)', 'Couture', '{}', 17, 'awa');
select pg_temp.pers('personne-gpf6', 'Oumy', 'Kane', 'F', -11097, '70 281 51 76', 'À son compte (artisan, commerçant)', 'Couture', '{}', 17, 'awa');
select pg_temp.pers('personne-gpf7', 'Coumba', 'Diouf', 'F', -13773, '76 935 22 37', 'À son compte (artisan, commerçant)', 'Couture', '{}', 17, 'awa');
select pg_temp.pers('personne-gpf8', 'Ndeye', 'Thiam', 'F', -10754, '70 658 95 33', 'Au foyer', 'Couture', '{}', 17, 'awa');
select pg_temp.pers('personne-gpf9', 'Rokhaya', 'Ndao', 'F', -8317, '78 212 89 45', 'À son compte (artisan, commerçant)', 'Couture', '{}', 17, 'awa');
select pg_temp.pers('personne-cata0', 'Dieynaba', 'Camara', 'F', -29484, '78 203 43 22', 'Retraité(e)', null, '{"Personne âgée isolée"}', 14, 'awa');
select pg_temp.pers('personne-cata1', 'Modou', 'Mbengue', 'M', -24637, '78 761 90 23', 'Retraité(e)', null, '{"Maladie chronique"}', 7, 'awa');
select pg_temp.pers('personne-cata2', 'Cheikh', 'Sy', 'M', -25632, '76 362 18 11', 'Retraité(e)', null, '{}', 15, 'awa');
select pg_temp.pers('personne-cata3', 'Idrissa', 'Diop', 'M', -25599, '78 123 49 25', 'Retraité(e)', null, '{"Personne âgée isolée"}', 7, 'awa');
select pg_temp.pers('personne-cata4', 'Yacine', 'Mbaye', 'F', -29068, '77 513 50 87', 'Retraité(e)', null, '{"Maladie chronique"}', 26, 'awa');
select pg_temp.pers('personne-cata5', 'Maimouna', 'Mbengue', 'F', -27931, '76 498 47 55', 'Retraité(e)', null, '{}', 9, 'awa');
select pg_temp.pers('personne-cata6', 'Aminata', 'Sy', 'F', -27544, '76 844 25 48', 'Retraité(e)', null, '{"Personne âgée isolée"}', 25, 'awa');
select pg_temp.pers('personne-asc0', 'Saliou', 'Camara', 'M', -10230, '76 302 81 17', 'Apprenti(e)', null, '{}', 22, null);
select pg_temp.pers('personne-asc1', 'Abdou', 'Sène', 'M', -9917, '77 138 26 76', 'Élève / étudiant(e)', null, '{}', 22, null);
select pg_temp.pers('personne-asc2', 'Assane', 'Diop', 'M', -7882, '78 464 63 59', 'En recherche d''emploi', null, '{}', 22, null);
select pg_temp.pers('personne-asc3', 'Idrissa', 'Mbengue', 'M', -8142, '78 287 79 13', 'Élève / étudiant(e)', null, '{}', 22, null);
select pg_temp.pers('personne-asc4', 'Bamba', 'Diallo', 'M', -9565, '78 123 12 45', 'En recherche d''emploi', null, '{}', 22, null);
select pg_temp.pers('personne-asc5', 'Idrissa', 'Diallo', 'M', -8921, '78 741 85 21', 'Apprenti(e)', null, '{}', 22, null);
select pg_temp.pers('personne-asc6', 'Aliou', 'Dieng', 'M', -6833, '76 448 91 76', 'En recherche d''emploi', null, '{}', 22, null);
select pg_temp.pers('personne-asc7', 'Saliou', 'Ndiaye', 'M', -10225, '78 581 17 38', 'En recherche d''emploi', null, '{}', 22, null);
select pg_temp.pers('personne-chef0', 'Yacine', 'Sarr', 'F', -24742, '76 451 35 57', 'À son compte (artisan, commerçant)', null, '{"Femme cheffe de ménage","Veuf / veuve"}', 19, 'awa');
insert into public.cibles (id, categorie_id, nom, telephone, effectif, zone_id, referent_id) values (pg_temp.k('menage-0'), pg_temp.c('Ménage'), 'Ménage Yacine Sarr', '76 570 91 68', 11, pg_temp.z(19), pg_temp.k('membre-awa'));
insert into public.appartenances values (pg_temp.k('personne-chef0'), pg_temp.k('menage-0'), 'Chef de ménage');
select pg_temp.pers('personne-enfant0', 'Abdou', 'Sarr', 'M', -4225, '78 596 10 55', 'Élève / étudiant(e)', null, '{}', 19, null);
insert into public.appartenances values (pg_temp.k('personne-enfant0'), pg_temp.k('menage-0'), 'Enfant');
select pg_temp.pers('personne-chef1', 'Abdou', 'Fall', 'M', -24973, '76 659 43 27', 'Retraité(e)', null, '{}', 11, 'awa');
insert into public.cibles (id, categorie_id, nom, telephone, effectif, zone_id, referent_id) values (pg_temp.k('menage-1'), pg_temp.c('Ménage'), 'Ménage Abdou Fall', '77 118 78 37', 8, pg_temp.z(11), pg_temp.k('membre-awa'));
insert into public.appartenances values (pg_temp.k('personne-chef1'), pg_temp.k('menage-1'), 'Chef de ménage');
select pg_temp.pers('personne-enfant1', 'Penda', 'Fall', 'F', -5385, '78 620 23 20', 'Élève / étudiant(e)', null, '{}', 11, null);
insert into public.appartenances values (pg_temp.k('personne-enfant1'), pg_temp.k('menage-1'), 'Enfant');
select pg_temp.pers('personne-chef2', 'Omar', 'Sy', 'M', -16081, '78 266 47 47', 'Retraité(e)', null, '{}', 17, 'awa');
insert into public.cibles (id, categorie_id, nom, telephone, effectif, zone_id, referent_id) values (pg_temp.k('menage-2'), pg_temp.c('Ménage'), 'Ménage Omar Sy', '76 465 27 59', 7, pg_temp.z(17), pg_temp.k('membre-awa'));
insert into public.appartenances values (pg_temp.k('personne-chef2'), pg_temp.k('menage-2'), 'Chef de ménage');
select pg_temp.pers('personne-enfant2', 'Maimouna', 'Sy', 'F', -5657, '78 839 76 13', 'Élève / étudiant(e)', null, '{}', 17, null);
insert into public.appartenances values (pg_temp.k('personne-enfant2'), pg_temp.k('menage-2'), 'Enfant');
select pg_temp.pers('personne-chef3', 'Astou', 'Gueye', 'F', -16804, '77 627 95 92', 'Sans activité', null, '{"Femme cheffe de ménage","Veuf / veuve"}', 22, 'awa');
insert into public.cibles (id, categorie_id, nom, telephone, effectif, zone_id, referent_id) values (pg_temp.k('menage-3'), pg_temp.c('Ménage'), 'Ménage Astou Gueye', '77 962 57 18', 9, pg_temp.z(22), pg_temp.k('membre-awa'));
insert into public.appartenances values (pg_temp.k('personne-chef3'), pg_temp.k('menage-3'), 'Chef de ménage');
select pg_temp.pers('personne-chef4', 'Babacar', 'Sène', 'M', -19837, '78 208 51 72', 'À son compte (artisan, commerçant)', null, '{"Sinistré(e)"}', 22, 'awa');
insert into public.cibles (id, categorie_id, nom, telephone, effectif, zone_id, referent_id) values (pg_temp.k('menage-4'), pg_temp.c('Ménage'), 'Ménage Babacar Sène', '77 994 19 58', 8, pg_temp.z(22), pg_temp.k('membre-awa'));
insert into public.appartenances values (pg_temp.k('personne-chef4'), pg_temp.k('menage-4'), 'Chef de ménage');
select pg_temp.pers('personne-chef5', 'Alioune', 'Seck', 'M', -19771, '78 948 55 97', 'Au foyer', null, '{"Sinistré(e)"}', 17, 'awa');
insert into public.cibles (id, categorie_id, nom, telephone, effectif, zone_id, referent_id) values (pg_temp.k('menage-5'), pg_temp.c('Ménage'), 'Ménage Alioune Seck', '70 699 54 20', 5, pg_temp.z(17), pg_temp.k('membre-awa'));
insert into public.appartenances values (pg_temp.k('personne-chef5'), pg_temp.k('menage-5'), 'Chef de ménage');
select pg_temp.pers('personne-chef6', 'Adama', 'Mbengue', 'F', -14715, '78 432 65 74', 'Retraité(e)', null, '{"Femme cheffe de ménage","Veuf / veuve","Sinistré(e)"}', 17, 'awa');
insert into public.cibles (id, categorie_id, nom, telephone, effectif, zone_id, referent_id) values (pg_temp.k('menage-6'), pg_temp.c('Ménage'), 'Ménage Adama Mbengue', '76 430 94 73', 10, pg_temp.z(17), pg_temp.k('membre-awa'));
insert into public.appartenances values (pg_temp.k('personne-chef6'), pg_temp.k('menage-6'), 'Chef de ménage');
select pg_temp.pers('personne-chef7', 'Souleymane', 'Sarr', 'M', -20253, '76 519 85 58', 'À son compte (artisan, commerçant)', null, '{"Sinistré(e)"}', 13, 'awa');
insert into public.cibles (id, categorie_id, nom, telephone, effectif, zone_id, referent_id) values (pg_temp.k('menage-7'), pg_temp.c('Ménage'), 'Ménage Souleymane Sarr', '78 258 66 82', 6, pg_temp.z(13), pg_temp.k('membre-awa'));
insert into public.appartenances values (pg_temp.k('personne-chef7'), pg_temp.k('menage-7'), 'Chef de ménage');
insert into public.cibles (id, categorie_id, nom, effectif, responsable, sous_type, telephone, zone_id, adresse, referent_id) values (pg_temp.k('cible-gpf'), pg_temp.c('GPF (groupement de promotion féminine)'), 'GPF Jigeen Ñu Bokk', 34, 'Ndeye Thiam', 'Couture et teinture', '70 374 52 25', pg_temp.z(17), null, pg_temp.k('membre-awa'));
insert into public.appartenances values (pg_temp.k('personne-gpf0'), pg_temp.k('cible-gpf'), 'Présidente');
insert into public.appartenances values (pg_temp.k('personne-gpf1'), pg_temp.k('cible-gpf'), 'Trésorière');
insert into public.appartenances values (pg_temp.k('personne-gpf2'), pg_temp.k('cible-gpf'), 'Secrétaire');
insert into public.appartenances values (pg_temp.k('personne-gpf3'), pg_temp.k('cible-gpf'), 'Membre');
insert into public.appartenances values (pg_temp.k('personne-gpf4'), pg_temp.k('cible-gpf'), 'Membre');
insert into public.appartenances values (pg_temp.k('personne-gpf5'), pg_temp.k('cible-gpf'), 'Membre');
insert into public.appartenances values (pg_temp.k('personne-gpf6'), pg_temp.k('cible-gpf'), 'Membre');
insert into public.appartenances values (pg_temp.k('personne-gpf7'), pg_temp.k('cible-gpf'), 'Membre');
insert into public.appartenances values (pg_temp.k('personne-gpf8'), pg_temp.k('cible-gpf'), 'Membre');
insert into public.appartenances values (pg_temp.k('personne-gpf9'), pg_temp.k('cible-gpf'), 'Membre');
insert into public.cibles (id, categorie_id, nom, effectif, responsable, sous_type, telephone, zone_id, adresse, referent_id) values (pg_temp.k('cible-gie'), pg_temp.c('GIE (groupement d''intérêt économique)'), 'GIE Liggeey Ak Jom', 18, 'Abdoulaye Sy', 'Transformation de céréales locales', '76 372 66 43', pg_temp.z(13), null, pg_temp.k('membre-moussa'));
insert into public.appartenances values (pg_temp.k('personne-elec0'), pg_temp.k('cible-gie'), 'Membre');
insert into public.appartenances values (pg_temp.k('personne-elec1'), pg_temp.k('cible-gie'), 'Membre');
insert into public.appartenances values (pg_temp.k('personne-elec2'), pg_temp.k('cible-gie'), 'Membre');
commit;
-- ===== PARTIE 2/4 =====
-- Identifiants déterministes : chaque partie du fichier peut s'exécuter seule.
create or replace function pg_temp.k(c text) returns uuid language sql immutable as $$ select md5('ap2a-demo:' || c)::uuid $$;
create or replace function pg_temp.d(n int) returns date language sql as $$ select current_date + n $$;
create or replace function pg_temp.z(u int) returns int language sql as $$
  select id from public.zones where chemin = 'Dakar > Dakar > Parcelles Assainies > Unité ' || u $$;
create or replace function pg_temp.c(l text) returns int language sql as $$ select id from public.categories_cible where libelle = l $$;
create or replace function pg_temp.p(g text, l text) returns int language sql as $$
  select id from public.profils_personne where left(genre, 1) = g and libelle = l $$;
create or replace function pg_temp.t(c text) returns int language sql as $$ select id from public.types_action where code = c $$;
create or replace function pg_temp.f() returns uuid language sql as $$ select id from public.partenaires where sigle = '3FPT' limit 1 $$;
create or replace function pg_temp.pers(cle text, pre text, nm text, sx text, naiss int, tel text, sit text, met text, vul text[], u int, ref text) returns void
language sql as $$
  insert into public.cibles (id, categorie_id, prenom, nom, sexe, date_naissance, telephone, situation_id, metier, vulnerabilites, zone_id, referent_id)
  values (pg_temp.k(cle), pg_temp.c('Personne'), pre, nm, sx, pg_temp.d(naiss), tel, pg_temp.p('s', sit), met,
          coalesce((select array_agg(pg_temp.p('v', v)) from unnest(vul) v), '{}'), pg_temp.z(u),
          case when ref is null then null else pg_temp.k('membre-' || ref) end) $$;
create or replace function pg_temp.benef(cle text, act text, cib text, st text, via text) returns void language sql as $$
  insert into public.beneficiaires (id, action_id, cible_id, statut, via_collectif_id)
  values (pg_temp.k(cle), pg_temp.k('action-' || act), pg_temp.k(cib), st::public.statut_beneficiaire,
          case when via is null then null else pg_temp.k(via) end) $$;
create or replace function pg_temp.apport(b text, nat text, descr text, val bigint, qte numeric, par text, num text, j int) returns void language sql as $$
  insert into public.apports (beneficiaire_id, nature, description, valeur_fcfa, quantite, partenaire_id, numero_document, date_remise)
  values (pg_temp.k(b), nat::public.nature_apport, descr, val, qte,
          case when par is null then null when par = '3fpt' then pg_temp.f() else pg_temp.k('partenaire-' || par) end, num, pg_temp.d(j)) $$;
create or replace function pg_temp.suivi(b text, mois int, retard int, sit text, act text, rev bigint, emp int, ut boolean, com text, par text) returns void language sql as $$
  update public.suivis set fait_le = least(current_date, date_prevue + retard), situation = sit::public.situation_suivi, activite = act,
    revenu_mensuel_fcfa = rev, emplois_crees = emp, utilise_apport = ut, commentaire = com, saisi_par = pg_temp.k('membre-' || par)
  where beneficiaire_id = pg_temp.k(b) and echeance_mois = mois $$;
begin;
insert into public.cibles (id, categorie_id, nom, effectif, responsable, sous_type, telephone, zone_id, adresse, referent_id) values (pg_temp.k('cible-asc'), pg_temp.c('ASC (association sportive et culturelle)'), 'ASC Jappo Unité 22', 60, 'Lamine Cissé', 'Football, Navétanes', '78 658 90 44', pg_temp.z(22), null, pg_temp.k('membre-ibrahima'));
insert into public.appartenances values (pg_temp.k('personne-asc0'), pg_temp.k('cible-asc'), 'Capitaine');
insert into public.appartenances values (pg_temp.k('personne-asc1'), pg_temp.k('cible-asc'), 'Joueur');
insert into public.appartenances values (pg_temp.k('personne-asc2'), pg_temp.k('cible-asc'), 'Joueur');
insert into public.appartenances values (pg_temp.k('personne-asc3'), pg_temp.k('cible-asc'), 'Joueur');
insert into public.appartenances values (pg_temp.k('personne-asc4'), pg_temp.k('cible-asc'), 'Joueur');
insert into public.appartenances values (pg_temp.k('personne-asc5'), pg_temp.k('cible-asc'), 'Joueur');
insert into public.appartenances values (pg_temp.k('personne-asc6'), pg_temp.k('cible-asc'), 'Joueur');
insert into public.appartenances values (pg_temp.k('personne-asc7'), pg_temp.k('cible-asc'), 'Joueur');
insert into public.cibles (id, categorie_id, nom, effectif, responsable, sous_type, telephone, zone_id, adresse, referent_id) values (pg_temp.k('cible-dahira'), pg_temp.c('Dahira'), 'Dahira Nourou Darayni', 45, 'Serigne Mbaye', null, '78 439 28 81', pg_temp.z(19), null, pg_temp.k('membre-awa'));
insert into public.cibles (id, categorie_id, nom, effectif, responsable, sous_type, telephone, zone_id, adresse, referent_id) values (pg_temp.k('cible-ecole'), pg_temp.c('École élémentaire'), 'École élémentaire Unité 15', 640, 'M. Diagne (directeur)', '12 classes', '77 374 47 83', pg_temp.z(15), null, pg_temp.k('membre-ibrahima'));
insert into public.cibles (id, categorie_id, nom, effectif, responsable, sous_type, telephone, zone_id, adresse, referent_id) values (pg_temp.k('cible-poste'), pg_temp.c('Poste de santé'), 'Poste de santé Unité 26', null, 'Infirmier chef de poste', null, '70 748 61 61', pg_temp.z(26), null, pg_temp.k('membre-awa'));
insert into public.cibles (id, categorie_id, nom, effectif, responsable, sous_type, telephone, zone_id, adresse, referent_id) values (pg_temp.k('cible-salubrite'), pg_temp.c('Comité de salubrité / set-setal'), 'Comité set-setal Unité 17', 25, 'Rokhaya Fall', null, '77 662 52 96', pg_temp.z(17), null, pg_temp.k('membre-ibrahima'));
insert into public.cibles (id, categorie_id, nom, effectif, responsable, sous_type, telephone, zone_id, adresse, referent_id) values (pg_temp.k('cible-canal'), pg_temp.c('Rue / canal'), 'Canal à ciel ouvert, Unité 17', null, null, 'Bouché à chaque hivernage', null, pg_temp.z(17), 'Le long de la route de l''Unité 17', null);
insert into public.cibles (id, categorie_id, nom, effectif, responsable, sous_type, telephone, zone_id, adresse, referent_id) values (pg_temp.k('cible-marche'), pg_temp.c('Marché'), 'Marché de l''Unité 25', null, null, null, null, pg_temp.z(25), null, null);
insert into public.cibles (id, categorie_id, nom, effectif, responsable, sous_type, telephone, zone_id, adresse, referent_id) values (pg_temp.k('cible-reboisement'), pg_temp.c('Site de reboisement'), 'Allée de l''Unité 22', null, null, 'Plantation de 150 arbres prévue', null, pg_temp.z(22), null, pg_temp.k('membre-ibrahima'));
insert into public.cibles (id, categorie_id, nom, effectif, responsable, sous_type, telephone, zone_id, adresse, referent_id) values (pg_temp.k('cible-inondee'), pg_temp.c('Zone inondée / sinistrée'), 'Bas-fonds de l''Unité 11', null, null, 'Inondé en août 2026', null, pg_temp.z(11), null, pg_temp.k('membre-awa'));
insert into public.actions (id, type_id, titre, description, date_debut, date_fin, lieu, zone_id, responsable_id, budget_fcfa, bilan) values (pg_temp.k('action-elec'), pg_temp.t('formation'), 'Formation électricité bâtiment — promotion 2025', 'Formation de 4 mois en électricité bâtiment, certificat délivré par la 3FPT, puis remise d''un kit complet pour démarrer.', pg_temp.d(-390), pg_temp.d(-250), 'Centre de formation 3FPT, Dakar', null, pg_temp.k('membre-moussa'), 4500000, '9 jeunes inscrits, 8 ont terminé. Très bonne assiduité. Prévoir un module « gérer son activité » pour la prochaine promotion.');
insert into public.action_partenaires (action_id, partenaire_id, role) values (pg_temp.k('action-elec'), pg_temp.f(), 'formateur');
insert into public.action_partenaires (action_id, partenaire_id, role) values (pg_temp.k('action-elec'), pg_temp.k('partenaire-quincaillerie'), 'prestataire');
insert into public.action_equipe (action_id, membre_id, role) values (pg_temp.k('action-elec'), pg_temp.k('membre-moussa'), 'Responsable');
insert into public.action_equipe (action_id, membre_id, role) values (pg_temp.k('action-elec'), pg_temp.k('membre-pape'), 'Logistique');
select pg_temp.benef('b-elec-0', 'elec', 'personne-elec0', 'termine', null);
select pg_temp.apport('b-elec-0', 'formation', 'Formation électricité bâtiment (4 mois)', 350000, null, '3fpt', null, -250);
select pg_temp.apport('b-elec-0', 'certificat', 'Certificat de qualification — électricité bâtiment', null, null, '3fpt', '3FPT-2025-1040', -240);
select pg_temp.apport('b-elec-0', 'kit', 'Kit d''électricien (outillage, multimètre, EPI)', 150000, null, 'quincaillerie', null, -235);
select pg_temp.benef('b-elec-1', 'elec', 'personne-elec1', 'termine', null);
select pg_temp.apport('b-elec-1', 'formation', 'Formation électricité bâtiment (4 mois)', 350000, null, '3fpt', null, -250);
select pg_temp.apport('b-elec-1', 'certificat', 'Certificat de qualification — électricité bâtiment', null, null, '3fpt', '3FPT-2025-1041', -240);
select pg_temp.apport('b-elec-1', 'kit', 'Kit d''électricien (outillage, multimètre, EPI)', 150000, null, 'quincaillerie', null, -235);
select pg_temp.benef('b-elec-2', 'elec', 'personne-elec2', 'termine', null);
select pg_temp.apport('b-elec-2', 'formation', 'Formation électricité bâtiment (4 mois)', 350000, null, '3fpt', null, -250);
select pg_temp.apport('b-elec-2', 'certificat', 'Certificat de qualification — électricité bâtiment', null, null, '3fpt', '3FPT-2025-1042', -240);
select pg_temp.apport('b-elec-2', 'kit', 'Kit d''électricien (outillage, multimètre, EPI)', 150000, null, 'quincaillerie', null, -235);
select pg_temp.benef('b-elec-3', 'elec', 'personne-elec3', 'termine', null);
select pg_temp.apport('b-elec-3', 'formation', 'Formation électricité bâtiment (4 mois)', 350000, null, '3fpt', null, -250);
select pg_temp.apport('b-elec-3', 'certificat', 'Certificat de qualification — électricité bâtiment', null, null, '3fpt', '3FPT-2025-1043', -240);
select pg_temp.apport('b-elec-3', 'kit', 'Kit d''électricien (outillage, multimètre, EPI)', 150000, null, 'quincaillerie', null, -235);
select pg_temp.benef('b-elec-4', 'elec', 'personne-elec4', 'termine', null);
select pg_temp.apport('b-elec-4', 'formation', 'Formation électricité bâtiment (4 mois)', 350000, null, '3fpt', null, -250);
select pg_temp.apport('b-elec-4', 'certificat', 'Certificat de qualification — électricité bâtiment', null, null, '3fpt', '3FPT-2025-1044', -240);
select pg_temp.apport('b-elec-4', 'kit', 'Kit d''électricien (outillage, multimètre, EPI)', 150000, null, 'quincaillerie', null, -235);
select pg_temp.benef('b-elec-5', 'elec', 'personne-elec5', 'termine', null);
select pg_temp.apport('b-elec-5', 'formation', 'Formation électricité bâtiment (4 mois)', 350000, null, '3fpt', null, -250);
select pg_temp.apport('b-elec-5', 'certificat', 'Certificat de qualification — électricité bâtiment', null, null, '3fpt', '3FPT-2025-1045', -240);
select pg_temp.apport('b-elec-5', 'kit', 'Kit d''électricien (outillage, multimètre, EPI)', 150000, null, 'quincaillerie', null, -235);
select pg_temp.benef('b-elec-6', 'elec', 'personne-elec6', 'termine', null);
select pg_temp.apport('b-elec-6', 'formation', 'Formation électricité bâtiment (4 mois)', 350000, null, '3fpt', null, -250);
select pg_temp.apport('b-elec-6', 'certificat', 'Certificat de qualification — électricité bâtiment', null, null, '3fpt', '3FPT-2025-1046', -240);
select pg_temp.apport('b-elec-6', 'kit', 'Kit d''électricien (outillage, multimètre, EPI)', 150000, null, 'quincaillerie', null, -235);
select pg_temp.benef('b-elec-7', 'elec', 'personne-elec7', 'termine', null);
select pg_temp.apport('b-elec-7', 'formation', 'Formation électricité bâtiment (4 mois)', 350000, null, '3fpt', null, -250);
select pg_temp.apport('b-elec-7', 'certificat', 'Certificat de qualification — électricité bâtiment', null, null, '3fpt', '3FPT-2025-1047', -240);
select pg_temp.apport('b-elec-7', 'kit', 'Kit d''électricien (outillage, multimètre, EPI)', 150000, null, 'quincaillerie', null, -235);
select pg_temp.benef('b-elec-8', 'elec', 'personne-elec8', 'abandon', null);
update public.actions set statut = 'terminee' where id = pg_temp.k('action-elec');
insert into public.actions (id, type_id, titre, description, date_debut, date_fin, lieu, zone_id, responsable_id, budget_fcfa, bilan) values (pg_temp.k('action-couture'), pg_temp.t('formation'), 'Formation couture et teinture — GPF Jigeen Ñu Bokk', 'Perfectionnement en couture et teinture, avec une machine à coudre par participante.', pg_temp.d(-250), pg_temp.d(-160), 'Siège du GPF, Unité 17', pg_temp.z(17), pg_temp.k('membre-awa'), 2800000, 'Le GPF a ouvert un atelier collectif. 7 femmes sur 10 travaillent régulièrement.');
insert into public.action_partenaires (action_id, partenaire_id, role) values (pg_temp.k('action-couture'), pg_temp.k('partenaire-quincaillerie'), 'prestataire');
insert into public.action_equipe (action_id, membre_id, role) values (pg_temp.k('action-couture'), pg_temp.k('membre-awa'), 'Responsable');
insert into public.action_equipe (action_id, membre_id, role) values (pg_temp.k('action-couture'), pg_temp.k('membre-khady'), 'Communication');
select pg_temp.benef('b-couture-9', 'couture', 'cible-gpf', 'termine', null);
select pg_temp.apport('b-couture-9', 'kit', 'Local équipé : 2 tables de coupe, fer industriel', 400000, null, null, null, -160);
select pg_temp.benef('b-couture-10', 'couture', 'personne-gpf0', 'termine', 'cible-gpf');
select pg_temp.apport('b-couture-10', 'kit', 'Machine à coudre à pédale', 120000, 1, 'quincaillerie', null, -160);
select pg_temp.benef('b-couture-11', 'couture', 'personne-gpf1', 'termine', 'cible-gpf');
select pg_temp.apport('b-couture-11', 'kit', 'Machine à coudre à pédale', 120000, 1, 'quincaillerie', null, -160);
select pg_temp.benef('b-couture-12', 'couture', 'personne-gpf2', 'termine', 'cible-gpf');
select pg_temp.apport('b-couture-12', 'kit', 'Machine à coudre à pédale', 120000, 1, 'quincaillerie', null, -160);
select pg_temp.benef('b-couture-13', 'couture', 'personne-gpf3', 'termine', 'cible-gpf');
select pg_temp.apport('b-couture-13', 'kit', 'Machine à coudre à pédale', 120000, 1, 'quincaillerie', null, -160);
select pg_temp.benef('b-couture-14', 'couture', 'personne-gpf4', 'termine', 'cible-gpf');
select pg_temp.apport('b-couture-14', 'kit', 'Machine à coudre à pédale', 120000, 1, 'quincaillerie', null, -160);
select pg_temp.benef('b-couture-15', 'couture', 'personne-gpf5', 'termine', 'cible-gpf');
select pg_temp.apport('b-couture-15', 'kit', 'Machine à coudre à pédale', 120000, 1, 'quincaillerie', null, -160);
select pg_temp.benef('b-couture-16', 'couture', 'personne-gpf6', 'termine', 'cible-gpf');
select pg_temp.apport('b-couture-16', 'kit', 'Machine à coudre à pédale', 120000, 1, 'quincaillerie', null, -160);
select pg_temp.benef('b-couture-17', 'couture', 'personne-gpf7', 'termine', 'cible-gpf');
select pg_temp.apport('b-couture-17', 'kit', 'Machine à coudre à pédale', 120000, 1, 'quincaillerie', null, -160);
select pg_temp.benef('b-couture-18', 'couture', 'personne-gpf8', 'termine', 'cible-gpf');
select pg_temp.apport('b-couture-18', 'kit', 'Machine à coudre à pédale', 120000, 1, 'quincaillerie', null, -160);
select pg_temp.benef('b-couture-19', 'couture', 'personne-gpf9', 'termine', 'cible-gpf');
select pg_temp.apport('b-couture-19', 'kit', 'Machine à coudre à pédale', 120000, 1, 'quincaillerie', null, -160);
update public.actions set statut = 'terminee' where id = pg_temp.k('action-couture');
insert into public.actions (id, type_id, titre, description, date_debut, date_fin, lieu, zone_id, responsable_id, budget_fcfa, bilan) values (pg_temp.k('action-cataracte'), pg_temp.t('sante'), 'Dépistage gratuit de la cataracte', 'Journée de dépistage, puis prise en charge gratuite des opérations par la clinique partenaire.', pg_temp.d(-110), pg_temp.d(-110), 'Poste de santé Unité 26', pg_temp.z(26), pg_temp.k('membre-awa'), 1500000, '142 personnes dépistées, 7 opérées gratuitement.');
insert into public.action_partenaires (action_id, partenaire_id, role) values (pg_temp.k('action-cataracte'), pg_temp.k('partenaire-hopital'), 'prestataire');
insert into public.action_equipe (action_id, membre_id, role) values (pg_temp.k('action-cataracte'), pg_temp.k('membre-awa'), 'Responsable');
insert into public.action_equipe (action_id, membre_id, role) values (pg_temp.k('action-cataracte'), pg_temp.k('membre-ousmane'), 'Accueil');
insert into public.action_equipe (action_id, membre_id, role) values (pg_temp.k('action-cataracte'), pg_temp.k('membre-khady'), 'Accueil');
select pg_temp.benef('b-cataracte-20', 'cataracte', 'cible-poste', 'termine', null);
select pg_temp.benef('b-cataracte-21', 'cataracte', 'personne-cata0', 'termine', null);
select pg_temp.apport('b-cataracte-21', 'soin', 'Opération de la cataracte (un œil)', 75000, null, 'hopital', null, -100);
select pg_temp.benef('b-cataracte-22', 'cataracte', 'personne-cata1', 'termine', null);
select pg_temp.apport('b-cataracte-22', 'soin', 'Opération de la cataracte (un œil)', 75000, null, 'hopital', null, -100);
select pg_temp.benef('b-cataracte-23', 'cataracte', 'personne-cata2', 'termine', null);
select pg_temp.apport('b-cataracte-23', 'soin', 'Opération de la cataracte (un œil)', 75000, null, 'hopital', null, -100);
select pg_temp.benef('b-cataracte-24', 'cataracte', 'personne-cata3', 'termine', null);
select pg_temp.apport('b-cataracte-24', 'soin', 'Opération de la cataracte (un œil)', 75000, null, 'hopital', null, -100);
select pg_temp.benef('b-cataracte-25', 'cataracte', 'personne-cata4', 'termine', null);
select pg_temp.apport('b-cataracte-25', 'soin', 'Opération de la cataracte (un œil)', 75000, null, 'hopital', null, -100);
select pg_temp.benef('b-cataracte-26', 'cataracte', 'personne-cata5', 'termine', null);
select pg_temp.apport('b-cataracte-26', 'soin', 'Opération de la cataracte (un œil)', 75000, null, 'hopital', null, -100);
select pg_temp.benef('b-cataracte-27', 'cataracte', 'personne-cata6', 'termine', null);
select pg_temp.apport('b-cataracte-27', 'soin', 'Opération de la cataracte (un œil)', 75000, null, 'hopital', null, -100);
update public.actions set statut = 'terminee' where id = pg_temp.k('action-cataracte');
commit;
-- ===== PARTIE 3/4 =====
-- Identifiants déterministes : chaque partie du fichier peut s'exécuter seule.
create or replace function pg_temp.k(c text) returns uuid language sql immutable as $$ select md5('ap2a-demo:' || c)::uuid $$;
create or replace function pg_temp.d(n int) returns date language sql as $$ select current_date + n $$;
create or replace function pg_temp.z(u int) returns int language sql as $$
  select id from public.zones where chemin = 'Dakar > Dakar > Parcelles Assainies > Unité ' || u $$;
create or replace function pg_temp.c(l text) returns int language sql as $$ select id from public.categories_cible where libelle = l $$;
create or replace function pg_temp.p(g text, l text) returns int language sql as $$
  select id from public.profils_personne where left(genre, 1) = g and libelle = l $$;
create or replace function pg_temp.t(c text) returns int language sql as $$ select id from public.types_action where code = c $$;
create or replace function pg_temp.f() returns uuid language sql as $$ select id from public.partenaires where sigle = '3FPT' limit 1 $$;
create or replace function pg_temp.pers(cle text, pre text, nm text, sx text, naiss int, tel text, sit text, met text, vul text[], u int, ref text) returns void
language sql as $$
  insert into public.cibles (id, categorie_id, prenom, nom, sexe, date_naissance, telephone, situation_id, metier, vulnerabilites, zone_id, referent_id)
  values (pg_temp.k(cle), pg_temp.c('Personne'), pre, nm, sx, pg_temp.d(naiss), tel, pg_temp.p('s', sit), met,
          coalesce((select array_agg(pg_temp.p('v', v)) from unnest(vul) v), '{}'), pg_temp.z(u),
          case when ref is null then null else pg_temp.k('membre-' || ref) end) $$;
create or replace function pg_temp.benef(cle text, act text, cib text, st text, via text) returns void language sql as $$
  insert into public.beneficiaires (id, action_id, cible_id, statut, via_collectif_id)
  values (pg_temp.k(cle), pg_temp.k('action-' || act), pg_temp.k(cib), st::public.statut_beneficiaire,
          case when via is null then null else pg_temp.k(via) end) $$;
create or replace function pg_temp.apport(b text, nat text, descr text, val bigint, qte numeric, par text, num text, j int) returns void language sql as $$
  insert into public.apports (beneficiaire_id, nature, description, valeur_fcfa, quantite, partenaire_id, numero_document, date_remise)
  values (pg_temp.k(b), nat::public.nature_apport, descr, val, qte,
          case when par is null then null when par = '3fpt' then pg_temp.f() else pg_temp.k('partenaire-' || par) end, num, pg_temp.d(j)) $$;
create or replace function pg_temp.suivi(b text, mois int, retard int, sit text, act text, rev bigint, emp int, ut boolean, com text, par text) returns void language sql as $$
  update public.suivis set fait_le = least(current_date, date_prevue + retard), situation = sit::public.situation_suivi, activite = act,
    revenu_mensuel_fcfa = rev, emplois_crees = emp, utilise_apport = ut, commentaire = com, saisi_par = pg_temp.k('membre-' || par)
  where beneficiaire_id = pg_temp.k(b) and echeance_mois = mois $$;
begin;
insert into public.actions (id, type_id, titre, description, date_debut, date_fin, lieu, zone_id, responsable_id, budget_fcfa, bilan) values (pg_temp.k('action-ramadan'), pg_temp.t('distribution'), 'Kits Ramadan 2026', 'Distribution de kits alimentaires aux familles les plus vulnérables.', pg_temp.d(-225), pg_temp.d(-225), 'Siège de l''association', pg_temp.z(17), pg_temp.k('membre-mariama'), 1200000, '8 familles servies en priorité, kits livrés à domicile pour les personnes âgées.');
insert into public.action_partenaires (action_id, partenaire_id, role) values (pg_temp.k('action-ramadan'), pg_temp.k('partenaire-banque'), 'soutien');
insert into public.action_equipe (action_id, membre_id, role) values (pg_temp.k('action-ramadan'), pg_temp.k('membre-mariama'), 'Responsable');
insert into public.action_equipe (action_id, membre_id, role) values (pg_temp.k('action-ramadan'), pg_temp.k('membre-ousmane'), 'Distribution');
insert into public.action_equipe (action_id, membre_id, role) values (pg_temp.k('action-ramadan'), pg_temp.k('membre-pape'), 'Distribution');
select pg_temp.benef('b-ramadan-28', 'ramadan', 'menage-0', 'termine', null);
select pg_temp.apport('b-ramadan-28', 'don', 'Kit Ramadan : riz 25 kg, huile 5 L, sucre, dattes', 35000, 1, 'banque', null, -225);
select pg_temp.benef('b-ramadan-29', 'ramadan', 'menage-1', 'termine', null);
select pg_temp.apport('b-ramadan-29', 'don', 'Kit Ramadan : riz 25 kg, huile 5 L, sucre, dattes', 35000, 1, 'banque', null, -225);
select pg_temp.benef('b-ramadan-30', 'ramadan', 'menage-2', 'termine', null);
select pg_temp.apport('b-ramadan-30', 'don', 'Kit Ramadan : riz 25 kg, huile 5 L, sucre, dattes', 35000, 1, 'banque', null, -225);
select pg_temp.benef('b-ramadan-31', 'ramadan', 'menage-3', 'termine', null);
select pg_temp.apport('b-ramadan-31', 'don', 'Kit Ramadan : riz 25 kg, huile 5 L, sucre, dattes', 35000, 1, 'banque', null, -225);
select pg_temp.benef('b-ramadan-32', 'ramadan', 'menage-4', 'termine', null);
select pg_temp.apport('b-ramadan-32', 'don', 'Kit Ramadan : riz 25 kg, huile 5 L, sucre, dattes', 35000, 1, 'banque', null, -225);
select pg_temp.benef('b-ramadan-33', 'ramadan', 'menage-5', 'termine', null);
select pg_temp.apport('b-ramadan-33', 'don', 'Kit Ramadan : riz 25 kg, huile 5 L, sucre, dattes', 35000, 1, 'banque', null, -225);
select pg_temp.benef('b-ramadan-34', 'ramadan', 'menage-6', 'termine', null);
select pg_temp.apport('b-ramadan-34', 'don', 'Kit Ramadan : riz 25 kg, huile 5 L, sucre, dattes', 35000, 1, 'banque', null, -225);
select pg_temp.benef('b-ramadan-35', 'ramadan', 'menage-7', 'termine', null);
select pg_temp.apport('b-ramadan-35', 'don', 'Kit Ramadan : riz 25 kg, huile 5 L, sucre, dattes', 35000, 1, 'banque', null, -225);
update public.actions set statut = 'terminee' where id = pg_temp.k('action-ramadan');
insert into public.actions (id, type_id, titre, description, date_debut, date_fin, lieu, zone_id, responsable_id, budget_fcfa, bilan) values (pg_temp.k('action-setsetal'), pg_temp.t('environnement'), 'Set-setal et curage du canal — Unité 17', 'Journée de nettoyage avec le comité de salubrité et l''ASC.', pg_temp.d(-153), pg_temp.d(-153), 'Unité 17', pg_temp.z(17), pg_temp.k('membre-ibrahima'), 250000, '3 tonnes de déchets évacuées, canal dégagé avant l''hivernage.');
insert into public.action_partenaires (action_id, partenaire_id, role) values (pg_temp.k('action-setsetal'), pg_temp.k('partenaire-mairie'), 'soutien');
insert into public.action_equipe (action_id, membre_id, role) values (pg_temp.k('action-setsetal'), pg_temp.k('membre-ibrahima'), 'Responsable');
insert into public.action_equipe (action_id, membre_id, role) values (pg_temp.k('action-setsetal'), pg_temp.k('membre-pape'), 'Matériel');
select pg_temp.benef('b-setsetal-36', 'setsetal', 'cible-canal', 'termine', null);
select pg_temp.benef('b-setsetal-37', 'setsetal', 'cible-salubrite', 'termine', null);
select pg_temp.benef('b-setsetal-38', 'setsetal', 'cible-asc', 'termine', null);
select pg_temp.apport('b-setsetal-38', 'don', 'Pelles, râteaux, brouettes, gants', 180000, null, null, null, -153);
update public.actions set statut = 'terminee' where id = pg_temp.k('action-setsetal');
insert into public.actions (id, type_id, titre, description, date_debut, date_fin, lieu, zone_id, responsable_id, budget_fcfa, bilan) values (pg_temp.k('action-ecole'), pg_temp.t('rehabilitation'), 'Réfection de 3 salles de classe — École Unité 15', 'Toiture, peinture, tables-bancs et tableaux pour 3 salles avant la rentrée.', pg_temp.d(-100), pg_temp.d(-40), 'École élémentaire Unité 15', pg_temp.z(15), pg_temp.k('membre-ibrahima'), 1800000, 'Travaux terminés à temps pour la rentrée d''octobre.');
insert into public.action_partenaires (action_id, partenaire_id, role) values (pg_temp.k('action-ecole'), pg_temp.k('partenaire-mairie'), 'financeur');
insert into public.action_equipe (action_id, membre_id, role) values (pg_temp.k('action-ecole'), pg_temp.k('membre-ibrahima'), 'Responsable');
select pg_temp.benef('b-ecole-39', 'ecole', 'cible-ecole', 'termine', null);
select pg_temp.apport('b-ecole-39', 'financement', 'Réfection de 3 salles (toiture, peinture)', 1350000, null, 'mairie', null, -40);
select pg_temp.apport('b-ecole-39', 'don', '30 tables-bancs', 450000, 30, null, null, -40);
update public.actions set statut = 'terminee' where id = pg_temp.k('action-ecole');
insert into public.actions (id, type_id, titre, description, date_debut, date_fin, lieu, zone_id, responsable_id, budget_fcfa, bilan) values (pg_temp.k('action-pluies'), pg_temp.t('sinistres'), 'Appui aux sinistrés des pluies — août 2026', 'Pompage, matelas, kits d''hygiène et vivres pour les familles inondées.', pg_temp.d(-45), pg_temp.d(-34), 'Unité 11 et Unité 13', pg_temp.z(11), pg_temp.k('membre-awa'), 900000, null);
insert into public.action_partenaires (action_id, partenaire_id, role) values (pg_temp.k('action-pluies'), pg_temp.k('partenaire-banque'), 'soutien');
insert into public.action_partenaires (action_id, partenaire_id, role) values (pg_temp.k('action-pluies'), pg_temp.k('partenaire-mairie'), 'soutien');
insert into public.action_equipe (action_id, membre_id, role) values (pg_temp.k('action-pluies'), pg_temp.k('membre-awa'), 'Responsable');
insert into public.action_equipe (action_id, membre_id, role) values (pg_temp.k('action-pluies'), pg_temp.k('membre-ousmane'), 'Terrain');
select pg_temp.benef('b-pluies-40', 'pluies', 'cible-inondee', 'termine', null);
select pg_temp.benef('b-pluies-41', 'pluies', 'menage-4', 'termine', null);
select pg_temp.apport('b-pluies-41', 'don', '2 matelas, kit d''hygiène, sac de riz', 60000, null, 'banque', null, -36);
select pg_temp.benef('b-pluies-42', 'pluies', 'menage-5', 'termine', null);
select pg_temp.apport('b-pluies-42', 'don', '2 matelas, kit d''hygiène, sac de riz', 60000, null, 'banque', null, -36);
select pg_temp.benef('b-pluies-43', 'pluies', 'menage-6', 'termine', null);
select pg_temp.apport('b-pluies-43', 'don', '2 matelas, kit d''hygiène, sac de riz', 60000, null, 'banque', null, -36);
select pg_temp.benef('b-pluies-44', 'pluies', 'menage-7', 'termine', null);
select pg_temp.apport('b-pluies-44', 'don', '2 matelas, kit d''hygiène, sac de riz', 60000, null, 'banque', null, -36);
update public.actions set statut = 'terminee' where id = pg_temp.k('action-pluies');
insert into public.actions (id, type_id, titre, description, date_debut, date_fin, lieu, zone_id, responsable_id, budget_fcfa, bilan) values (pg_temp.k('action-plomberie'), pg_temp.t('formation'), 'Formation plomberie sanitaire — promotion 2026', 'Formation de 3 mois et demi ; kit de plombier remis à la fin.', pg_temp.d(-38), pg_temp.d(67), 'Centre de formation 3FPT, Dakar', null, pg_temp.k('membre-moussa'), 3200000, null);
insert into public.action_partenaires (action_id, partenaire_id, role) values (pg_temp.k('action-plomberie'), pg_temp.f(), 'formateur');
insert into public.action_equipe (action_id, membre_id, role) values (pg_temp.k('action-plomberie'), pg_temp.k('membre-moussa'), 'Responsable');
select pg_temp.benef('b-plomberie-45', 'plomberie', 'personne-plomb0', 'inscrit', null);
select pg_temp.benef('b-plomberie-46', 'plomberie', 'personne-plomb1', 'inscrit', null);
select pg_temp.benef('b-plomberie-47', 'plomberie', 'personne-plomb2', 'inscrit', null);
select pg_temp.benef('b-plomberie-48', 'plomberie', 'personne-plomb3', 'inscrit', null);
select pg_temp.benef('b-plomberie-49', 'plomberie', 'personne-plomb4', 'inscrit', null);
select pg_temp.benef('b-plomberie-50', 'plomberie', 'personne-plomb5', 'inscrit', null);
update public.actions set statut = 'en_cours' where id = pg_temp.k('action-plomberie');
insert into public.actions (id, type_id, titre, description, date_debut, date_fin, lieu, zone_id, responsable_id, budget_fcfa, bilan) values (pg_temp.k('action-arbres'), pg_temp.t('environnement'), 'Reboisement de l''allée de l''Unité 22', '150 arbres (neems, filaos) avec l''ASC Jappo et les élèves.', pg_temp.d(37), pg_temp.d(37), 'Unité 22', pg_temp.z(22), pg_temp.k('membre-ibrahima'), 600000, null);
insert into public.action_partenaires (action_id, partenaire_id, role) values (pg_temp.k('action-arbres'), pg_temp.k('partenaire-mairie'), 'soutien');
insert into public.action_equipe (action_id, membre_id, role) values (pg_temp.k('action-arbres'), pg_temp.k('membre-ibrahima'), 'Responsable');
insert into public.action_equipe (action_id, membre_id, role) values (pg_temp.k('action-arbres'), pg_temp.k('membre-pape'), 'Logistique');
select pg_temp.benef('b-arbres-51', 'arbres', 'cible-reboisement', 'inscrit', null);
select pg_temp.benef('b-arbres-52', 'arbres', 'cible-asc', 'inscrit', null);
insert into public.actions (id, type_id, titre, description, date_debut, date_fin, lieu, zone_id, responsable_id, budget_fcfa, bilan) values (pg_temp.k('action-cata2'), pg_temp.t('sante'), 'Dépistage de la cataracte — décembre', 'Deuxième journée de dépistage, ouverte aux Unités 24 à 26.', pg_temp.d(64), pg_temp.d(64), 'Poste de santé Unité 26', pg_temp.z(26), pg_temp.k('membre-awa'), 1500000, null);
insert into public.action_partenaires (action_id, partenaire_id, role) values (pg_temp.k('action-cata2'), pg_temp.k('partenaire-hopital'), 'prestataire');
insert into public.action_equipe (action_id, membre_id, role) values (pg_temp.k('action-cata2'), pg_temp.k('membre-awa'), 'Responsable');
select pg_temp.suivi('b-elec-0', 3, 8, 'en_progres', 'Démarre, cherche des chantiers', 30000, 0, true::boolean, null, 'moussa');
select pg_temp.suivi('b-elec-0', 6, 6, 'reussi', 'Électricien à son compte', 150000, 1, true::boolean, null, 'moussa');
select pg_temp.suivi('b-elec-1', 3, 3, 'en_progres', 'Démarre, cherche des chantiers', 30000, 0, true::boolean, null, 'moussa');
select pg_temp.suivi('b-elec-1', 6, 8, 'reussi', 'Employé dans une entreprise de BTP', 120000, 0, true::boolean, null, 'moussa');
select pg_temp.suivi('b-elec-2', 3, 12, 'en_progres', 'Démarre, cherche des chantiers', 30000, 0, true::boolean, null, 'moussa');
select pg_temp.suivi('b-elec-3', 3, 12, 'en_progres', 'Démarre, cherche des chantiers', 30000, 0, true::boolean, null, 'moussa');
select pg_temp.suivi('b-elec-3', 6, 9, 'reussi', 'Électricien à son compte, 2 apprentis', 220000, 2, true::boolean, null, 'moussa');
select pg_temp.suivi('b-elec-4', 3, 10, 'en_difficulte', 'Pas encore d''activité', null, 0, true::boolean, null, 'moussa');
select pg_temp.suivi('b-elec-4', 6, 4, 'en_difficulte', 'N''a pas trouvé de chantier, a vendu une partie du kit', null, 0, false::boolean, null, 'moussa');
select pg_temp.suivi('b-elec-5', 3, 8, 'en_progres', 'Démarre, cherche des chantiers', 30000, 0, true::boolean, null, 'moussa');
select pg_temp.suivi('b-elec-6', 3, 7, 'en_progres', 'Démarre, cherche des chantiers', 30000, 0, true::boolean, null, 'moussa');
select pg_temp.suivi('b-elec-6', 6, 6, 'reussi', 'Électricienne, installations domestiques', 130000, 1, true::boolean, null, 'moussa');
select pg_temp.suivi('b-elec-7', 3, 2, 'en_difficulte', 'Pas encore d''activité', null, 0, true::boolean, null, 'moussa');
select pg_temp.suivi('b-elec-7', 6, 7, 'perdu_de_vue', null, null, null, null::boolean, 'Injoignable, a déménagé à Thiès selon sa famille', 'moussa');
select pg_temp.suivi('b-couture-10', 3, 5, 'reussi', 'Couturière à domicile', 90000, 1, true::boolean, null, 'awa');
select pg_temp.suivi('b-couture-11', 3, 5, 'reussi', 'Couturière à domicile', 75000, 0, true::boolean, null, 'awa');
select pg_temp.suivi('b-couture-12', 3, 5, 'en_progres', 'Couturière à domicile', 35000, 0, true::boolean, null, 'awa');
select pg_temp.suivi('b-couture-13', 3, 5, 'reussi', 'Couturière à domicile', 110000, 1, true::boolean, null, 'awa');
select pg_temp.suivi('b-couture-14', 3, 5, 'en_progres', 'Couturière à domicile', 40000, 0, true::boolean, null, 'awa');
select pg_temp.suivi('b-couture-15', 3, 5, 'reussi', 'Couturière à domicile', 80000, 0, true::boolean, null, 'awa');
select pg_temp.suivi('b-couture-16', 3, 5, 'en_difficulte', 'Machine en panne', null, 0, false::boolean, 'A besoin d''une réparation de machine', 'awa');
select pg_temp.suivi('b-couture-17', 3, 5, 'reussi', 'Couturière à domicile', 70000, 0, true::boolean, null, 'awa');
select pg_temp.suivi('b-couture-18', 3, 5, 'en_progres', 'Couturière à domicile', 30000, 0, true::boolean, null, 'awa');
select pg_temp.suivi('b-couture-19', 3, 5, 'reussi', 'Couturière à domicile', 95000, 0, true::boolean, null, 'awa');
select pg_temp.suivi('b-couture-9', 3, 5, 'reussi', 'Atelier collectif ouvert 5 jours par semaine', 450000, 3, true::boolean, 'Commandes d''uniformes scolaires pour la rentrée', 'awa');
select pg_temp.suivi('b-cataracte-21', 1, 5, 'reussi', 'Vue retrouvée, reprend ses activités', null, null, null::boolean, null, 'awa');
select pg_temp.suivi('b-cataracte-22', 1, 5, 'reussi', 'Vue retrouvée, reprend ses activités', null, null, null::boolean, null, 'awa');
select pg_temp.suivi('b-cataracte-23', 1, 5, 'reussi', 'Vue retrouvée, reprend ses activités', null, null, null::boolean, null, 'awa');
select pg_temp.suivi('b-cataracte-24', 1, 5, 'reussi', 'Vue retrouvée, reprend ses activités', null, null, null::boolean, null, 'awa');
select pg_temp.suivi('b-cataracte-25', 1, 5, 'en_difficulte', null, null, null, null::boolean, 'Gêne persistante, revoir le médecin', 'awa');
select pg_temp.suivi('b-cataracte-26', 1, 5, 'reussi', 'Vue retrouvée, reprend ses activités', null, null, null::boolean, null, 'awa');
select pg_temp.suivi('b-cataracte-27', 1, 5, 'perdu_de_vue', null, null, null, null::boolean, 'Injoignable', 'awa');
commit;
-- ===== PARTIE 4/4 =====
-- Identifiants déterministes : chaque partie du fichier peut s'exécuter seule.
create or replace function pg_temp.k(c text) returns uuid language sql immutable as $$ select md5('ap2a-demo:' || c)::uuid $$;
create or replace function pg_temp.d(n int) returns date language sql as $$ select current_date + n $$;
create or replace function pg_temp.z(u int) returns int language sql as $$
  select id from public.zones where chemin = 'Dakar > Dakar > Parcelles Assainies > Unité ' || u $$;
create or replace function pg_temp.c(l text) returns int language sql as $$ select id from public.categories_cible where libelle = l $$;
create or replace function pg_temp.p(g text, l text) returns int language sql as $$
  select id from public.profils_personne where left(genre, 1) = g and libelle = l $$;
create or replace function pg_temp.t(c text) returns int language sql as $$ select id from public.types_action where code = c $$;
create or replace function pg_temp.f() returns uuid language sql as $$ select id from public.partenaires where sigle = '3FPT' limit 1 $$;
create or replace function pg_temp.pers(cle text, pre text, nm text, sx text, naiss int, tel text, sit text, met text, vul text[], u int, ref text) returns void
language sql as $$
  insert into public.cibles (id, categorie_id, prenom, nom, sexe, date_naissance, telephone, situation_id, metier, vulnerabilites, zone_id, referent_id)
  values (pg_temp.k(cle), pg_temp.c('Personne'), pre, nm, sx, pg_temp.d(naiss), tel, pg_temp.p('s', sit), met,
          coalesce((select array_agg(pg_temp.p('v', v)) from unnest(vul) v), '{}'), pg_temp.z(u),
          case when ref is null then null else pg_temp.k('membre-' || ref) end) $$;
create or replace function pg_temp.benef(cle text, act text, cib text, st text, via text) returns void language sql as $$
  insert into public.beneficiaires (id, action_id, cible_id, statut, via_collectif_id)
  values (pg_temp.k(cle), pg_temp.k('action-' || act), pg_temp.k(cib), st::public.statut_beneficiaire,
          case when via is null then null else pg_temp.k(via) end) $$;
create or replace function pg_temp.apport(b text, nat text, descr text, val bigint, qte numeric, par text, num text, j int) returns void language sql as $$
  insert into public.apports (beneficiaire_id, nature, description, valeur_fcfa, quantite, partenaire_id, numero_document, date_remise)
  values (pg_temp.k(b), nat::public.nature_apport, descr, val, qte,
          case when par is null then null when par = '3fpt' then pg_temp.f() else pg_temp.k('partenaire-' || par) end, num, pg_temp.d(j)) $$;
create or replace function pg_temp.suivi(b text, mois int, retard int, sit text, act text, rev bigint, emp int, ut boolean, com text, par text) returns void language sql as $$
  update public.suivis set fait_le = least(current_date, date_prevue + retard), situation = sit::public.situation_suivi, activite = act,
    revenu_mensuel_fcfa = rev, emplois_crees = emp, utilise_apport = ut, commentaire = com, saisi_par = pg_temp.k('membre-' || par)
  where beneficiaire_id = pg_temp.k(b) and echeance_mois = mois $$;
begin;
-- Registre : tout ce qui a été créé pourra être effacé depuis l'application.
insert into public.donnees_demo (nom_table, id) select t, pg_temp.k(c)::text from (values
  ('membres', 'membre-mariama'),
  ('membres', 'membre-moussa'),
  ('membres', 'membre-awa'),
  ('membres', 'membre-ibrahima'),
  ('membres', 'membre-khady'),
  ('membres', 'membre-ousmane'),
  ('membres', 'membre-pape'),
  ('partenaires', 'partenaire-hopital'),
  ('partenaires', 'partenaire-banque'),
  ('partenaires', 'partenaire-mairie'),
  ('partenaires', 'partenaire-quincaillerie'),
  ('cibles', 'personne-elec0'),
  ('cibles', 'personne-elec1'),
  ('cibles', 'personne-elec2'),
  ('cibles', 'personne-elec3'),
  ('cibles', 'personne-elec4'),
  ('cibles', 'personne-elec5'),
  ('cibles', 'personne-elec6'),
  ('cibles', 'personne-elec7'),
  ('cibles', 'personne-elec8'),
  ('cibles', 'personne-plomb0'),
  ('cibles', 'personne-plomb1'),
  ('cibles', 'personne-plomb2'),
  ('cibles', 'personne-plomb3'),
  ('cibles', 'personne-plomb4'),
  ('cibles', 'personne-plomb5'),
  ('cibles', 'personne-gpf0'),
  ('cibles', 'personne-gpf1'),
  ('cibles', 'personne-gpf2'),
  ('cibles', 'personne-gpf3'),
  ('cibles', 'personne-gpf4'),
  ('cibles', 'personne-gpf5'),
  ('cibles', 'personne-gpf6'),
  ('cibles', 'personne-gpf7'),
  ('cibles', 'personne-gpf8'),
  ('cibles', 'personne-gpf9'),
  ('cibles', 'personne-cata0'),
  ('cibles', 'personne-cata1'),
  ('cibles', 'personne-cata2'),
  ('cibles', 'personne-cata3'),
  ('cibles', 'personne-cata4'),
  ('cibles', 'personne-cata5'),
  ('cibles', 'personne-cata6'),
  ('cibles', 'personne-asc0'),
  ('cibles', 'personne-asc1'),
  ('cibles', 'personne-asc2'),
  ('cibles', 'personne-asc3'),
  ('cibles', 'personne-asc4'),
  ('cibles', 'personne-asc5'),
  ('cibles', 'personne-asc6'),
  ('cibles', 'personne-asc7'),
  ('cibles', 'personne-chef0'),
  ('cibles', 'menage-0'),
  ('cibles', 'personne-enfant0'),
  ('cibles', 'personne-chef1'),
  ('cibles', 'menage-1'),
  ('cibles', 'personne-enfant1'),
  ('cibles', 'personne-chef2'),
  ('cibles', 'menage-2'),
  ('cibles', 'personne-enfant2'),
  ('cibles', 'personne-chef3'),
  ('cibles', 'menage-3'),
  ('cibles', 'personne-chef4'),
  ('cibles', 'menage-4'),
  ('cibles', 'personne-chef5'),
  ('cibles', 'menage-5'),
  ('cibles', 'personne-chef6'),
  ('cibles', 'menage-6'),
  ('cibles', 'personne-chef7'),
  ('cibles', 'menage-7'),
  ('cibles', 'cible-gpf'),
  ('cibles', 'cible-gie'),
  ('cibles', 'cible-asc'),
  ('cibles', 'cible-dahira'),
  ('cibles', 'cible-ecole'),
  ('cibles', 'cible-poste'),
  ('cibles', 'cible-salubrite'),
  ('cibles', 'cible-canal'),
  ('cibles', 'cible-marche'),
  ('cibles', 'cible-reboisement'),
  ('cibles', 'cible-inondee'),
  ('actions', 'action-elec'),
  ('actions', 'action-couture'),
  ('actions', 'action-cataracte'),
  ('actions', 'action-ramadan'),
  ('actions', 'action-setsetal'),
  ('actions', 'action-ecole'),
  ('actions', 'action-pluies'),
  ('actions', 'action-plomberie'),
  ('actions', 'action-arbres'),
  ('actions', 'action-cata2')
) as v(t, c) on conflict do nothing;
commit;
