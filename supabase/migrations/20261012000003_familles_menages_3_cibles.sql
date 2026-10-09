-- =====================================================================
-- Étape 3/4 : nouvelles colonnes des cibles et rattachement à une
-- catégorie (le déclencheur en déduit la nouvelle nature).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Nouvelles colonnes des cibles
-- ---------------------------------------------------------------------
alter table public.cibles
  add column categorie_id int references public.categories_cible (id) on delete restrict,
  add column situation_id int references public.profils_personne (id) on delete set null,
  add column vulnerabilites int[] not null default '{}',
  add column metier text;

-- La nature découle de la catégorie ; les champs propres aux personnes
-- sont vidés pour les autres natures ; les profils sont vérifiés.
create or replace function public.preparer_cible() returns trigger
language plpgsql set search_path = public as $$
begin
  new.type := (select nature from public.categories_cible where id = new.categorie_id);
  new.telephone_normalise := nullif(public.normaliser_telephone(new.telephone), '');
  if new.type <> 'personne' then
    new.prenom := null; new.sexe := null; new.date_naissance := null;
    new.situation_id := null; new.vulnerabilites := '{}'; new.metier := null;
  end if;
  if new.situation_id is not null
     and not exists (select 1 from public.profils_personne where id = new.situation_id and genre = 'situation') then
    raise exception 'Situation inconnue' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(new.vulnerabilites) v
             where not exists (select 1 from public.profils_personne where id = v and genre = 'vulnerabilite')) then
    raise exception 'Vulnérabilité inconnue' using errcode = '23514';
  end if;
  return new;
end $$;

-- Rattachement des cibles existantes à une catégorie.
update public.cibles c set categorie_id = k.id
from public.categories_cible k
where k.libelle = case
  when c.type::text = 'personne' then 'Personne'
  when c.type::text = 'asc' or (c.type::text = 'groupe' and c.sous_type ilike 'asc%') then 'ASC (association sportive et culturelle)'
  when c.type::text = 'groupe' then 'GIE (groupement d''intérêt économique)'
  when c.type::text = 'etablissement' then 'École élémentaire'
  when c.type::text = 'organisation' then 'Association caritative / ONG locale'
  when c.type::text = 'zone_sinistree' then 'Zone inondée / sinistrée'
end;
alter table public.cibles alter column categorie_id set not null;
create index cibles_categorie on public.cibles (categorie_id);

-- Une vulnérabilité supprimée du référentiel est retirée des fiches.
create function public.retirer_vulnerabilite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.cibles set vulnerabilites = array_remove(vulnerabilites, old.id) where old.id = any(vulnerabilites);
  return old;
end $$;
create trigger profils_retirer before delete on public.profils_personne
  for each row when (old.genre = 'vulnerabilite') execute function public.retirer_vulnerabilite();

