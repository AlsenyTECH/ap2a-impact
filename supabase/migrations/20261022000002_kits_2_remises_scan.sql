-- Kits, suite : remises liées au catalogue, signature, remise par scan.
-- (Appliquée en production en deux parties, comme ici.)

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
