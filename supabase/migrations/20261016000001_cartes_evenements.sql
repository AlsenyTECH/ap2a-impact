-- Cartes avec QR code (membres et bénéficiaires), photos, pointage par scan
-- (séances de formation et événements), événements de l'association.
--
-- Le QR code d'une carte contient un lien https://…/v/<jeton>. Le jeton est
-- tiré au hasard (122 bits), ne contient aucune donnée personnelle et peut
-- être révoqué (carte perdue, départ) : une nouvelle carte annule l'ancienne.

-- ---------------------------------------------------------------------
-- 1. Photos (compartiment privé « photos » : membres/<id>.jpg, cibles/<id>.jpg)
-- ---------------------------------------------------------------------
alter table public.membres add column if not exists photo_chemin text;
alter table public.cibles add column if not exists photo_chemin text;
alter table public.cibles add column if not exists numero_beneficiaire text unique;
create sequence if not exists public.numeros_beneficiaires;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Identifiant contenu dans le chemin « membres/<uuid>.jpg ».
create or replace function public.id_de_photo(chemin text) returns uuid
language sql immutable set search_path = public as $$
  select case when split_part(chemin, '/', 2) ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$' then left(split_part(chemin, '/', 2), 36)::uuid end
$$;

-- Qui voit / qui change la photo d'une fiche.
create or replace function public.voit_photo(chemin text) returns boolean
language sql stable security definer set search_path = public as $$
  select case split_part(chemin, '/', 1)
    when 'membres' then public.mon_membre_id() is not null
    when 'cibles' then public.voit_cibles() or exists (
      select 1 from public.beneficiaires b where b.cible_id = public.id_de_photo(chemin) and public.dans_equipe(b.action_id))
    else false end
$$;
create or replace function public.change_photo(chemin text) returns boolean
language sql stable security definer set search_path = public as $$
  select case split_part(chemin, '/', 1)
    when 'membres' then public.est_gestionnaire() or public.id_de_photo(chemin) = public.mon_membre_id()
    when 'cibles' then public.voit_cibles() and public.id_de_photo(chemin) is not null
    else false end
$$;

create policy photos_lecture on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.voit_photo(name));
create policy photos_depot on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.change_photo(name));
create policy photos_remplacement on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.change_photo(name)) with check (bucket_id = 'photos' and public.change_photo(name));
create policy photos_suppr on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.change_photo(name));

-- Un membre peut changer sa propre photo (la fiche reste réservée aux gestionnaires).
create or replace function public.definir_photo_membre(p_membre uuid, p_chemin text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.est_gestionnaire() or p_membre = public.mon_membre_id()) then
    raise exception 'Seul le bureau peut changer la photo d''un autre membre' using errcode = '42501';
  end if;
  update public.membres set photo_chemin = p_chemin where id = p_membre;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Cartes
-- ---------------------------------------------------------------------
create table public.cartes (
  id uuid primary key default gen_random_uuid(),
  jeton text not null unique default replace(gen_random_uuid()::text, '-', ''),
  membre_id uuid references public.membres (id) on delete cascade,
  cible_id uuid references public.cibles (id) on delete cascade,
  emise_le timestamptz not null default now(),
  emise_par uuid references public.membres (id) on delete set null default public.mon_membre_id(),
  revoquee_le timestamptz,
  constraint carte_un_titulaire check (num_nonnulls(membre_id, cible_id) = 1)
);
create unique index cartes_membre_active on public.cartes (membre_id) where revoquee_le is null and membre_id is not null;
create unique index cartes_cible_active on public.cartes (cible_id) where revoquee_le is null and cible_id is not null;

alter table public.cartes enable row level security;
create policy cartes_lecture on public.cartes for select to authenticated using (
  (membre_id is not null and public.mon_membre_id() is not null)
  or (cible_id is not null and (public.voit_cibles() or exists (
    select 1 from public.beneficiaires b where b.cible_id = cartes.cible_id and public.dans_equipe(b.action_id))))
);
grant select on public.cartes to authenticated;
revoke all on public.cartes from anon;

-- Émet (ou renouvelle) la carte d'un membre ou d'une personne bénéficiaire.
create or replace function public.emettre_carte(p_membre uuid default null, p_cible uuid default null)
returns public.cartes language plpgsql security definer set search_path = public as $$
declare
  carte public.cartes;
