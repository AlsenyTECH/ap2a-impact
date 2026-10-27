-- État de l'accès de chaque membre, pour le bureau :
--   'aucun'  : pas encore invité ;
--   'invite' : invité, mot de passe pas encore choisi ;
--   'actif'  : mot de passe choisi (ou compte ouvert avant les invitations).
create or replace function public.etats_acces() returns table (membre_id uuid, etat text)
language sql stable security definer set search_path = public, auth as $$
  select m.id,
         case when m.user_id is null then 'aucun'
              when coalesce((u.raw_user_meta_data ->> 'mdp_choisi')::boolean, false)
                   or (u.invited_at is null and u.last_sign_in_at is not null) then 'actif'
              else 'invite' end
  from public.membres m
  left join auth.users u on u.id = m.user_id
  where public.a_permission('membres.gerer')
$$;
revoke all on function public.etats_acces() from public, anon;
grant execute on function public.etats_acces() to authenticated;
