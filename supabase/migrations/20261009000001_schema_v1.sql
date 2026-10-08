-- =====================================================================
-- AP2A - schéma de la version 1
--
-- Le fil conducteur : une CIBLE (personne ou collectif) bénéficie d'une
-- ACTION de l'association ; ce qu'elle y a reçu est enregistré comme
-- APPORTS (formation et certificat délivré par le partenaire, kit,
-- don, soin...). Le suivi de ce qu'elle en a fait (version 2) part de là.
--
-- Les comptes de connexion sont ceux de Supabase (auth.users) ; chaque
-- membre de l'association a une ligne dans `membres`, avec son rôle.
-- =====================================================================

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------
-- Rôles dans l'application
--   admin        : tout, y compris la gestion des rôles
--   bureau       : tout le contenu (cibles, actions, membres), pas les rôles
--   coordinateur : crée et gère ses actions, suit ses bénéficiaires
--   membre       : voit les actions et son espace
-- ---------------------------------------------------------------------
create type role_membre as enum ('admin', 'bureau', 'coordinateur', 'membre');

create type type_cible as enum (
  'personne', 'groupe', 'asc', 'etablissement', 'organisation', 'zone_sinistree'
);

create type statut_action as enum ('preparation', 'en_cours', 'terminee', 'annulee');

create type statut_beneficiaire as enum ('inscrit', 'termine', 'abandon');

create type nature_apport as enum ('formation', 'certificat', 'kit', 'don', 'soin', 'financement', 'autre');

create type role_partenaire as enum ('formateur', 'prestataire', 'financeur', 'soutien', 'autre');

-- Fonction utilitaire : met à jour `modifie_le` à chaque modification.
create function public.toucher_modifie_le() returns trigger
language plpgsql as $$
begin
  new.modifie_le := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- MEMBRES
