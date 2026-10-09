-- =====================================================================
-- Étape 2/4 : familles, catégories et profils des personnes.
--
-- Le premier référentiel (jamais rattaché à une cible) est mis de côté
-- sous le nom categories_cible_v0, inaccessible depuis l'application ;
-- il pourra être supprimé à la main.
-- =====================================================================

alter table public.categories_cible rename to categories_cible_v0;
alter sequence public.categories_cible_id_seq rename to categories_cible_v0_id_seq;
alter table public.categories_cible_v0 rename constraint categories_cible_pkey to categories_cible_v0_pkey;
alter table public.categories_cible_v0 rename constraint categories_cible_type_libelle_key to categories_cible_v0_type_libelle_key;
revoke all on public.categories_cible_v0 from authenticated, anon;

create table public.familles_cible (
  id serial primary key,
  nom text not null unique check (length(trim(nom)) > 0),
  ordre int not null default 0,
  actif boolean not null default true
);

create table public.categories_cible (
  id serial primary key,
  famille_id int not null references public.familles_cible (id) on delete restrict,
  nature type_cible not null,
  libelle text not null check (length(trim(libelle)) > 0),
  ordre int not null default 0,
  actif boolean not null default true,
  unique (famille_id, libelle)
);

insert into public.familles_cible (nom, ordre) values
  ('Personnes', 1), ('Ménages', 2), ('Groupements économiques', 3), ('Sport et culture', 4),
  ('Jeunesse et femmes', 5), ('Éducation', 6), ('Santé', 7), ('Religieux', 8),
  ('Solidarité et inclusion', 9), ('Gouvernance de quartier', 10), ('Lieux', 11);

insert into public.categories_cible (famille_id, nature, libelle, ordre)
select f.id, c.nature::type_cible, c.libelle, c.ordre
from (values
  ('Personnes', 'personne', 'Personne', 1),
  ('Ménages', 'menage', 'Ménage', 1),
  ('Groupements économiques', 'collectif', 'GIE (groupement d''intérêt économique)', 1),
  ('Groupements économiques', 'collectif', 'GPF (groupement de promotion féminine)', 2),
  ('Groupements économiques', 'collectif', 'Coopérative', 3),
  ('Groupements économiques', 'collectif', 'Tontine', 4),
  ('Groupements économiques', 'collectif', 'Mutuelle d''épargne et de crédit', 5),
  ('Groupements économiques', 'collectif', 'Association d''artisans', 6),
  ('Groupements économiques', 'collectif', 'Association de commerçants / marchands', 7),
  ('Groupements économiques', 'collectif', 'Regroupement de transporteurs (taxi, moto)', 8),
  ('Groupements économiques', 'structure', 'Entreprise / atelier', 9),
  ('Sport et culture', 'collectif', 'ASC (association sportive et culturelle)', 1),
  ('Sport et culture', 'collectif', 'Club sportif', 2),
  ('Sport et culture', 'collectif', 'Écurie de lutte', 3),
  ('Sport et culture', 'collectif', 'Troupe / groupe culturel', 4),
  ('Jeunesse et femmes', 'collectif', 'Association de jeunes', 1),
  ('Jeunesse et femmes', 'collectif', 'Association de femmes', 2),
  ('Jeunesse et femmes', 'collectif', 'Mouvement scout', 3),
  ('Éducation', 'structure', 'Case des tout-petits / préscolaire', 1),
  ('Éducation', 'structure', 'École élémentaire', 2),
  ('Éducation', 'structure', 'Collège / lycée', 3),
  ('Éducation', 'structure', 'École privée / franco-arabe', 4),
  ('Éducation', 'structure', 'Daara', 5),
  ('Éducation', 'structure', 'Centre de formation professionnelle', 6),
  ('Éducation', 'collectif', 'Parents d''élèves (APE) / comité de gestion (CGE)', 7),
  ('Santé', 'structure', 'Poste de santé', 1),
  ('Santé', 'structure', 'Centre de santé', 2),
  ('Santé', 'structure', 'Case de santé', 3),
  ('Santé', 'collectif', 'Comité de santé', 4),
  ('Santé', 'collectif', 'Relais communautaires / Badiénou Gokh', 5),
  ('Santé', 'collectif', 'Mutuelle de santé', 6),
  ('Santé', 'collectif', 'Association de malades', 7),
  ('Religieux', 'collectif', 'Dahira', 1),
  ('Religieux', 'collectif', 'Comité de mosquée', 2),
  ('Religieux', 'collectif', 'Association chrétienne', 3),
  ('Religieux', 'structure', 'Mosquée / lieu de culte', 4),
  ('Solidarité et inclusion', 'collectif', 'Association de personnes handicapées', 1),
  ('Solidarité et inclusion', 'collectif', 'Association de personnes âgées', 2),
  ('Solidarité et inclusion', 'collectif', 'Association de ressortissants', 3),
  ('Solidarité et inclusion', 'collectif', 'Association caritative / ONG locale', 4),
  ('Gouvernance de quartier', 'structure', 'Délégation de quartier', 1),
  ('Gouvernance de quartier', 'structure', 'Mairie / services municipaux', 2),
  ('Gouvernance de quartier', 'collectif', 'Comité de développement de quartier', 3),
  ('Gouvernance de quartier', 'collectif', 'Comité de salubrité / set-setal', 4),
  ('Gouvernance de quartier', 'collectif', 'Comité de gestion des inondations', 5),
  ('Lieux', 'lieu', 'Marché', 1),
  ('Lieux', 'lieu', 'Terrain de sport', 2),
  ('Lieux', 'lieu', 'Espace vert / place publique', 3),
  ('Lieux', 'lieu', 'Rue / canal', 4),
  ('Lieux', 'lieu', 'Zone inondée / sinistrée', 5),
  ('Lieux', 'lieu', 'Dépôt d''ordures sauvage', 6),
  ('Lieux', 'lieu', 'Site de reboisement', 7)
) as c(famille, nature, libelle, ordre)
join public.familles_cible f on f.nom = c.famille;

