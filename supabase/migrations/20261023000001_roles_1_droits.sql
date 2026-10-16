-- Rôles et droits, fonctionnalité par fonctionnalité.
--
-- * Chaque fonctionnalité a ses droits (table permissions) : voir les cibles,
--   gérer les kits, régler les rappels...
-- * Un rôle est un ensemble de droits (table roles). Les quatre rôles
--   d'origine deviennent des rôles « système » (administrateur, bureau,
--   coordinateur, membre) avec exactement les droits qu'ils avaient ; on peut
--   en créer d'autres et les attribuer.
-- * L'administrateur a toujours tous les droits, y compris ceux ajoutés plus tard.
-- * Personne ne peut donner (ou créer un rôle avec) un droit qu'il n'a pas,
--   ni changer son propre rôle ; il reste toujours quelqu'un pour gérer les rôles.

-- ---------------------------------------------------------------------
-- 1. Catalogue des droits
-- ---------------------------------------------------------------------
create table public.permissions (
  code text primary key check (code ~ '^[a-z_]+\.[a-z_]+$'),
  groupe text not null,
  libelle text not null,
  description text,
  ordre int not null default 0
);
alter table public.permissions enable row level security;
grant select on public.permissions to authenticated;
create policy permissions_lecture on public.permissions for select to authenticated using (true);

insert into public.permissions (code, groupe, libelle, description, ordre) values
  ('cibles.voir', 'Cibles et bénéficiaires', 'Voir toutes les cibles', 'Le répertoire des cibles, les listes de bénéficiaires de toutes les actions, leurs cartes et leurs photos.', 10),
  ('cibles.ajouter', 'Cibles et bénéficiaires', 'Ajouter des cibles', 'Ajouter des cibles et modifier celles dont on est le référent ou l''auteur.', 11),
  ('cibles.gerer', 'Cibles et bénéficiaires', 'Modifier et supprimer toutes les cibles', null, 12),
  ('actions.creer', 'Actions', 'Créer des actions', 'Créer des actions et gérer celles dont on est responsable ou auteur.', 20),
  ('actions.gerer', 'Actions', 'Gérer toutes les actions', 'Bénéficiaires, séances, apports, équipe, partenaires et suivis de toutes les actions.', 21),
  ('actions.rouvrir', 'Actions', 'Rouvrir une action clôturée', null, 22),
  ('suivis.faire', 'Suivis', 'Faire les suivis des bénéficiaires suivis', 'Noter ce que deviennent les bénéficiaires dont on est le référent (ou le responsable de l''action).', 30),
  ('impact.voir', 'Suivis', 'Voir l''impact détaillé', 'La page Impact et les retards de suivi dans le courriel de la semaine.', 31),
  ('evenements.creer', 'Événements', 'Créer des événements', 'Créer des événements et gérer ceux qu''on a créés.', 40),
  ('evenements.gerer', 'Événements', 'Gérer tous les événements', null, 41),
  ('evenements.rouvrir', 'Événements', 'Rouvrir ou supprimer un événement clôturé', null, 42),
  ('kits.gerer', 'Kits et stock', 'Gérer le catalogue et le stock des kits', 'Créer les kits, saisir les entrées, pertes et inventaires.', 50),
  ('partenaires.gerer', 'Partenaires', 'Gérer les partenaires', 'Fiches partenaires et accès des partenaires à l''application.', 60),
  ('membres.gerer', 'Membres', 'Gérer les membres', 'Ajouter et modifier les fiches membres, leur photo, leur carte, envoyer les invitations.', 70),
  ('membres.supprimer', 'Membres', 'Supprimer un membre', null, 71),
  ('membres.comptes', 'Membres', 'Gérer les comptes de connexion', 'Relier un compte à une fiche, changer l''adresse de connexion.', 72),
  ('roles.gerer', 'Membres', 'Gérer les rôles', 'Créer des rôles, choisir leurs droits et les attribuer aux membres.', 73),
  ('referentiels.gerer', 'Réglages', 'Gérer les listes de référence', 'Catégories de cibles, zones, types d''action, profils.', 80),
  ('vitrine.gerer', 'Réglages', 'Gérer les médias du site public', null, 81),
  ('rappels.voir', 'Réglages', 'Voir les réglages et l''historique des rappels', 'Tous les rappels envoyés, par tous.', 82),
  ('rappels.regler', 'Réglages', 'Régler les rappels', 'Jours, heures, SMS ; envoyer les rappels à tous.', 83),
  ('journal.voir', 'Réglages', 'Voir tout l''historique des modifications', null, 84),
  ('medical.journal', 'Réglages', 'Voir qui a lu les notes médicales', null, 85),
  ('demo.gerer', 'Réglages', 'Effacer les données de démonstration', null, 86);

-- ---------------------------------------------------------------------
-- 2. Rôles
-- ---------------------------------------------------------------------
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  code text unique check (code ~ '^[a-z_]+$'),          -- rôles système seulement
  nom text not null unique check (length(trim(nom)) between 1 and 60),
  description text check (length(description) <= 300),
  permissions text[] not null default '{}',
  systeme boolean not null default false,
  ordre int not null default 100,
  cree_le timestamptz not null default now(),
  cree_par uuid references public.membres (id) on delete set null default public.mon_membre_id()
);

