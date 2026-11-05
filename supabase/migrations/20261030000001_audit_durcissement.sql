-- Corrections de l'audit de sécurité du 5 novembre 2026.
-- Références (E1…, M1…, L…) : rapport « audit-securite-ap2a.md ».
--
-- Principes : la base refuse d'elle-même ce que l'interface ne propose pas ;
-- personne ne touche à la fiche de quelqu'un qui a plus de droits ; un compte
-- n'est relié à une fiche que par une invitation ; données personnelles et
-- médicales réservées à qui en a le droit ; tout est journalisé, avec un nom.

-- =====================================================================
-- 1. Droits et fiches des membres (E1, E2, L1)
-- =====================================================================

-- Droits du rôle d'un membre, qu'il soit actif ou non : un membre désactivé
-- garde son rôle, et la comparaison « plus de droits que vous » doit le voir.
-- (Avant, un membre inactif semblait n'avoir aucun droit.)
create or replace function public.droits_membre(p_membre uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select case when r.code = 'admin' then array(select code from public.permissions order by ordre) else r.permissions end
  from public.membres m join public.roles r on r.id = m.role_id
  where m.id = p_membre
$$;

-- Ces deux fonctions ne servent qu'aux autres fonctions de la base et au
-- serveur : un membre n'a pas à lister les droits des autres.
revoke execute on function public.droits_membre(uuid), public.membre_a_permission(uuid, text) from authenticated;
grant execute on function public.droits_membre(uuid), public.membre_a_permission(uuid, text) to service_role;

-- Personne ne modifie la fiche (état actif, email, téléphone, nom…) de
-- quelqu'un qui a des droits qu'il n'a pas. Sa propre fiche passe par les
-- fonctions prévues (profil, thème, rappels).
create or replace function public.garder_fiche_superieure() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or old.user_id is not distinct from auth.uid() then
    return new;
  end if;
  if not (coalesce(public.droits_membre(old.id), '{}') <@ public.mes_permissions()) then
    raise exception 'Vous ne pouvez pas modifier la fiche de quelqu''un qui a plus de droits que vous' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger membres_fiche_superieure before update on public.membres
  for each row execute function public.garder_fiche_superieure();

-- =====================================================================
-- 2. Liaison des comptes (E4, E5, E6, M6 de la fonction serveur)
-- =====================================================================

-- Un compte n'est relié à une fiche que s'il vient d'une invitation et n'a
-- pas déjà de mot de passe : un compte créé par inscription libre (si elle
-- était restée ouverte) n'hérite jamais des droits d'une fiche.
create or replace function public.relier_compte_a_membre() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.invited_at is null or coalesce(new.encrypted_password, '') <> '' then
    return new;
  end if;
  update public.membres set user_id = new.id
  where user_id is null and email is not null and lower(email) = lower(new.email)
    and not exists (select 1 from public.membres where user_id = new.id)
    and not exists (select 1 from public.acces_partenaires where user_id = new.id);
  return new;
end $$;

create or replace function public.relier_compte_a_partenaire() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.invited_at is null or coalesce(new.encrypted_password, '') <> '' then
    return new;
  end if;
  update public.acces_partenaires set user_id = new.id
  where user_id is null and lower(email) = lower(new.email) and revoque_le is null
    and not exists (select 1 from public.membres where user_id = new.id)
    and not exists (select 1 from public.acces_partenaires where user_id = new.id);
  return new;
end $$;

-- La date d'invitation est posée juste après la création du compte : on relie
-- aussi à ce moment-là.
create trigger relier_compte_invite after update of invited_at on auth.users
  for each row execute function public.relier_compte_a_membre();
create trigger relier_compte_partenaire_invite after update of invited_at on auth.users
  for each row execute function public.relier_compte_a_partenaire();

-- Accès partenaire : le compte relié et l'auteur ne se changent pas depuis
-- l'application (seule l'invitation, côté serveur, relie un compte).
create or replace function public.verifier_acces_partenaire() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.email := lower(trim(new.email));
  if exists (select 1 from public.membres where lower(email) = new.email) then
    raise exception 'Cette adresse est déjà celle d''un membre de l''association' using errcode = '23505';
  end if;
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.user_id := null;
      new.cree_par := public.mon_membre_id();
    else
      if new.user_id is distinct from old.user_id then
        raise exception 'Le compte relié à un accès partenaire ne se change pas depuis l''application' using errcode = '42501';
      end if;
      new.cree_par := old.cree_par;
      -- Nouvelle adresse : l'ancien compte n'y correspond plus, il est délié.
      if new.email is distinct from old.email then
        new.user_id := null;
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger acces_partenaires_garde before update on public.acces_partenaires
  for each row execute function public.verifier_acces_partenaire();

-- Une adresse de membre ne peut pas être celle d'un accès partenaire.
create or replace function public.verifier_email_membre() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.email := nullif(lower(trim(new.email)), '');
  if new.email is not null and exists (select 1 from public.acces_partenaires where lower(email) = new.email) then
    raise exception 'Cette adresse est déjà celle d''un accès partenaire' using errcode = '23505';
  end if;
  return new;
end $$;
create trigger membres_email_verif before insert or update of email on public.membres
  for each row execute function public.verifier_email_membre();

-- Les adresses internes des comptes par téléphone ne se saisissent pas.
alter table public.membres add constraint membres_email_pas_interne
  check (email is null or email not like '%.invalid');
alter table public.acces_partenaires add constraint acces_email_pas_interne
  check (email not like '%.invalid');

-- Un email, un téléphone : une seule fiche (évite qu'une fiche réserve
-- l'identifiant d'une autre).
create unique index membres_email_unique on public.membres (lower(email)) where email is not null;
create unique index membres_telephone_unique on public.membres (public.normaliser_telephone(telephone))
  where actif and telephone is not null and public.normaliser_telephone(telephone) <> '';

-- Accès activé = mot de passe posé (donnée du serveur, que l'utilisateur ne
-- peut pas falsifier, contrairement aux métadonnées de son compte).
create or replace function public.compte_active(p_user uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select coalesce((select coalesce(u.encrypted_password, '') <> '' from auth.users u where u.id = p_user), false)
$$;
revoke all on function public.compte_active(uuid) from public, anon, authenticated;
grant execute on function public.compte_active(uuid) to service_role;

create or replace function public.etats_acces() returns table (membre_id uuid, etat text)
language sql stable security definer set search_path = public, auth as $$
  select m.id,
         case when m.user_id is null then 'aucun'
              when public.compte_active(m.user_id) then 'actif'
              else 'invite' end
  from public.membres m
  where public.a_permission('membres.gerer')
$$;

-- =====================================================================
-- 3. Secret médical (E3) et auteurs non modifiables (L7)
-- =====================================================================
insert into public.permissions (code, groupe, libelle, description, ordre) values
  ('medical.lire', 'Cibles et bénéficiaires', 'Lire les notes médicales',
   'Diagnostics, traitements et notes des consultations (soignants, médecin référent). Chaque lecture est notée au journal médical.', 13)
on conflict (code) do nothing;

-- Avant : « responsable ou auteur de l'action », un champ que l'on peut
-- changer soi-même. Maintenant : un droit attribué par l'administrateur.
create or replace function public.responsable_action(p_action uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.a_permission('medical.lire')
$$;

-- L'auteur d'une action ou d'une cible ne change pas.
create or replace function public.garder_auteur() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then
    new.cree_par := old.cree_par;
  end if;
  return new;
end $$;
create trigger actions_auteur before update on public.actions
  for each row execute function public.garder_auteur();
create trigger cibles_auteur before update on public.cibles
  for each row execute function public.garder_auteur();

-- =====================================================================
-- 4. Suppression des actions (M3) et événements (M4)
-- =====================================================================

-- Une action « a eu lieu » dès qu'il y a un apport, une présence, une
-- consultation ou un suivi fait : elle ne se supprime plus.
create or replace function public.action_realisee(p_action uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.apports x join public.beneficiaires b on b.id = x.beneficiaire_id where b.action_id = p_action)
      or exists (select 1 from public.presences p join public.seances s on s.id = p.seance_id where s.action_id = p_action and p.present)
      or exists (select 1 from public.consultations c join public.beneficiaires b on b.id = c.beneficiaire_id where b.action_id = p_action)
      or exists (select 1 from public.suivis s join public.beneficiaires b on b.id = s.beneficiaire_id where b.action_id = p_action and s.fait_le is not null)
$$;

-- Le verrou des actions clôturées se lève aussi pendant la suppression d'une
-- action non réalisée (drapeau distinct : le journal, lui, continue d'écrire).
create or replace function public.verrou_action() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ligne jsonb := to_jsonb(coalesce(new, old));
  v_statut statut_action;
begin
  if coalesce(current_setting('ap2a.purge_demo', true), '') = 'on'
     or coalesce(current_setting('ap2a.suppression_action', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  select statut into v_statut from public.actions where id = public.action_de_ligne(tg_table_name, v_ligne);
  if v_statut in ('terminee', 'annulee') then
    raise exception 'Action clôturée : sa liste, ce qui a été remis, son équipe et ses séances ne peuvent plus être modifiés. Un administrateur peut la rouvrir.'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

-- Relier un événement à une action : il faut gérer les deux.
alter policy evenement_actions_ajout on public.evenement_actions
  with check (public.peut_gerer_evenement(evenement_id) and public.peut_gerer_action(action_id));

-- =====================================================================
-- 5. Journal complet, avec le nom de l'auteur (M6)
-- =====================================================================
alter table public.journal add column if not exists auteur_nom text;

create or replace function public.action_de_ligne(p_table text, p_ligne jsonb) returns uuid
language sql stable security definer set search_path = public as $$
  select case p_table
    when 'apports' then (select action_id from public.beneficiaires where id = (p_ligne->>'beneficiaire_id')::uuid)
    when 'consultations' then (select action_id from public.beneficiaires where id = (p_ligne->>'beneficiaire_id')::uuid)
    when 'suivis' then (select action_id from public.beneficiaires where id = (p_ligne->>'beneficiaire_id')::uuid)
    when 'presences' then (select action_id from public.seances where id = (p_ligne->>'seance_id')::uuid)
    when 'actions' then (p_ligne->>'id')::uuid
    when 'cibles' then null
    when 'membres' then null
    when 'roles' then null
    when 'acces_partenaires' then null
    when 'cartes' then null
    else (p_ligne->>'action_id')::uuid
  end
$$;

create or replace function public.libelle_ligne(p_table text, p_ligne jsonb) returns text
language sql stable security definer set search_path = public as $$
  select case p_table
    when 'actions' then p_ligne->>'titre'
    when 'cibles' then concat_ws(' ', p_ligne->>'prenom', p_ligne->>'nom')
    when 'beneficiaires' then (select concat_ws(' ', prenom, nom) from public.cibles where id = (p_ligne->>'cible_id')::uuid)
    when 'apports' then concat_ws(' — ', p_ligne->>'description',
      (select concat_ws(' ', c.prenom, c.nom) from public.beneficiaires b join public.cibles c on c.id = b.cible_id where b.id = (p_ligne->>'beneficiaire_id')::uuid))
    when 'consultations' then (select concat_ws(' ', c.prenom, c.nom) from public.beneficiaires b join public.cibles c on c.id = b.cible_id where b.id = (p_ligne->>'beneficiaire_id')::uuid)
    when 'suivis' then concat('Suivi à ', p_ligne->>'echeance_mois', ' mois — ',
      (select concat_ws(' ', c.prenom, c.nom) from public.beneficiaires b join public.cibles c on c.id = b.cible_id where b.id = (p_ligne->>'beneficiaire_id')::uuid))
    when 'presences' then concat_ws(' — ',
      (select concat_ws(' ', c.prenom, c.nom) from public.beneficiaires b join public.cibles c on c.id = b.cible_id where b.id = (p_ligne->>'beneficiaire_id')::uuid),
      (select to_char(date, 'DD/MM/YYYY') from public.seances where id = (p_ligne->>'seance_id')::uuid))
    when 'action_equipe' then (select concat(prenom, ' ', nom, ' (', numero_adherent, ')') from public.membres where id = (p_ligne->>'membre_id')::uuid)
    when 'action_partenaires' then (select coalesce(sigle, nom) from public.partenaires where id = (p_ligne->>'partenaire_id')::uuid)
    when 'seances' then concat_ws(' — ', to_char((p_ligne->>'date')::date, 'DD/MM/YYYY'), p_ligne->>'theme')
    when 'membres' then concat(p_ligne->>'prenom', ' ', p_ligne->>'nom', ' (', p_ligne->>'numero_adherent', ')')
    when 'roles' then concat('Rôle « ', p_ligne->>'nom', ' »')
    when 'acces_partenaires' then concat(concat_ws(' ', p_ligne->>'prenom', p_ligne->>'nom'), ' — ',
      (select coalesce(sigle, nom) from public.partenaires where id = (p_ligne->>'partenaire_id')::uuid))
    when 'cartes' then concat('Carte de ', coalesce(
      (select concat(prenom, ' ', nom) from public.membres where id = (p_ligne->>'membre_id')::uuid),
      (select concat_ws(' ', prenom, nom) from public.cibles where id = (p_ligne->>'cible_id')::uuid)))
  end
$$;

create or replace function public.journaliser() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ancien jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_nouveau jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_ligne jsonb := coalesce(v_nouveau, v_ancien);
  v_details jsonb;
  v_cle text;
begin
  if coalesce(current_setting('ap2a.purge_demo', true), '') = 'on' then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    -- Seuls les champs modifiés ; jamais le jeton d'une carte.
    v_details := '{}';
    for v_cle in select jsonb_object_keys(v_nouveau) loop
      if v_cle not in ('modifie_le', 'telephone_normalise', 'recherche', 'groupes', 'jeton', 'jeton_hash')
         and v_nouveau->v_cle is distinct from v_ancien->v_cle then
        v_details := v_details || jsonb_build_object(v_cle, jsonb_build_array(v_ancien->v_cle, v_nouveau->v_cle));
      end if;
    end loop;
    if v_details = '{}' then
      return null;
    end if;
  end if;
  insert into public.journal (membre_id, auteur_nom, table_nom, operation, ligne_id, action_id, libelle, details)
  values (
    public.mon_membre_id(), public.mon_nom(), tg_table_name, tg_op,
    coalesce(v_ligne->>'id', v_ligne->>'beneficiaire_id', v_ligne->>'membre_id', v_ligne->>'partenaire_id'),
    public.action_de_ligne(tg_table_name, v_ligne),
    public.libelle_ligne(tg_table_name, v_ligne),
    v_details
  );
  return null;
end $$;

create trigger roles_journal after insert or update or delete on public.roles
  for each row execute function public.journaliser();
create trigger acces_partenaires_journal after insert or update or delete on public.acces_partenaires
  for each row execute function public.journaliser();
create trigger cibles_journal after insert or update or delete on public.cibles
  for each row execute function public.journaliser();
create trigger consultations_journal after insert or update or delete on public.consultations
  for each row execute function public.journaliser();
create trigger suivis_journal after insert or update or delete on public.suivis
  for each row execute function public.journaliser();
create trigger presences_journal after insert or update or delete on public.presences
  for each row execute function public.journaliser();
create trigger cartes_journal after insert or update or delete on public.cartes
  for each row execute function public.journaliser();

-- Qui a envoyé une invitation ou un rappel (quotas, enquête).
alter table public.rappels_envoyes add column if not exists envoye_par uuid references public.membres (id) on delete set null;
alter table public.rappels_envoyes add column if not exists envoye_par_nom text;

-- =====================================================================
-- 6. Annuaire des membres (M1)
-- =====================================================================
-- Tous les membres voient les noms, fonctions, rôles et compétences. Email,
-- téléphone, compte et réglages personnels : seulement la personne
-- elle-même (ma_fiche) et qui gère les membres (membres_complets).
revoke select on public.membres from authenticated;
grant select (id, prenom, nom, role, fonction, numero_adherent, date_adhesion, actif, cree_le, modifie_le,
              photo_chemin, role_id, niveau_etude, competences) on public.membres to authenticated;

create or replace function public.fiche_json(m public.membres) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(m) || jsonb_build_object('role_info',
    (select jsonb_build_object('id', r.id, 'code', r.code, 'nom', r.nom, 'permissions', r.permissions) from public.roles r where r.id = m.role_id))
$$;
revoke all on function public.fiche_json(public.membres) from public, anon, authenticated;

create or replace function public.ma_fiche() returns jsonb
language sql stable security definer set search_path = public as $$
  select public.fiche_json(m) from public.membres m where m.user_id = auth.uid() and m.actif
$$;
revoke all on function public.ma_fiche() from public, anon;
grant execute on function public.ma_fiche() to authenticated;

create or replace function public.membres_complets() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.a_permission('membres.gerer') then
    raise exception 'Il faut le droit « Gérer les membres »' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(public.fiche_json(m) order by m.nom, m.prenom) from public.membres m), '[]'::jsonb);
end $$;
revoke all on function public.membres_complets() from public, anon;
grant execute on function public.membres_complets() to authenticated;

-- Réglage « recevoir les rappels » de la personne connectée.
create or replace function public.mes_rappels_email() returns boolean
language sql stable security definer set search_path = public as $$
  select rappels_email from public.membres where user_id = auth.uid() and actif
$$;
revoke all on function public.mes_rappels_email() from public, anon;
grant execute on function public.mes_rappels_email() to authenticated;

-- =====================================================================
-- 7. Jetons des cartes (M2)
-- =====================================================================
-- Le jeton du QR code est la « clé » de la carte. Lisible seulement par le
-- titulaire et par qui gère les cartes, via jetons_cartes. Les listes de
-- pointage hors ligne n'ont besoin que de son empreinte (SHA-256), qui ne
-- permet pas de refaire la carte.
alter table public.cartes add column if not exists jeton_hash text
  generated always as (encode(sha256(jeton::bytea), 'hex')) stored;
revoke select on public.cartes from authenticated;
grant select (id, membre_id, cible_id, emise_le, emise_par, revoquee_le, jeton_hash) on public.cartes to authenticated;

create or replace function public.jetons_cartes(p_cartes uuid[]) returns table (id uuid, jeton text)
language sql stable security definer set search_path = public as $$
  select c.id, c.jeton from public.cartes c
  where c.id = any(p_cartes)
    and ((c.membre_id is not null and (c.membre_id = public.mon_membre_id() or public.a_permission('membres.gerer')))
      or (c.cible_id is not null and public.voit_cibles()))
$$;
revoke all on function public.jetons_cartes(uuid[]) from public, anon;
grant execute on function public.jetons_cartes(uuid[]) to authenticated;

-- Vérification publique : l'état, et l'identité seulement d'une carte valide.
create or replace function public.verifier_carte(p_jeton text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when c.revoquee_le is not null then jsonb_build_object('statut', 'revoquee', 'revoquee_le', c.revoquee_le)
      when c.membre_id is not null and not m.actif then jsonb_build_object('statut', 'inactive')
      when c.membre_id is not null then jsonb_build_object(
        'statut', 'valide', 'type', 'membre', 'prenom', m.prenom, 'nom', m.nom, 'numero', m.numero_adherent,
        'role_nom', (select r.nom from public.roles r where r.id = m.role_id), 'emise_le', c.emise_le)
      else jsonb_build_object(
        'statut', 'valide', 'type', 'beneficiaire', 'prenom', k.prenom, 'nom', left(coalesce(k.nom, ''), 1) || '.',
        'numero', k.numero_beneficiaire, 'emise_le', c.emise_le)
      end
    from public.cartes c
    left join public.membres m on m.id = c.membre_id
    left join public.cibles k on k.id = c.cible_id
    where c.jeton = p_jeton
  ), jsonb_build_object('statut', 'inconnue'))
$$;

-- Pointage et remise : le nom d'une carte étrangère à l'action n'est donné
-- qu'à qui voit les cibles (L6).
create or replace function public.pointer_seance(p_seance uuid, p_jeton text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_action uuid;
  carte public.cartes;
  personne public.cibles;
  v_benef uuid;
  deja boolean;
  v_voit boolean := public.voit_cibles();
begin
  select action_id into v_action from public.seances where id = p_seance;
  if v_action is null or not public.peut_faire_appel(p_seance) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  select * into carte from public.cartes where jeton = p_jeton;
  if carte.id is null then return jsonb_build_object('statut', 'inconnue'); end if;
  if carte.cible_id is null then return jsonb_build_object('statut', 'carte_membre'); end if;
  select * into personne from public.cibles where id = carte.cible_id;
  select id into v_benef from public.beneficiaires where action_id = v_action and cible_id = carte.cible_id;
  if carte.revoquee_le is not null then
    return jsonb_build_object('statut', 'revoquee', 'prenom', case when v_voit or v_benef is not null then personne.prenom end,
                              'nom', case when v_voit or v_benef is not null then personne.nom end);
  end if;
  if v_benef is null then
    return jsonb_build_object('statut', 'pas_inscrit', 'prenom', case when v_voit then personne.prenom end,
                              'nom', case when v_voit then personne.nom end);
  end if;
  select present into deja from public.presences where seance_id = p_seance and beneficiaire_id = v_benef;
  insert into public.presences (seance_id, beneficiaire_id, present, pointe_le, mode)
  values (p_seance, v_benef, true, now(), 'scan')
  on conflict (seance_id, beneficiaire_id) do update
    set present = true, pointe_le = coalesce(presences.pointe_le, now()), mode = coalesce(presences.mode, 'scan');
  return jsonb_build_object('statut', case when deja then 'deja' else 'ok' end, 'prenom', personne.prenom, 'nom', personne.nom,
                            'beneficiaire_id', v_benef, 'photo', personne.photo_chemin);
end;
$$;

create or replace function public.carte_pour_remise(p_action uuid, p_jeton text, p_modele uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  carte public.cartes;
  personne public.cibles;
  v_benef uuid;
  v_statut public.statut_beneficiaire;
  v_deja date;
  v_voit boolean := public.voit_cibles();
begin
  if not public.peut_gerer_action(p_action) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  select * into carte from public.cartes where jeton = p_jeton;
  if carte.id is null then return jsonb_build_object('statut', 'inconnue'); end if;
  if carte.cible_id is null then return jsonb_build_object('statut', 'carte_membre'); end if;
  select * into personne from public.cibles where id = carte.cible_id;
  select id, statut into v_benef, v_statut from public.beneficiaires where action_id = p_action and cible_id = carte.cible_id;
  if carte.revoquee_le is not null then
    return jsonb_build_object('statut', 'revoquee', 'prenom', case when v_voit or v_benef is not null then personne.prenom end,
                              'nom', case when v_voit or v_benef is not null then personne.nom end);
  end if;
  if v_benef is null then
    return jsonb_build_object('statut', 'pas_inscrit', 'prenom', case when v_voit then personne.prenom end,
                              'nom', case when v_voit then personne.nom end);
  end if;
  select max(date_remise) into v_deja from public.apports where beneficiaire_id = v_benef and modele_id = p_modele;
  return jsonb_build_object(
    'statut', case when v_deja is not null then 'deja' when v_statut = 'abandon' then 'abandon' else 'ok' end,
    'beneficiaire_id', v_benef, 'prenom', personne.prenom, 'nom', personne.nom,
    'numero', personne.numero_beneficiaire, 'photo', personne.photo_chemin, 'deja_le', v_deja);
end $$;

-- =====================================================================
-- 8. Fiches des bénéficiaires et équipe de terrain (M5)
-- =====================================================================
-- L'équipe d'une action n'a plus accès aux fiches complètes (vulnérabilités,
-- notes, adresse, date de naissance) : seulement à ce qu'il faut pour
-- l'appel et les appels téléphoniques, par cette fonction.
alter policy cibles_lecture on public.cibles using (public.voit_cibles());

create or replace function public.participants_equipe(p_action uuid)
returns table (beneficiaire_id uuid, cible_id uuid, statut public.statut_beneficiaire, type text, prenom text, nom text,
               telephone text, numero_beneficiaire text, photo_chemin text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.voit_cibles() or public.dans_equipe(p_action) or public.peut_gerer_action(p_action)) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  return query
    select b.id, c.id, b.statut, c.type::text, c.prenom, c.nom, c.telephone, c.numero_beneficiaire, c.photo_chemin
    from public.beneficiaires b join public.cibles c on c.id = b.cible_id
    where b.action_id = p_action
    order by c.nom, c.prenom;
end $$;
revoke all on function public.participants_equipe(uuid) from public, anon;
grant execute on function public.participants_equipe(uuid) to authenticated;

-- =====================================================================
-- 9. Fonctions : chemin de recherche fixe et droits d'exécution (L2)
-- =====================================================================
alter function public.normaliser_numero(text) set search_path = public;
alter function public.date_longue(date) set search_path = public;
alter function public.preparer_competences() set search_path = public;
alter function public.alphabet_crockford() set search_path = public;
alter function public.nettoyer_competences(text[]) set search_path = public;

-- Fonctions de déclencheur : jamais appelables directement (le droit
-- d'exécution n'est vérifié qu'à la création du déclencheur).
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- Petites fonctions utilitaires : pas pour les visiteurs anonymes.
revoke execute on function public.date_longue(date), public.alphabet_crockford(), public.cle_luhn32(text),
  public.normaliser_numero(text), public.numero_valide(text), public.nettoyer_competences(text[]) from public, anon;
grant execute on function public.date_longue(date), public.alphabet_crockford(), public.cle_luhn32(text),
  public.normaliser_numero(text), public.numero_valide(text), public.nettoyer_competences(text[]) to authenticated, service_role;

-- Les fonctions créées plus tard ne sont plus exécutables par tous d'office.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