-- ---------------------------------------------------------------------
-- Profils des personnes : situations et vulnérabilités (modifiables).
-- La tranche d'âge se déduit de la date de naissance.
-- ---------------------------------------------------------------------
create table public.profils_personne (
  id serial primary key,
  genre text not null check (genre in ('situation', 'vulnerabilite')),
  libelle text not null check (length(trim(libelle)) > 0),
  ordre int not null default 0,
  actif boolean not null default true,
  unique (genre, libelle)
);
insert into public.profils_personne (genre, libelle, ordre) values
  ('situation', 'Élève / étudiant(e)', 1),
  ('situation', 'Apprenti(e)', 2),
  ('situation', 'En recherche d''emploi', 3),
  ('situation', 'À son compte (artisan, commerçant)', 4),
  ('situation', 'Salarié(e)', 5),
  ('situation', 'Au foyer', 6),
  ('situation', 'Retraité(e)', 7),
  ('situation', 'Sans activité', 8),
  ('vulnerabilite', 'Handicap', 1),
  ('vulnerabilite', 'Maladie chronique', 2),
  ('vulnerabilite', 'Veuf / veuve', 3),
  ('vulnerabilite', 'Orphelin(e)', 4),
  ('vulnerabilite', 'Femme cheffe de ménage', 5),
  ('vulnerabilite', 'Personne âgée isolée', 6),
  ('vulnerabilite', 'Sinistré(e)', 7);

-- Droits sur les référentiels (dès leur création).
alter table public.familles_cible enable row level security;
alter table public.categories_cible enable row level security;
alter table public.profils_personne enable row level security;

create policy familles_lecture on public.familles_cible for select to authenticated using (public.mon_membre_id() is not null);
create policy familles_gestion on public.familles_cible for all to authenticated
  using (public.est_gestionnaire()) with check (public.est_gestionnaire());
create policy categories_lecture on public.categories_cible for select to authenticated using (public.mon_membre_id() is not null);
create policy categories_gestion on public.categories_cible for all to authenticated
  using (public.est_gestionnaire()) with check (public.est_gestionnaire());
create policy profils_lecture on public.profils_personne for select to authenticated using (public.mon_membre_id() is not null);
create policy profils_gestion on public.profils_personne for all to authenticated
  using (public.est_gestionnaire()) with check (public.est_gestionnaire());

grant select, insert, update, delete on public.familles_cible, public.categories_cible, public.profils_personne to authenticated;
grant usage, select on sequence public.familles_cible_id_seq, public.categories_cible_id_seq, public.profils_personne_id_seq to authenticated;
revoke all on public.familles_cible, public.categories_cible, public.profils_personne from anon;

