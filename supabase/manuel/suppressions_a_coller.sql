-- À coller dans Supabase → SQL Editor, puis Run (une seule fois).
-- Installe la suppression des membres (avec leur compte de connexion) et la
-- suppression complète des actions annulées. Ce script ne supprime rien
-- lui-même : il crée deux fonctions, appelées ensuite par les boutons de
-- l'application. (Le reste de la migration 20261026000001 est déjà en place.)

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