begin
  if num_nonnulls(p_membre, p_cible) <> 1 then
    raise exception 'Indiquez un membre ou une cible';
  end if;
  if p_membre is not null then
    if not (public.est_gestionnaire() or p_membre = public.mon_membre_id()) then
      raise exception 'Seul le bureau émet la carte d''un autre membre' using errcode = '42501';
    end if;
    update public.cartes set revoquee_le = now() where membre_id = p_membre and revoquee_le is null;
  else
    if not public.voit_cibles() then
      raise exception 'Accès refusé' using errcode = '42501';
    end if;
    if not exists (select 1 from public.cibles where id = p_cible and type = 'personne') then
      raise exception 'Les cartes sont réservées aux personnes' using errcode = '23514';
    end if;
    update public.cibles set numero_beneficiaire = 'B-' || lpad(nextval('public.numeros_beneficiaires')::text, 5, '0')
      where id = p_cible and numero_beneficiaire is null;
    update public.cartes set revoquee_le = now() where cible_id = p_cible and revoquee_le is null;
  end if;
  insert into public.cartes (membre_id, cible_id) values (p_membre, p_cible) returning * into carte;
  return carte;
end;
$$;

-- Cartes de tous les participants (personnes) d'une action qui n'en ont pas encore.
create or replace function public.emettre_cartes_action(p_action uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  c record;
  n integer := 0;
begin
  if not (public.voit_cibles() and public.peut_gerer_action(p_action)) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  for c in
    select b.cible_id from public.beneficiaires b join public.cibles k on k.id = b.cible_id
    where b.action_id = p_action and k.type = 'personne'
      and not exists (select 1 from public.cartes x where x.cible_id = b.cible_id and x.revoquee_le is null)
  loop
    perform public.emettre_carte(null, c.cible_id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.revoquer_carte(p_carte uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  carte public.cartes;
begin
  select * into carte from public.cartes where id = p_carte;
  if carte.id is null then raise exception 'Carte inconnue'; end if;
  if not (public.est_gestionnaire() or (carte.cible_id is not null and public.voit_cibles())) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  update public.cartes set revoquee_le = now() where id = p_carte and revoquee_le is null;
end;
$$;

-- Vérification publique d'une carte (page ouverte en scannant le QR code,
-- même sans compte). Ne révèle que le strict nécessaire : pour un
-- bénéficiaire, le prénom et l'initiale du nom.
create or replace function public.verifier_carte(p_jeton text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when c.membre_id is not null then jsonb_build_object(
        'statut', case when c.revoquee_le is not null then 'revoquee' when not m.actif then 'inactive' else 'valide' end,
        'type', 'membre', 'prenom', m.prenom, 'nom', m.nom, 'numero', m.numero_adherent, 'role', m.role,
        'depuis', m.date_adhesion, 'emise_le', c.emise_le, 'revoquee_le', c.revoquee_le)
      else jsonb_build_object(
        'statut', case when c.revoquee_le is not null then 'revoquee' else 'valide' end,
        'type', 'beneficiaire', 'prenom', k.prenom, 'nom', left(coalesce(k.nom, ''), 1) || '.', 'numero', k.numero_beneficiaire,
        'emise_le', c.emise_le, 'revoquee_le', c.revoquee_le)
      end
    from public.cartes c
    left join public.membres m on m.id = c.membre_id
    left join public.cibles k on k.id = c.cible_id
    where c.jeton = p_jeton
  ), jsonb_build_object('statut', 'inconnue'))
$$;

-- ---------------------------------------------------------------------
-- 3. Pointage des séances par scan
-- ---------------------------------------------------------------------
alter table public.presences add column if not exists pointe_le timestamptz;
alter table public.presences add column if not exists mode text;

create or replace function public.pointer_seance(p_seance uuid, p_jeton text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_action uuid;
  carte public.cartes;
  personne public.cibles;
  v_benef uuid;
  deja boolean;
begin
  select action_id into v_action from public.seances where id = p_seance;
  if v_action is null or not public.peut_faire_appel(p_seance) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  select * into carte from public.cartes where jeton = p_jeton;
  if carte.id is null then return jsonb_build_object('statut', 'inconnue'); end if;
  if carte.cible_id is null then return jsonb_build_object('statut', 'carte_membre'); end if;
  select * into personne from public.cibles where id = carte.cible_id;
  if carte.revoquee_le is not null then
    return jsonb_build_object('statut', 'revoquee', 'prenom', personne.prenom, 'nom', personne.nom);
  end if;
  select id into v_benef from public.beneficiaires where action_id = v_action and cible_id = carte.cible_id;
  if v_benef is null then
    return jsonb_build_object('statut', 'pas_inscrit', 'prenom', personne.prenom, 'nom', personne.nom);
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

-- ---------------------------------------------------------------------
-- 4. Événements (AG, réunions, cérémonies…) et pointage des membres
-- ---------------------------------------------------------------------
create table public.evenements (
  id uuid primary key default gen_random_uuid(),
  titre text not null check (length(trim(titre)) > 0),
  type text not null default 'reunion',
  date date not null,
  heure_debut time,
  heure_fin time,
  lieu text,
  description text,
  invites text not null default 'tous' check (invites in ('tous', 'selection')),
  cree_par uuid references public.membres (id) on delete set null default public.mon_membre_id(),
  cree_le timestamptz not null default now()
);
create table public.evenement_invites (
  evenement_id uuid not null references public.evenements (id) on delete cascade,
  membre_id uuid not null references public.membres (id) on delete cascade,
  primary key (evenement_id, membre_id)
);
create table public.evenement_presences (
  evenement_id uuid not null references public.evenements (id) on delete cascade,
  membre_id uuid not null references public.membres (id) on delete cascade,
  pointe_le timestamptz not null default now(),
  pointe_par uuid references public.membres (id) on delete set null default public.mon_membre_id(),
  mode text not null default 'manuel' check (mode in ('manuel', 'scan')),
  primary key (evenement_id, membre_id)
);

-- Le bureau gère tous les événements ; un coordinateur, ceux qu'il a créés.
create or replace function public.peut_gerer_evenement(p_evenement uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_gestionnaire() or exists (
    select 1 from public.evenements e where e.id = p_evenement and public.a_role('coordinateur') and e.cree_par = public.mon_membre_id())
$$;

alter table public.evenements enable row level security;
alter table public.evenement_invites enable row level security;
alter table public.evenement_presences enable row level security;
create policy evenements_lecture on public.evenements for select to authenticated using (public.mon_membre_id() is not null);
create policy evenements_ajout on public.evenements for insert to authenticated with check (public.a_role('admin', 'bureau', 'coordinateur'));
create policy evenements_modif on public.evenements for update to authenticated using (public.peut_gerer_evenement(id)) with check (public.peut_gerer_evenement(id));
create policy evenements_suppr on public.evenements for delete to authenticated using (public.peut_gerer_evenement(id));
create policy invites_lecture on public.evenement_invites for select to authenticated using (public.mon_membre_id() is not null);
create policy invites_gestion on public.evenement_invites for all to authenticated
  using (public.peut_gerer_evenement(evenement_id)) with check (public.peut_gerer_evenement(evenement_id));
create policy ev_presences_lecture on public.evenement_presences for select to authenticated using (public.mon_membre_id() is not null);
create policy ev_presences_gestion on public.evenement_presences for all to authenticated
  using (public.peut_gerer_evenement(evenement_id)) with check (public.peut_gerer_evenement(evenement_id));
grant select, insert, update, delete on public.evenements, public.evenement_invites, public.evenement_presences to authenticated;
revoke all on public.evenements, public.evenement_invites, public.evenement_presences from anon;

create or replace function public.pointer_evenement(p_evenement uuid, p_jeton text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ev public.evenements;
  carte public.cartes;
  m public.membres;
  deja boolean;
  invite boolean;
begin
  select * into ev from public.evenements where id = p_evenement;
  if ev.id is null or not public.peut_gerer_evenement(p_evenement) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  select * into carte from public.cartes where jeton = p_jeton;
  if carte.id is null then return jsonb_build_object('statut', 'inconnue'); end if;
  if carte.membre_id is null then return jsonb_build_object('statut', 'carte_beneficiaire'); end if;
  select * into m from public.membres where id = carte.membre_id;
  if carte.revoquee_le is not null or not m.actif then
    return jsonb_build_object('statut', 'revoquee', 'prenom', m.prenom, 'nom', m.nom, 'numero', m.numero_adherent);
  end if;
  invite := ev.invites = 'tous' or exists (select 1 from public.evenement_invites where evenement_id = p_evenement and membre_id = m.id);
  deja := exists (select 1 from public.evenement_presences where evenement_id = p_evenement and membre_id = m.id);
  insert into public.evenement_presences (evenement_id, membre_id, mode) values (p_evenement, m.id, 'scan')
  on conflict do nothing;
  return jsonb_build_object('statut', case when deja then 'deja' when not invite then 'non_invite' else 'ok' end,
                            'membre_id', m.id, 'prenom', m.prenom, 'nom', m.nom, 'numero', m.numero_adherent, 'photo', m.photo_chemin);
end;
$$;

-- Droits d'exécution : fonctions réservées aux comptes connectés, sauf la vérification publique.
revoke all on function public.id_de_photo(text), public.voit_photo(text), public.change_photo(text),
  public.definir_photo_membre(uuid, text), public.emettre_carte(uuid, uuid), public.emettre_cartes_action(uuid),
  public.revoquer_carte(uuid), public.verifier_carte(text), public.pointer_seance(uuid, text),
  public.peut_gerer_evenement(uuid), public.pointer_evenement(uuid, text) from public, anon;
grant execute on function public.id_de_photo(text), public.voit_photo(text), public.change_photo(text),
  public.definir_photo_membre(uuid, text), public.emettre_carte(uuid, uuid), public.emettre_cartes_action(uuid),
  public.revoquer_carte(uuid), public.pointer_seance(uuid, text),
  public.peut_gerer_evenement(uuid), public.pointer_evenement(uuid, text) to authenticated;
grant execute on function public.verifier_carte(text) to anon, authenticated;
