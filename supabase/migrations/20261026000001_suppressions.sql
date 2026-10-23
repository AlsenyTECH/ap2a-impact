-- Suppressions, et retrait des cibles.
--
--  * Membre : supprimé par qui a le droit « Supprimer un membre » (admin),
--    avec son compte de connexion. Jamais soi-même, ni quelqu'un qui a des
--    droits qu'on n'a pas. Ce qu'il a fait reste, sans son nom.
--  * Action : supprimable tant qu'elle n'a pas été réalisée : en préparation
--    ou annulée, sans apport remis ni présence pointée.
--  * Cible : supprimable si elle n'a jamais bénéficié d'une action. Sinon on
--    la « retire » : elle disparaît des listes et des recherches, mais reste
--    dans l'historique des actions et les chiffres d'impact.

-- ---------------------------------------------------------------------
-- Cibles retirées
-- ---------------------------------------------------------------------
alter table public.cibles
  add column if not exists retiree_le timestamptz,
  add column if not exists retiree_par uuid references public.membres (id) on delete set null;
create index if not exists cibles_retirees on public.cibles (retiree_le) where retiree_le is not null;

-- Retirer ou réintégrer : droit « Modifier et supprimer toutes les cibles ».
create or replace function public.verifier_retrait_cible() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.retiree_le is distinct from old.retiree_le then
    if auth.uid() is not null and not public.a_permission('cibles.gerer') then
      raise exception 'Il faut le droit « Modifier et supprimer toutes les cibles » pour retirer une cible' using errcode = '42501';
    end if;
    new.retiree_par := case when new.retiree_le is null then null else public.mon_membre_id() end;
  elsif new.retiree_par is distinct from old.retiree_par then
    new.retiree_par := old.retiree_par;
  end if;
  return new;
end $$;
drop trigger if exists cibles_retrait on public.cibles;
create trigger cibles_retrait before update of retiree_le, retiree_par on public.cibles
  for each row execute function public.verifier_retrait_cible();

-- Une cible qui a bénéficié d'une action ne se supprime pas : on la retire.
create or replace function public.empecher_suppression_cible() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('ap2a.purge_demo', true), '') <> 'on'
     and exists (select 1 from public.beneficiaires b where b.cible_id = old.id) then
    raise exception 'Cette cible a bénéficié d''au moins une action : elle ne peut pas être supprimée. Retirez-la plutôt de la liste.'
      using errcode = '23514';
  end if;
  return old;
end $$;
drop trigger if exists cibles_suppression on public.cibles;
create trigger cibles_suppression before delete on public.cibles
  for each row execute function public.empecher_suppression_cible();

-- ---------------------------------------------------------------------
-- Actions non réalisées
-- ---------------------------------------------------------------------

-- Quelque chose a eu lieu : un apport remis ou une présence pointée.
create or replace function public.action_realisee(p_action uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.apports x join public.beneficiaires b on b.id = x.beneficiaire_id where b.action_id = p_action)
      or exists (select 1 from public.presences p join public.seances s on s.id = p.seance_id where s.action_id = p_action and p.present)
$$;

create or replace function public.supprimer_action(p_action uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_statut statut_action;
begin
  select statut into v_statut from public.actions where id = p_action;
  if not found then
    raise exception 'Action introuvable' using errcode = 'P0002';
  end if;
  if not public.peut_gerer_action(p_action) then
    raise exception 'Vous ne gérez pas cette action' using errcode = '42501';
  end if;
  if v_statut not in ('preparation', 'annulee') then
    raise exception 'Seule une action en préparation ou annulée peut être supprimée. Une action en cours ou terminée fait partie de l''historique.'
      using errcode = '23514';
  end if;
  if public.action_realisee(p_action) then
    raise exception 'Cette action a déjà eu lieu en partie (apport remis ou présence pointée) : elle ne peut pas être supprimée. Annulez-la plutôt.'
      using errcode = '23514';
  end if;
  -- Ses listes (bénéficiaires, séances, équipe…) partent avec elle, même si elle est annulée.
  perform set_config('ap2a.purge_demo', 'on', true);
  delete from public.actions where id = p_action;
  perform set_config('ap2a.purge_demo', '', true);
end $$;
revoke all on function public.supprimer_action(uuid) from public, anon;
grant execute on function public.supprimer_action(uuid) to authenticated;
revoke all on function public.action_realisee(uuid) from public, anon;
grant execute on function public.action_realisee(uuid) to authenticated;

-- La suppression directe suit la même règle.
alter policy actions_suppr on public.actions
  using (public.peut_gerer_action(id) and statut in ('preparation', 'annulee') and not public.action_realisee(id));

-- ---------------------------------------------------------------------
-- Membres
-- ---------------------------------------------------------------------
create or replace function public.supprimer_membre(p_membre uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
begin
  if not public.a_permission('membres.supprimer') then
    raise exception 'Il faut le droit « Supprimer un membre »' using errcode = '42501';
  end if;
  if p_membre = public.mon_membre_id() then
    raise exception 'Vous ne pouvez pas supprimer votre propre fiche' using errcode = '42501';
  end if;
  if not exists (select 1 from public.membres where id = p_membre) then
    raise exception 'Membre introuvable' using errcode = 'P0002';
  end if;
  if not (public.droits_membre(p_membre) <@ public.droits_membre(public.mon_membre_id())) then
    raise exception 'Ce membre a des droits que vous n''avez pas : vous ne pouvez pas le supprimer' using errcode = '42501';
  end if;
  delete from public.membres where id = p_membre returning user_id into v_user;
  -- Son compte de connexion disparaît aussi : ses sessions ouvertes ne valent plus rien.
  if v_user is not null then
    delete from auth.users where id = v_user;
  end if;
end $$;
revoke all on function public.supprimer_membre(uuid) from public, anon;
grant execute on function public.supprimer_membre(uuid) to authenticated;
