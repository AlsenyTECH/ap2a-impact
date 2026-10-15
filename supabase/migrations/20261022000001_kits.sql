-- Kits : catalogue, stock, remise par scan de la carte avec signature.
--
-- * Catalogue : chaque modèle de kit a sa composition, sa valeur unitaire,
--   son fournisseur ou financeur habituel et un seuil d'alerte de stock.
-- * Stock : journal des mouvements (entrées : achat, don, retour ; sorties :
--   remise, perte ; inventaire : correction après comptage). Remettre un kit
--   du catalogue crée la sortie tout seul ; supprimer la remise l'annule.
-- * Remise : le bénéficiaire peut signer sur le téléphone (image rangée avec
--   les justificatifs) ; la remise peut se faire en scannant sa carte.

-- ---------------------------------------------------------------------
-- 1. Catalogue
-- ---------------------------------------------------------------------
create table public.kits_modeles (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (length(trim(nom)) > 0),
  description text,
  -- [{ "libelle": "Pince à dénuder", "quantite": 1 }, …]
  composition jsonb not null default '[]' check (jsonb_typeof(composition) = 'array'),
  valeur_unitaire_fcfa bigint check (valeur_unitaire_fcfa >= 0),
  partenaire_id uuid references public.partenaires (id) on delete set null,
  seuil_alerte int not null default 0 check (seuil_alerte >= 0),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  cree_par uuid references public.membres (id) on delete set null default public.mon_membre_id()
);
alter table public.kits_modeles enable row level security;
grant select, insert, update, delete on public.kits_modeles to authenticated;
create policy kits_modeles_lecture on public.kits_modeles for select to authenticated
  using (public.mon_membre_id() is not null);
create policy kits_modeles_ajout on public.kits_modeles for insert to authenticated
  with check (public.est_gestionnaire());
create policy kits_modeles_modif on public.kits_modeles for update to authenticated
  using (public.est_gestionnaire()) with check (public.est_gestionnaire());
-- Un modèle déjà utilisé (mouvements) ne peut pas être supprimé : on le désactive.
create policy kits_modeles_suppr on public.kits_modeles for delete to authenticated
  using (public.est_gestionnaire());

-- ---------------------------------------------------------------------
-- 2. Mouvements de stock
-- ---------------------------------------------------------------------
create table public.kits_mouvements (
  id uuid primary key default gen_random_uuid(),
  modele_id uuid not null references public.kits_modeles (id) on delete restrict,
  quantite int not null check (quantite <> 0),           -- + entrée, − sortie
  motif text not null check (motif in ('achat', 'don', 'retour', 'remise', 'perte', 'inventaire')),
  apport_id uuid unique references public.apports (id) on delete cascade,
  partenaire_id uuid references public.partenaires (id) on delete set null,   -- d'où vient l'entrée
  cout_fcfa bigint check (cout_fcfa >= 0),
  date date not null default current_date,
  note text check (length(note) <= 500),
  cree_le timestamptz not null default now(),
  cree_par uuid references public.membres (id) on delete set null default public.mon_membre_id(),
  constraint sens_du_motif check (
    (motif in ('achat', 'don', 'retour') and quantite > 0)
    or (motif in ('remise', 'perte') and quantite < 0)
    or motif = 'inventaire'),
  constraint remise_liee check ((motif = 'remise') = (apport_id is not null))
);
create index kits_mouvements_modele on public.kits_mouvements (modele_id, date desc);
alter table public.kits_mouvements enable row level security;
grant select, insert, update, delete on public.kits_mouvements to authenticated;
create policy kits_mouvements_lecture on public.kits_mouvements for select to authenticated
  using (public.mon_membre_id() is not null);
-- Les sorties « remise » ne se saisissent pas à la main : elles suivent les remises.
create policy kits_mouvements_ajout on public.kits_mouvements for insert to authenticated
  with check (public.est_gestionnaire() and motif <> 'remise');
create policy kits_mouvements_modif on public.kits_mouvements for update to authenticated
  using (public.est_gestionnaire() and motif <> 'remise') with check (public.est_gestionnaire() and motif <> 'remise');
create policy kits_mouvements_suppr on public.kits_mouvements for delete to authenticated
  using (public.est_gestionnaire() and motif <> 'remise');