insert into public.roles (code, nom, description, systeme, ordre, permissions) values
  ('admin', 'Administrateur', 'Tous les droits, y compris les rôles et les réglages.', true, 1,
   array(select code from public.permissions order by ordre)),
  ('bureau', 'Bureau', 'Gère l''association au quotidien.', true, 2, array[
   'cibles.voir', 'cibles.ajouter', 'cibles.gerer', 'actions.creer', 'actions.gerer', 'suivis.faire', 'impact.voir',
   'evenements.creer', 'evenements.gerer', 'kits.gerer', 'partenaires.gerer', 'membres.gerer',
   'referentiels.gerer', 'vitrine.gerer', 'rappels.voir', 'journal.voir']),
  ('coordinateur', 'Coordinateur', 'Mène des actions sur le terrain et suit les bénéficiaires.', true, 3, array[
   'cibles.voir', 'cibles.ajouter', 'actions.creer', 'suivis.faire', 'impact.voir', 'evenements.creer']),
  ('membre', 'Membre', 'Consulte, et participe aux actions dont il fait partie de l''équipe.', true, 4, '{}');

-- ---------------------------------------------------------------------
-- 3. Rôle de chaque membre
-- ---------------------------------------------------------------------
alter table public.membres add column if not exists role_id uuid references public.roles (id) on delete restrict;
update public.membres m set role_id = r.id from public.roles r where r.code = m.role::text and m.role_id is null;
alter table public.membres alter column role_id set not null;
create index if not exists membres_role on public.membres (role_id);

-- Droits d'un membre (l'administrateur a tous les droits, même futurs).
create or replace function public.droits_membre(p_membre uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select case when r.code = 'admin' then array(select code from public.permissions order by ordre) else r.permissions end
  from public.membres m join public.roles r on r.id = m.role_id
  where m.id = p_membre and m.actif
$$;

create or replace function public.membre_a_permission(p_membre uuid, p text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select r.code = 'admin' or p = any(r.permissions)
    from public.membres m join public.roles r on r.id = m.role_id
    where m.id = p_membre and m.actif), false)
$$;

-- La personne connectée a-t-elle ce droit ?
create or replace function public.a_permission(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select r.code = 'admin' or p = any(r.permissions)
    from public.membres m join public.roles r on r.id = m.role_id
    where m.user_id = auth.uid() and m.actif), false)
$$;

create or replace function public.mes_permissions() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(public.droits_membre(public.mon_membre_id()), '{}')
$$;

revoke all on function public.droits_membre(uuid) from public, anon;
revoke all on function public.membre_a_permission(uuid, text) from public, anon;
revoke all on function public.a_permission(text) from public, anon;
revoke all on function public.mes_permissions() from public, anon;
grant execute on function public.droits_membre(uuid) to authenticated;
grant execute on function public.membre_a_permission(uuid, text) to authenticated;
grant execute on function public.a_permission(text) to authenticated;
grant execute on function public.mes_permissions() to authenticated;

-- Reste-t-il quelqu'un (d'actif, autre que p_sauf) pour gérer les rôles ?
create or replace function public.reste_gestionnaire_roles(p_sauf_membre uuid, p_sauf_role uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.membres m join public.roles r on r.id = m.role_id
    where m.actif and m.id is distinct from p_sauf_membre
      and (r.code = 'admin' or (r.id is distinct from p_sauf_role and 'roles.gerer' = any(r.permissions))))
$$;
revoke all on function public.reste_gestionnaire_roles(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Garde-fous sur les rôles
-- ---------------------------------------------------------------------
alter table public.roles enable row level security;
grant select, insert, update, delete on public.roles to authenticated;
create policy roles_lecture on public.roles for select to authenticated using (public.mon_membre_id() is not null);
create policy roles_ajout on public.roles for insert to authenticated with check (public.a_permission('roles.gerer'));
create policy roles_modif on public.roles for update to authenticated
  using (public.a_permission('roles.gerer')) with check (public.a_permission('roles.gerer'));
create policy roles_suppr on public.roles for delete to authenticated using (public.a_permission('roles.gerer') and not systeme);

create or replace function public.proteger_role() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_inconnus text[];
  v_en_trop text[];
begin
  if tg_op = 'DELETE' then
    if old.systeme and auth.uid() is not null then
      raise exception 'Les rôles d''origine ne peuvent pas être supprimés' using errcode = '42501';
    end if;
    return old;
  end if;
  new.permissions := array(select distinct x from unnest(new.permissions) x order by x);
  select array_agg(x) into v_inconnus from unnest(new.permissions) x where not exists (select 1 from public.permissions p where p.code = x);
  if v_inconnus is not null then
    raise exception 'Droits inconnus : %', array_to_string(v_inconnus, ', ') using errcode = '23514';
  end if;
  if auth.uid() is null then
    return new;   -- migrations et tâches internes
  end if;
  if tg_op = 'INSERT' then
    new.code := null;
    new.systeme := false;
  else
    if new.code is distinct from old.code or new.systeme is distinct from old.systeme then
      raise exception 'Le code d''un rôle d''origine ne change pas' using errcode = '42501';
    end if;
    if old.code = 'admin' and new.permissions is distinct from old.permissions then
      raise exception 'L''administrateur a toujours tous les droits' using errcode = '42501';
    end if;
  end if;
  -- On ne donne pas un droit qu'on n'a pas soi-même.
  select array_agg(x) into v_en_trop from unnest(new.permissions) x where not (x = any(public.mes_permissions()));
  if v_en_trop is not null and (tg_op = 'INSERT' or not (v_en_trop <@ old.permissions)) then
    raise exception 'Vous ne pouvez pas donner des droits que vous n''avez pas : %', array_to_string(v_en_trop, ', ') using errcode = '42501';
  end if;
  -- Il doit rester quelqu'un pour gérer les rôles.
  if tg_op = 'UPDATE' and 'roles.gerer' = any(old.permissions) and not ('roles.gerer' = any(new.permissions))
     and not public.reste_gestionnaire_roles(null, new.id) then
    raise exception 'Plus personne ne pourrait gérer les rôles' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger roles_proteger before insert or update or delete on public.roles
  for each row execute function public.proteger_role();
