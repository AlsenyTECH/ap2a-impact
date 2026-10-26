-- Comptes protégés : ni supprimés ni désactivés depuis l'application.
-- La marque ne se pose ou ne se retire que depuis Supabase (SQL Editor).
alter table public.membres add column if not exists protege boolean not null default false;

create or replace function public.garder_membre_protege() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.protege then
      raise exception '% % est un compte protégé : il ne peut pas être supprimé', old.prenom, old.nom using errcode = '42501';
    end if;
    return old;
  end if;
  if auth.uid() is not null then
    if new.protege is distinct from old.protege then
      raise exception 'La protection d''un compte ne se change que depuis Supabase' using errcode = '42501';
    end if;
    if old.protege and not new.actif then
      raise exception '% % est un compte protégé : il ne peut pas être désactivé', old.prenom, old.nom using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger membres_proteges_suppression before delete on public.membres
  for each row execute function public.garder_membre_protege();
create trigger membres_proteges_modif before update of protege, actif on public.membres
  for each row execute function public.garder_membre_protege();

-- Les deux comptes fondateurs de l'application.
update public.membres set protege = true
  where lower(email) in ('mathsnexus2024@gmail.com', 'thdiakhate@gmail.com');