-- Stock de chaque modèle (avec les droits de la personne qui lit).
create view public.kits_stock with (security_invoker = true) as
select m.id as modele_id,
       coalesce(sum(mv.quantite), 0)::int as stock,
       coalesce(sum(mv.quantite) filter (where mv.motif in ('achat', 'don', 'retour')), 0)::int as entrees,
       coalesce(-sum(mv.quantite) filter (where mv.motif = 'remise'), 0)::int as remis,
       max(mv.date) as dernier_mouvement
from public.kits_modeles m
left join public.kits_mouvements mv on mv.modele_id = m.id
group by m.id;
grant select on public.kits_stock to authenticated;

-- ---------------------------------------------------------------------
-- 3. Remises : lien au catalogue, signature, mode (saisie ou scan)
-- ---------------------------------------------------------------------
alter table public.apports
  add column if not exists modele_id uuid references public.kits_modeles (id) on delete restrict,
  add column if not exists signature_chemin text,
  add column if not exists signe_le timestamptz,
  add column if not exists mode_remise text not null default 'manuel' check (mode_remise in ('manuel', 'scan'));
alter table public.apports add constraint apport_kit_du_catalogue check (modele_id is null or nature = 'kit');
-- La signature est rangée avec les justificatifs du bénéficiaire.
alter table public.apports add constraint apport_signature_rangee
  check (signature_chemin is null or (coalesce(public.beneficiaire_du_fichier(signature_chemin) = beneficiaire_id, false)
                                      and position('..' in signature_chemin) = 0));
create index if not exists apports_modele on public.apports (modele_id) where modele_id is not null;

-- Sortie de stock automatique (une ligne par remise ; quantité arrondie au kit supérieur).
create or replace function public.kits_sortie_remise() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_qte int := -greatest(1, ceil(coalesce(new.quantite, 1)))::int;
begin
  if tg_op = 'UPDATE' and old.modele_id is not null and new.modele_id is distinct from old.modele_id then
    raise exception 'Pour changer de kit, supprimez la remise puis refaites-la' using errcode = '22023';
  end if;
  if new.modele_id is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.modele_id is not null then
    update public.kits_mouvements set quantite = v_qte, date = new.date_remise where apport_id = new.id;
  else
    insert into public.kits_mouvements (modele_id, quantite, motif, apport_id, date, cree_par)
    values (new.modele_id, v_qte, 'remise', new.id, new.date_remise, coalesce(new.saisi_par, public.mon_membre_id()));
  end if;
  return null;
end $$;
create trigger apports_kits after insert or update on public.apports
  for each row execute function public.kits_sortie_remise();

-- ---------------------------------------------------------------------
-- 4. Remise par scan : qui est devant moi, et a-t-il déjà reçu ce kit ?
-- ---------------------------------------------------------------------
create or replace function public.carte_pour_remise(p_action uuid, p_jeton text, p_modele uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  carte public.cartes;
  personne public.cibles;
  v_benef uuid;
  v_statut public.statut_beneficiaire;
  v_deja date;
begin
  if not public.peut_gerer_action(p_action) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  select * into carte from public.cartes where jeton = p_jeton;
  if carte.id is null then return jsonb_build_object('statut', 'inconnue'); end if;
  if carte.cible_id is null then return jsonb_build_object('statut', 'carte_membre'); end if;
  select * into personne from public.cibles where id = carte.cible_id;
  if carte.revoquee_le is not null then
    return jsonb_build_object('statut', 'revoquee', 'prenom', personne.prenom, 'nom', personne.nom);
  end if;
  select id, statut into v_benef, v_statut from public.beneficiaires where action_id = p_action and cible_id = carte.cible_id;
  if v_benef is null then
    return jsonb_build_object('statut', 'pas_inscrit', 'prenom', personne.prenom, 'nom', personne.nom);
  end if;
  select max(date_remise) into v_deja from public.apports where beneficiaire_id = v_benef and modele_id = p_modele;
  return jsonb_build_object(
    'statut', case when v_deja is not null then 'deja' when v_statut = 'abandon' then 'abandon' else 'ok' end,
    'beneficiaire_id', v_benef, 'prenom', personne.prenom, 'nom', personne.nom,
    'numero', personne.numero_beneficiaire, 'photo', personne.photo_chemin, 'deja_le', v_deja);
end $$;
revoke all on function public.carte_pour_remise(uuid, text, uuid) from public, anon;
grant execute on function public.carte_pour_remise(uuid, text, uuid) to authenticated;
