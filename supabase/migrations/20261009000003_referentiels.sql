-- =====================================================================
-- Référentiels de départ : zones du Sénégal (14 régions, 46 départements,
-- 19 communes de Dakar, Unités 1 à 26 des Parcelles Assainies) et types
-- d'action de l'association. Tout reste modifiable dans l'application.
-- =====================================================================

insert into public.zones (nom, niveau) values
  ('Dakar', 'region'),
  ('Diourbel', 'region'),
  ('Fatick', 'region'),
  ('Kaffrine', 'region'),
  ('Kaolack', 'region'),
  ('Kédougou', 'region'),
  ('Kolda', 'region'),
  ('Louga', 'region'),
  ('Matam', 'region'),
  ('Saint-Louis', 'region'),
  ('Sédhiou', 'region'),
  ('Tambacounda', 'region'),
  ('Thiès', 'region'),
  ('Ziguinchor', 'region');

insert into public.zones (nom, niveau, parent_id)
select d.nom, 'departement', r.id from (values
  ('Dakar', 'Dakar'),
  ('Dakar', 'Guédiawaye'),
  ('Dakar', 'Keur Massar'),
  ('Dakar', 'Pikine'),
  ('Dakar', 'Rufisque'),
  ('Diourbel', 'Bambey'),
  ('Diourbel', 'Diourbel'),
  ('Diourbel', 'Mbacké'),
  ('Fatick', 'Fatick'),
  ('Fatick', 'Foundiougne'),
  ('Fatick', 'Gossas'),
  ('Kaffrine', 'Birkilane'),
  ('Kaffrine', 'Kaffrine'),
  ('Kaffrine', 'Koungheul'),
  ('Kaffrine', 'Malem Hodar'),
  ('Kaolack', 'Guinguinéo'),
  ('Kaolack', 'Kaolack'),
  ('Kaolack', 'Nioro du Rip'),
  ('Kédougou', 'Kédougou'),
  ('Kédougou', 'Salémata'),
  ('Kédougou', 'Saraya'),
  ('Kolda', 'Kolda'),
  ('Kolda', 'Médina Yoro Foulah'),
  ('Kolda', 'Vélingara'),
  ('Louga', 'Kébémer'),
  ('Louga', 'Linguère'),
  ('Louga', 'Louga'),
  ('Matam', 'Kanel'),
  ('Matam', 'Matam'),
  ('Matam', 'Ranérou Ferlo'),
  ('Saint-Louis', 'Dagana'),
  ('Saint-Louis', 'Podor'),
  ('Saint-Louis', 'Saint-Louis'),
  ('Sédhiou', 'Bounkiling'),
  ('Sédhiou', 'Goudomp'),
  ('Sédhiou', 'Sédhiou'),
  ('Tambacounda', 'Bakel'),
  ('Tambacounda', 'Goudiry'),
  ('Tambacounda', 'Koumpentoum'),
  ('Tambacounda', 'Tambacounda'),
  ('Thiès', 'Mbour'),
  ('Thiès', 'Thiès'),
  ('Thiès', 'Tivaouane'),
  ('Ziguinchor', 'Bignona'),
  ('Ziguinchor', 'Oussouye'),
  ('Ziguinchor', 'Ziguinchor')
) as d(region, nom) join public.zones r on r.niveau = 'region' and r.nom = d.region;

insert into public.zones (nom, niveau, parent_id)
select c.nom, 'commune', d.id from (values
  ('Ngor'),
  ('Ouakam'),
  ('Yoff'),
  ('Mermoz-Sacré-Cœur'),
  ('Grand Dakar'),
  ('Biscuiterie'),
  ('HLM'),
  ('Hann Bel-Air'),
  ('Sicap-Liberté'),
  ('Dieuppeul-Derklé'),
  ('Parcelles Assainies'),
  ('Cambérène'),
  ('Grand Yoff'),
  ('Patte d''Oie'),
  ('Plateau'),
  ('Gorée'),
  ('Médina'),
  ('Fann-Point E-Amitié'),
  ('Gueule Tapée-Fass-Colobane')
) as c(nom) join public.zones d on d.niveau = 'departement' and d.chemin = 'Dakar > Dakar';

insert into public.zones (nom, niveau, parent_id)
select 'Unité ' || n, 'quartier', c.id from generate_series(1, 26) n
  join public.zones c on c.niveau = 'commune' and c.chemin = 'Dakar > Dakar > Parcelles Assainies';

-- Types d'action. suivis_mois : quand relancer le référent pour savoir ce
-- que les bénéficiaires sont devenus (vide = pas de suivi individuel).
insert into public.types_action (code, libelle, suivis_mois) values
  ('formation',          'Formation (avec partenaire)',         '{3,6,12}'),
  ('kit',                'Remise de kits / matériel',            '{3,6,12}'),
  ('sante',              'Dépistage et soins',                   '{1,6}'),
  ('distribution',       'Distribution de denrées',              '{}'),
  ('environnement',      'Nettoyage / reboisement',              '{6,12}'),
  ('rehabilitation',     'Réfection d''école ou d''équipement',  '{6,12}'),
  ('sinistres',          'Appui aux sinistrés',                  '{3}'),
  ('autre',              'Autre action',                         '{}');

insert into public.partenaires (nom, sigle, domaine) values
  ('Fonds de Financement de la Formation professionnelle et technique', '3FPT', 'Formation professionnelle');
