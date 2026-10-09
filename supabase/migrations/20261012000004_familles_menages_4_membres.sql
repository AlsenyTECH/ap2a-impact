-- =====================================================================
-- Étape 4/4 : membres des ménages et des groupes, bénéficiaires « via ».
-- =====================================================================

-- ---------------------------------------------------------------------
-- Membres des ménages, groupes et structures
-- ---------------------------------------------------------------------
alter table public.appartenances add column ajoute_le timestamptz not null default now();
create index appartenances_collectif on public.appartenances (collectif_id);
-- Un seul chef par ménage.
create unique index appartenances_un_chef on public.appartenances (collectif_id) where role = 'Chef de ménage';

create function public.verifier_appartenance() returns trigger
language plpgsql set search_path = public as $$
begin
  if (select type from public.cibles where id = new.personne_id) <> 'personne' then
    raise exception 'Seule une personne peut être membre d''un groupe ou d''un ménage' using errcode = '23514';
  end if;
  if (select type from public.cibles where id = new.collectif_id) not in ('menage', 'collectif', 'structure') then
    raise exception 'On ne peut être membre que d''un ménage, d''un groupe ou d''une structure' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger appartenances_verifier before insert or update on public.appartenances
  for each row execute function public.verifier_appartenance();

-- Crée un ménage et y inscrit son chef, en une seule opération. Exécutée
-- avec les droits de l'appelant : les règles d'accès s'appliquent.
create function public.creer_menage(
  p_chef uuid, p_effectif int default null, p_zone int default null,
  p_adresse text default null, p_nom text default null, p_categorie int default null
) returns uuid
language plpgsql set search_path = public as $$
declare
  v_chef public.cibles;
  v_id uuid;
begin
  select * into v_chef from public.cibles where id = p_chef and type = 'personne';
  if not found then
    raise exception 'Chef de ménage introuvable' using errcode = 'P0002';
  end if;
  insert into public.cibles (categorie_id, nom, telephone, effectif, zone_id, adresse, referent_id)
  values (
    coalesce(p_categorie, (select id from public.categories_cible where nature = 'menage' and actif order by ordre, id limit 1)),
    coalesce(nullif(trim(p_nom), ''), 'Ménage ' || v_chef.prenom || ' ' || v_chef.nom),
    v_chef.telephone, p_effectif, coalesce(p_zone, v_chef.zone_id), coalesce(nullif(trim(p_adresse), ''), v_chef.adresse),
    v_chef.referent_id
  )
  returning id into v_id;
  insert into public.appartenances (personne_id, collectif_id, role) values (p_chef, v_id, 'Chef de ménage');
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Bénéficiaire inscrit au titre d'un groupe : permet de suivre à la fois
-- le groupe (son propre suivi) et chacun de ses membres.
-- ---------------------------------------------------------------------
alter table public.beneficiaires add column via_collectif_id uuid references public.cibles (id) on delete set null;
create index beneficiaires_via on public.beneficiaires (via_collectif_id) where via_collectif_id is not null;

-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
revoke execute on function public.verifier_appartenance(), public.retirer_vulnerabilite() from public, anon, authenticated;
revoke execute on function public.creer_menage(uuid, int, int, text, text, int) from public, anon;
grant execute on function public.creer_menage(uuid, int, int, text, text, int) to authenticated;

