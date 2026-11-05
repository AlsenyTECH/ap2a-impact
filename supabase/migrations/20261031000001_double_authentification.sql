-- Double authentification (code à 6 chiffres d'une application d'authentification).
--
-- Un rôle peut l'exiger (administrateur et bureau au départ ; réglable dans la
-- page Rôles, jamais retirée à l'administrateur). Pour un membre de ce rôle, la
-- base ne reconnaît AUCUN de ses droits tant que sa session n'est pas passée
-- au niveau « aal2 » (mot de passe + code) : un mot de passe volé ne suffit plus.
-- Le niveau est porté par le jeton de session, signé par Supabase.

alter table public.roles add column if not exists mfa_obligatoire boolean not null default false;
update public.roles set mfa_obligatoire = true where code in ('admin', 'bureau');
alter table public.roles add constraint roles_admin_mfa check (code is distinct from 'admin' or mfa_obligatoire);

-- La session a-t-elle le niveau exigé par le rôle de la personne connectée ?
-- (Partenaires et personnes sans fiche : rien d'exigé ici.)
create or replace function public.double_auth_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select not r.mfa_obligatoire or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    from public.membres m join public.roles r on r.id = m.role_id
    where m.user_id = auth.uid() and m.actif), true)
$$;
revoke all on function public.double_auth_ok() from public, anon;
grant execute on function public.double_auth_ok() to authenticated;

create or replace function public.a_permission(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select (r.code = 'admin' or p = any(r.permissions))
       and (not r.mfa_obligatoire or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2')
    from public.membres m join public.roles r on r.id = m.role_id
    where m.user_id = auth.uid() and m.actif), false)
$$;

create or replace function public.mes_permissions() returns text[]
language sql stable security definer set search_path = public as $$
  select case when public.double_auth_ok() then coalesce(public.droits_membre(public.mon_membre_id()), '{}') else '{}' end
$$;

create or replace function public.a_role(variadic roles role_membre[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.mon_role() = any(roles), false) and public.double_auth_ok()
$$;

-- La fiche de la personne connectée dit si son rôle exige la double authentification.
create or replace function public.fiche_json(m public.membres) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(m) || jsonb_build_object('role_info',
    (select jsonb_build_object('id', r.id, 'code', r.code, 'nom', r.nom, 'permissions', r.permissions, 'mfa_obligatoire', r.mfa_obligatoire)
     from public.roles r where r.id = m.role_id))
$$;
revoke all on function public.fiche_json(public.membres) from public, anon, authenticated;