-- ---------------------------------------------------------------------
create table public.membres (
  id uuid primary key default gen_random_uuid(),
  -- Compte de connexion (null tant que le membre n'a pas activé son accès).
  user_id uuid unique references auth.users (id) on delete set null,
  prenom text not null check (length(trim(prenom)) > 0),
  nom text not null check (length(trim(nom)) > 0),
  telephone text,
  email text,
  role role_membre not null default 'membre',
  fonction text,                                  -- président(e), trésorier... (libre)
  numero_adherent text unique,
  date_adhesion date not null default current_date,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
create trigger membres_modifie before update on public.membres
  for each row execute function public.toucher_modifie_le();

-- Numéro d'adhérent attribué automatiquement : AP2A-00001, AP2A-00002...
create sequence public.numero_adherent_seq;
create function public.attribuer_numero_adherent() returns trigger
language plpgsql as $$
begin
  if new.numero_adherent is null then
    new.numero_adherent := 'AP2A-' || lpad(nextval('public.numero_adherent_seq')::text, 5, '0');
  end if;
  return new;
end $$;
create trigger membres_numero before insert on public.membres
  for each row execute function public.attribuer_numero_adherent();

-- ---------------------------------------------------------------------
-- Fonctions d'autorisation (utilisées par les règles RLS). SECURITY
-- DEFINER : elles lisent `membres` sans repasser par ses propres règles
-- (sinon récursion), et ne renvoient qu'un booléen ou l'identifiant du
-- membre connecté.
-- ---------------------------------------------------------------------
create function public.mon_membre_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.membres where user_id = auth.uid() and actif
$$;

create function public.mon_role() returns role_membre
language sql stable security definer set search_path = public as $$
  select role from public.membres where user_id = auth.uid() and actif
$$;

create function public.a_role(variadic roles role_membre[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.mon_role() = any(roles), false)
$$;

-- Gestionnaire : peut créer et modifier tout le contenu.
create function public.est_gestionnaire() returns boolean
language sql stable as $$ select public.a_role('admin', 'bureau') $$;

-- ---------------------------------------------------------------------
-- ZONES : découpage administratif (région > département > commune > quartier)
-- ---------------------------------------------------------------------
create table public.zones (
  id serial primary key,
  nom text not null,
  niveau text not null check (niveau in ('region', 'departement', 'commune', 'quartier')),
  parent_id int references public.zones (id) on delete restrict,
  -- Chemin lisible, calculé à l'insertion : "Dakar > Dakar > Parcelles Assainies > Unité 17".
  chemin text not null default '',
  unique nulls not distinct (parent_id, niveau, nom)
);
create function public.calculer_chemin_zone() returns trigger
language plpgsql as $$
begin
  new.chemin := coalesce((select chemin || ' > ' from public.zones where id = new.parent_id), '') || new.nom;
  return new;
end $$;
create trigger zones_chemin before insert or update of nom, parent_id on public.zones
  for each row execute function public.calculer_chemin_zone();

-- ---------------------------------------------------------------------
-- PARTENAIRES (3FPT, structures de santé, bailleurs...)
-- ---------------------------------------------------------------------
create table public.partenaires (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (length(trim(nom)) > 0),
  sigle text,
  domaine text,                                   -- formation professionnelle, santé...
  contact_nom text,
  telephone text,
  email text,
  actif boolean not null default true,
  cree_le timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- CIBLES : personnes et collectifs qui bénéficient des actions
-- ---------------------------------------------------------------------
create table public.cibles (
  id uuid primary key default gen_random_uuid(),
  type type_cible not null,
  nom text not null check (length(trim(nom)) > 0),  -- nom de famille, ou nom du collectif
  prenom text,                                      -- personnes uniquement
  sexe text check (sexe in ('F', 'M')),
  date_naissance date,
  telephone text,
  -- Chiffres seuls, sans +221 : sert au dédoublonnage (voir trigger).
  telephone_normalise text,
  sous_type text,                                   -- école élémentaire, GIE, ASC de football...
  responsable text,                                 -- contact d'un collectif
  effectif int check (effectif >= 0),
  zone_id int references public.zones (id),
  adresse text,
  -- Membre référent : reçoit les rappels de suivi de cette cible (v2).
  referent_id uuid references public.membres (id) on delete set null,
  notes text,
  actif boolean not null default true,
  cree_par uuid references public.membres (id) on delete set null,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  constraint personne_a_un_prenom check (type <> 'personne' or length(trim(coalesce(prenom, ''))) > 0)
);
create index cibles_type_nom on public.cibles (type, nom);
create index cibles_telephone on public.cibles (telephone_normalise);
create index cibles_referent on public.cibles (referent_id);
create trigger cibles_modifie before update on public.cibles
  for each row execute function public.toucher_modifie_le();

create function public.normaliser_telephone(t text) returns text
language sql immutable as $$
  select case
    when d like '00221%' then substr(d, 6)
    when d like '221%' and length(d) = 12 then substr(d, 4)
    else d end
  from (select regexp_replace(coalesce(t, ''), '\D', '', 'g') as d) x
$$;

create function public.preparer_cible() returns trigger
language plpgsql as $$
begin
  new.telephone_normalise := nullif(public.normaliser_telephone(new.telephone), '');
  if new.type <> 'personne' then
    new.prenom := null; new.sexe := null; new.date_naissance := null;
  end if;
  return new;
end $$;
create trigger cibles_preparer before insert or update on public.cibles
  for each row execute function public.preparer_cible();

-- Une personne membre d'un collectif (élève d'une école, membre d'une ASC...).
create table public.appartenances (
  personne_id uuid not null references public.cibles (id) on delete cascade,
  collectif_id uuid not null references public.cibles (id) on delete cascade,
  role text,
  primary key (personne_id, collectif_id),
  check (personne_id <> collectif_id)
);

-- ---------------------------------------------------------------------
-- TYPES D'ACTION et ACTIONS
-- ---------------------------------------------------------------------
create table public.types_action (
  id serial primary key,
  code text not null unique,
  libelle text not null,
  -- Délai des suivis d'impact après la fin de l'action, en mois (v2).
  suivis_mois int[] not null default '{3,6,12}',
  actif boolean not null default true
);

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  type_id int not null references public.types_action (id),
  titre text not null check (length(trim(titre)) > 0),
  description text,
  statut statut_action not null default 'preparation',
  date_debut date not null,
  date_fin date check (date_fin is null or date_fin >= date_debut),
  lieu text,
  zone_id int references public.zones (id),
  responsable_id uuid references public.membres (id) on delete set null,
  budget_fcfa bigint check (budget_fcfa >= 0),
  bilan text,
  cree_par uuid references public.membres (id) on delete set null,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
create index actions_dates on public.actions (date_debut desc);
create trigger actions_modifie before update on public.actions
  for each row execute function public.toucher_modifie_le();

create table public.action_partenaires (
  action_id uuid not null references public.actions (id) on delete cascade,
  partenaire_id uuid not null references public.partenaires (id) on delete restrict,
  role role_partenaire not null default 'autre',
  primary key (action_id, partenaire_id)
);

-- Équipe de membres mobilisés sur l'action.
create table public.action_equipe (
  action_id uuid not null references public.actions (id) on delete cascade,
  membre_id uuid not null references public.membres (id) on delete cascade,
  role text,
  primary key (action_id, membre_id)
);

-- ---------------------------------------------------------------------
-- BÉNÉFICIAIRES d'une action, et ce qu'ils ont reçu (APPORTS)
-- ---------------------------------------------------------------------
create table public.beneficiaires (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.actions (id) on delete cascade,
  cible_id uuid not null references public.cibles (id) on delete restrict,
  statut statut_beneficiaire not null default 'inscrit',
  notes text,
  ajoute_le timestamptz not null default now(),
  unique (action_id, cible_id)
);
create index beneficiaires_cible on public.beneficiaires (cible_id);

create table public.apports (
  id uuid primary key default gen_random_uuid(),
  beneficiaire_id uuid not null references public.beneficiaires (id) on delete cascade,
  nature nature_apport not null,
  description text not null check (length(trim(description)) > 0),  -- "Kit d'électricien", "Certificat électricité bâtiment"
  valeur_fcfa bigint check (valeur_fcfa >= 0),
  quantite numeric check (quantite > 0),
  -- Qui l'a fourni ou délivré : le certificat est délivré par le partenaire (ex : 3FPT).
  partenaire_id uuid references public.partenaires (id) on delete set null,
  numero_document text,                           -- n° de certificat...
  -- Photo ou scan (certificat, remise du kit) dans le stockage Supabase.
  fichier_chemin text,
  date_remise date not null default current_date,
  saisi_par uuid references public.membres (id) on delete set null,
  cree_le timestamptz not null default now()
);
create index apports_beneficiaire on public.apports (beneficiaire_id);
