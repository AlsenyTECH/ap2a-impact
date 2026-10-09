-- =====================================================================
-- Catégories de cibles.
--
-- Quatre NATURES de cible, chacune avec ses catégories (référentiel
-- modifiable par le bureau) :
--   personne  : un individu, décrit par sa situation et ses vulnérabilités
--   collectif : un groupe de personnes (ASC, GIE, GPF, dahira...) dont on
--               enregistre les membres
--   structure : un établissement ou une institution (école, poste de santé...)
--   lieu      : un endroit (marché, terrain, zone inondée...)
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

-- ---------------------------------------------------------------------
-- Passage des anciens types aux natures + catégories.
-- ---------------------------------------------------------------------
drop view public.suivis_detail;
alter table public.cibles drop constraint personne_a_un_prenom;
alter table public.cibles add column categorie_id int references public.categories_cible (id);

update public.cibles c set categorie_id = k.id
from public.categories_cible k
where (c.type::text, k.libelle) in (
  ('asc', 'ASC (association sportive et culturelle)'),
  ('zone_sinistree', 'Zone inondée / sinistrée')
);

alter type type_cible rename to type_cible_ancien;
create type type_cible as enum ('personne', 'collectif', 'structure', 'lieu');
alter table public.cibles alter column type type type_cible using (
  case type::text
    when 'personne' then 'personne'
    when 'etablissement' then 'structure'
    when 'zone_sinistree' then 'lieu'
    else 'collectif'
  end
)::type_cible;
drop type type_cible_ancien;

alter table public.cibles add constraint personne_a_un_prenom
  check (type <> 'personne' or length(trim(coalesce(prenom, ''))) > 0);

-- ---------------------------------------------------------------------
-- Personnes : situation et vulnérabilités (la tranche d'âge se déduit
-- de la date de naissance, le sexe est déjà connu).
-- ---------------------------------------------------------------------
alter table public.cibles
  add column situation text check (situation in (
    'eleve_etudiant', 'apprenti', 'recherche_emploi', 'independant', 'salarie', 'au_foyer', 'retraite', 'sans_activite'
  )),
  add column vulnerabilites text[] not null default '{}' check (vulnerabilites <@ array[
    'handicap', 'maladie_chronique', 'veuvage', 'orphelin', 'femme_chef_menage', 'personne_agee_isolee', 'sinistre'
  ]);

create or replace function public.preparer_cible() returns trigger
language plpgsql set search_path = public as $$
begin
  new.telephone_normalise := nullif(public.normaliser_telephone(new.telephone), '');
  if new.type <> 'personne' then
    new.prenom := null; new.sexe := null; new.date_naissance := null;
    new.situation := null; new.vulnerabilites := '{}';
  end if;
  if new.categorie_id is not null
     and (select type from public.categories_cible where id = new.categorie_id) <> new.type::text then
    raise exception 'Cette catégorie ne correspond pas à la nature de la cible' using errcode = '23514';
  end if;
  return new;
end $$;

create index cibles_categorie on public.cibles (categorie_id);

-- ---------------------------------------------------------------------
-- Membres des collectifs et structures (élèves d'une école, membres
-- d'une ASC ou d'un GIE...).
-- ---------------------------------------------------------------------
alter table public.appartenances add column ajoute_le timestamptz not null default now();
create index appartenances_collectif on public.appartenances (collectif_id);

create function public.verifier_appartenance() returns trigger
language plpgsql set search_path = public as $$
begin
  if (select type from public.cibles where id = new.personne_id) <> 'personne' then
    raise exception 'Seule une personne peut être membre d''un groupe' using errcode = '23514';
  end if;
  if (select type from public.cibles where id = new.collectif_id) not in ('collectif', 'structure') then
    raise exception 'On ne peut être membre que d''un groupe ou d''une structure' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger appartenances_verifier before insert or update on public.appartenances
  for each row execute function public.verifier_appartenance();
revoke execute on function public.verifier_appartenance() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Droits sur le référentiel, et vue des suivis recréée à l'identique.
-- ---------------------------------------------------------------------
alter table public.categories_cible enable row level security;
create policy categories_lecture on public.categories_cible for select to authenticated using (public.mon_membre_id() is not null);
create policy categories_gestion on public.categories_cible for all to authenticated
  using (public.est_gestionnaire()) with check (public.est_gestionnaire());
grant select, insert, update, delete on public.categories_cible to authenticated;
grant usage, select on sequence public.categories_cible_id_seq to authenticated;
revoke all on public.categories_cible from anon;

create view public.suivis_detail with (security_invoker = true) as
select
  s.*,
  b.action_id,
  b.cible_id,
  a.titre as action_titre,
  a.type_id,
  c.type as cible_type,
  c.prenom as cible_prenom,
  c.nom as cible_nom,
  c.telephone as cible_telephone,
  coalesce(c.referent_id, a.responsable_id) as charge_id
from public.suivis s
join public.beneficiaires b on b.id = s.beneficiaire_id
join public.actions a on a.id = b.action_id
join public.cibles c on c.id = b.cible_id;
grant select on public.suivis_detail to authenticated;
revoke all on public.suivis_detail from anon;
