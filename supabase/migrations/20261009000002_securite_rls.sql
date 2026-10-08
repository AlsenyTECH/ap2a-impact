-- =====================================================================
-- Sécurité : règles d'accès ligne par ligne (Row Level Security).
--
-- Le navigateur parle directement à la base : ce sont CES règles, et non
-- l'interface, qui décident de ce que chacun peut lire et modifier.
-- Sans règle explicite, tout est refusé.
--
--   admin / bureau : lisent et gèrent tout (seul l'admin change les rôles)
--   coordinateur   : lit cibles et actions, crée des cibles et des actions,
--                    gère les actions dont il est responsable ou créateur
--   membre         : voit les actions ; ne voit les bénéficiaires (données
--                    personnelles) que des actions dont il fait partie
-- Un compte sans fiche membre active n'a accès à rien.
-- =====================================================================

-- Valeurs par défaut : l'auteur est le membre connecté.
alter table public.cibles alter column cree_par set default public.mon_membre_id();
alter table public.actions alter column cree_par set default public.mon_membre_id();
alter table public.apports alter column saisi_par set default public.mon_membre_id();

-- Peut gérer une action : gestionnaire, ou coordinateur responsable/créateur.
create function public.peut_gerer_action(p_action uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_gestionnaire() or exists (
    select 1 from public.actions a
    where a.id = p_action
      and public.a_role('coordinateur')
      and public.mon_membre_id() in (a.responsable_id, a.cree_par)
  )
$$;

-- Fait partie de l'équipe d'une action.
create function public.dans_equipe(p_action uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.action_equipe e
    where e.action_id = p_action and e.membre_id = public.mon_membre_id()
  )
$$;

-- Peut lire les données personnelles des cibles.
create function public.voit_cibles() returns boolean
language sql stable as $$ select public.a_role('admin', 'bureau', 'coordinateur') $$;

-- ---------------------------------------------------------------------
-- Rôles : seul un admin attribue ou change un rôle, et personne ne
-- modifie son propre rôle (pas d'élévation de privilèges).
-- ---------------------------------------------------------------------
create function public.verifier_changement_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Les opérations techniques (clé service, SQL du tableau de bord
  -- Supabase) ne passent pas par un utilisateur : elles sont permises.
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' and new.role <> 'membre' and not public.a_role('admin') then
    raise exception 'Seul un administrateur peut attribuer le rôle %', new.role using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    if not public.a_role('admin') then
      raise exception 'Seul un administrateur peut changer un rôle' using errcode = '42501';
    end if;
    if old.user_id = auth.uid() then
      raise exception 'Vous ne pouvez pas changer votre propre rôle' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id and not public.a_role('admin') then
    raise exception 'Seul un administrateur peut relier un compte à une fiche membre' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger membres_roles before insert or update on public.membres
  for each row execute function public.verifier_changement_role();

-- À l'inscription d'un compte, il est relié à la fiche membre préparée
-- par le bureau avec la même adresse email. Un compte sans fiche n'a
-- aucun accès : l'inscription libre ne donne donc rien à un inconnu.
create function public.relier_compte_a_membre() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.membres set user_id = new.id
  where user_id is null and email is not null and lower(email) = lower(new.email);
  return new;
end $$;
create trigger relier_compte after insert on auth.users
  for each row execute function public.relier_compte_a_membre();

-- ---------------------------------------------------------------------
-- Activation de la RLS sur toutes les tables
-- ---------------------------------------------------------------------
alter table public.membres enable row level security;
alter table public.zones enable row level security;
alter table public.partenaires enable row level security;
alter table public.cibles enable row level security;
alter table public.appartenances enable row level security;
alter table public.types_action enable row level security;
alter table public.actions enable row level security;
alter table public.action_partenaires enable row level security;
alter table public.action_equipe enable row level security;
alter table public.beneficiaires enable row level security;
alter table public.apports enable row level security;

-- MEMBRES : l'annuaire est visible des membres actifs ; gestion par le bureau.
create policy membres_lecture on public.membres for select to authenticated
  using (public.mon_membre_id() is not null);
create policy membres_ajout on public.membres for insert to authenticated
  with check (public.est_gestionnaire());
create policy membres_modif on public.membres for update to authenticated
  using (public.est_gestionnaire()) with check (public.est_gestionnaire());
create policy membres_suppr on public.membres for delete to authenticated
  using (public.a_role('admin'));

-- ZONES, PARTENAIRES, TYPES D'ACTION : référentiels lus par tous, gérés par le bureau.
create policy zones_lecture on public.zones for select to authenticated using (public.mon_membre_id() is not null);
create policy zones_gestion on public.zones for all to authenticated
  using (public.est_gestionnaire()) with check (public.est_gestionnaire());
create policy partenaires_lecture on public.partenaires for select to authenticated using (public.mon_membre_id() is not null);
create policy partenaires_gestion on public.partenaires for all to authenticated
  using (public.est_gestionnaire()) with check (public.est_gestionnaire());
create policy types_lecture on public.types_action for select to authenticated using (public.mon_membre_id() is not null);
create policy types_gestion on public.types_action for all to authenticated
  using (public.est_gestionnaire()) with check (public.est_gestionnaire());

-- CIBLES et APPARTENANCES : données personnelles.
create policy cibles_lecture on public.cibles for select to authenticated
  using (
    public.voit_cibles()
    or exists (select 1 from public.beneficiaires b where b.cible_id = cibles.id and public.dans_equipe(b.action_id))
  );
create policy cibles_ajout on public.cibles for insert to authenticated
  with check (public.voit_cibles());
create policy cibles_modif on public.cibles for update to authenticated
  using (public.est_gestionnaire() or (public.a_role('coordinateur') and public.mon_membre_id() in (referent_id, cree_par)))
  with check (public.voit_cibles());
create policy cibles_suppr on public.cibles for delete to authenticated
  using (public.est_gestionnaire());

create policy appartenances_lecture on public.appartenances for select to authenticated using (public.voit_cibles());
create policy appartenances_gestion on public.appartenances for all to authenticated
  using (public.voit_cibles()) with check (public.voit_cibles());

-- ACTIONS : visibles de tous les membres ; gérées par leur responsable.
create policy actions_lecture on public.actions for select to authenticated using (public.mon_membre_id() is not null);
create policy actions_ajout on public.actions for insert to authenticated
  with check (public.a_role('admin', 'bureau', 'coordinateur'));
create policy actions_modif on public.actions for update to authenticated
  using (public.peut_gerer_action(id)) with check (public.a_role('admin', 'bureau', 'coordinateur'));
create policy actions_suppr on public.actions for delete to authenticated
  using (public.peut_gerer_action(id) and statut = 'preparation');

create policy partenaires_action_lecture on public.action_partenaires for select to authenticated
  using (public.mon_membre_id() is not null);
create policy partenaires_action_gestion on public.action_partenaires for all to authenticated
  using (public.peut_gerer_action(action_id)) with check (public.peut_gerer_action(action_id));

create policy equipe_lecture on public.action_equipe for select to authenticated using (public.mon_membre_id() is not null);
create policy equipe_gestion on public.action_equipe for all to authenticated
  using (public.peut_gerer_action(action_id)) with check (public.peut_gerer_action(action_id));

-- BÉNÉFICIAIRES et APPORTS : bureau, coordinateurs, et l'équipe de l'action.
create policy beneficiaires_lecture on public.beneficiaires for select to authenticated
  using (public.voit_cibles() or public.dans_equipe(action_id));
create policy beneficiaires_gestion on public.beneficiaires for all to authenticated
  using (public.peut_gerer_action(action_id)) with check (public.peut_gerer_action(action_id));

create policy apports_lecture on public.apports for select to authenticated
  using (exists (
    select 1 from public.beneficiaires b
    where b.id = apports.beneficiaire_id and (public.voit_cibles() or public.dans_equipe(b.action_id))
  ));
create policy apports_gestion on public.apports for all to authenticated
  using (exists (select 1 from public.beneficiaires b where b.id = apports.beneficiaire_id and public.peut_gerer_action(b.action_id)))
  with check (exists (select 1 from public.beneficiaires b where b.id = apports.beneficiaire_id and public.peut_gerer_action(b.action_id)));

-- Aucun accès anonyme : la clé publique seule ne lit rien.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------
-- Stockage des justificatifs (photo du certificat, remise du kit).
-- Compartiment privé : chemin "<id bénéficiaire>/<fichier>", lisible par
-- ceux qui voient le bénéficiaire, déposé par ceux qui gèrent l'action.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('justificatifs', 'justificatifs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create function public.beneficiaire_du_fichier(chemin text) returns uuid
language sql immutable as $$
  select case when split_part(chemin, '/', 1) ~ '^[0-9a-f-]{36}$' then split_part(chemin, '/', 1)::uuid end
$$;

create policy justificatifs_lecture on storage.objects for select to authenticated
  using (bucket_id = 'justificatifs' and exists (
    select 1 from public.beneficiaires b
    where b.id = public.beneficiaire_du_fichier(name) and (public.voit_cibles() or public.dans_equipe(b.action_id))
  ));
create policy justificatifs_depot on storage.objects for insert to authenticated
  with check (bucket_id = 'justificatifs' and exists (
    select 1 from public.beneficiaires b
    where b.id = public.beneficiaire_du_fichier(name) and public.peut_gerer_action(b.action_id)
  ));
create policy justificatifs_suppr on storage.objects for delete to authenticated
  using (bucket_id = 'justificatifs' and exists (
    select 1 from public.beneficiaires b
    where b.id = public.beneficiaire_du_fichier(name) and public.peut_gerer_action(b.action_id)
  ));
