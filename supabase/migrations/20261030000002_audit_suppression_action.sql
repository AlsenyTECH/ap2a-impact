-- Audit M3 : la suppression d'une action non réalisée lève le verrou des
-- listes, mais ne coupe plus le journal (drapeau distinct de la purge des
-- données de démonstration). Chaque ligne effacée y est notée.
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
    raise exception 'Cette action a déjà eu lieu en partie (apport, présence, consultation ou suivi) : elle ne peut pas être supprimée. Annulez-la plutôt.'
      using errcode = '23514';
  end if;
  perform set_config('ap2a.suppression_action', 'on', true);
  delete from public.actions where id = p_action;
  perform set_config('ap2a.suppression_action', '', true);
end $$;
revoke all on function public.supprimer_action(uuid) from public, anon;
grant execute on function public.supprimer_action(uuid) to authenticated;

-- Analyseur Supabase : l'extension pg_net ne doit pas être dans « public ».
-- (Ses fonctions restent dans le schéma « net » : les rappels planifiés
-- continuent de fonctionner.)
do $$
begin
  if exists (select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
             where e.extname = 'pg_net' and n.nspname = 'public') then
    begin
      drop extension pg_net;
      create extension pg_net with schema extensions;
    exception when others then
      raise notice 'pg_net laissé en place (dépendances) : %', sqlerrm;
    end;
  end if;
end $$;
