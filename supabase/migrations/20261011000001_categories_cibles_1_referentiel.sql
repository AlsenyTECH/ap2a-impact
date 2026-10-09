-- =====================================================================
-- Catégories de cibles : premier référentiel (42 catégories).
--
-- Seule cette partie a été appliquée en production. La suite (familles
-- modifiables, ménages, profils des personnes, membres des groupes) est
-- dans 20261012000001_familles_menages.sql.
-- =====================================================================

create table public.categories_cible (
  id serial primary key,
  type text not null check (type in ('personne', 'collectif', 'structure', 'lieu')),
  famille text not null,
  libelle text not null,
  ordre int not null default 0,
  actif boolean not null default true,
  unique (type, libelle)
);

insert into public.categories_cible (type, famille, libelle, ordre) values
  -- Collectifs
  ('collectif', 'Jeunesse et sport', 'ASC (association sportive et culturelle)', 10),
  ('collectif', 'Jeunesse et sport', 'Club sportif', 11),
  ('collectif', 'Jeunesse et sport', 'Association de jeunes', 12),
  ('collectif', 'Jeunesse et sport', 'Mouvement scout', 13),
  ('collectif', 'Femmes', 'Groupement de promotion féminine (GPF)', 20),
  ('collectif', 'Femmes', 'Association de femmes', 21),
  ('collectif', 'Femmes', 'Tontine', 22),
  ('collectif', 'Économie et emploi', 'GIE (groupement d''intérêt économique)', 30),
  ('collectif', 'Économie et emploi', 'Coopérative', 31),
  ('collectif', 'Économie et emploi', 'Mutuelle d''épargne et de crédit', 32),
  ('collectif', 'Économie et emploi', 'Association d''artisans', 33),
  ('collectif', 'Économie et emploi', 'Association de commerçants / marchands', 34),
  ('collectif', 'Religion et culture', 'Dahira', 40),
  ('collectif', 'Religion et culture', 'Association religieuse', 41),
  ('collectif', 'Religion et culture', 'Troupe / groupe culturel', 42),
  ('collectif', 'Religion et culture', 'Association de ressortissants', 43),
  ('collectif', 'Vie de quartier', 'Association de développement du quartier', 50),
  ('collectif', 'Vie de quartier', 'Comité de salubrité (set setal)', 51),
  ('collectif', 'Vie de quartier', 'Association de parents d''élèves (APE)', 52),
  ('collectif', 'Vie de quartier', 'Association de personnes handicapées', 53),
  ('collectif', 'Vie de quartier', 'Association de personnes âgées', 54),
  ('collectif', 'Vie de quartier', 'Autre association', 59),
  -- Structures
  ('structure', 'Éducation', 'Case des tout-petits / préscolaire', 60),
  ('structure', 'Éducation', 'École élémentaire', 61),
  ('structure', 'Éducation', 'Collège / lycée', 62),
  ('structure', 'Éducation', 'Daara', 63),
  ('structure', 'Éducation', 'École franco-arabe', 64),
  ('structure', 'Éducation', 'Centre de formation professionnelle', 65),
  ('structure', 'Santé', 'Poste de santé', 70),
  ('structure', 'Santé', 'Centre de santé', 71),
  ('structure', 'Santé', 'Case de santé', 72),
  ('structure', 'Institutions et entreprises', 'Mairie / services municipaux', 80),
  ('structure', 'Institutions et entreprises', 'Délégation de quartier', 81),
  ('structure', 'Institutions et entreprises', 'ONG / association partenaire', 82),
  ('structure', 'Institutions et entreprises', 'Entreprise / atelier', 83),
  -- Lieux
  ('lieu', 'Lieux publics', 'Marché', 90),
  ('lieu', 'Lieux publics', 'Terrain de sport', 91),
  ('lieu', 'Lieux publics', 'Lieu de culte', 92),
  ('lieu', 'Lieux publics', 'Espace vert / place publique', 93),
  ('lieu', 'Lieux publics', 'Rue / canal', 94),
  ('lieu', 'Zones à risque', 'Zone inondée / sinistrée', 95),
  ('lieu', 'Zones à risque', 'Dépôt d''ordures sauvage', 96);

alter table public.categories_cible enable row level security;
create policy categories_lecture on public.categories_cible for select to authenticated using (public.mon_membre_id() is not null);
create policy categories_gestion on public.categories_cible for all to authenticated
  using (public.est_gestionnaire()) with check (public.est_gestionnaire());
grant select, insert, update, delete on public.categories_cible to authenticated;
grant usage, select on sequence public.categories_cible_id_seq to authenticated;
revoke all on public.categories_cible from anon;

