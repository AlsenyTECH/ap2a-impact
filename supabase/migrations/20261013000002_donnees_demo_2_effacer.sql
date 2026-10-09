-- =====================================================================
-- Effacement des données de démonstration (bouton sur l'Accueil, réservé
-- à l'administrateur).
--
-- En production, ce fichier est à coller une fois dans Supabase > SQL
-- Editor : l'outil de migration demande une confirmation humaine pour
-- tout ce qui supprime des données, et cette fonction en supprime.
-- =====================================================================

create function public.supprimer_donnees_demo() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.a_role('admin') then
    raise exception 'Réservé à l''administrateur' using errcode = '42501';
  end if;
  -- Une cible ou un partenaire de démonstration ajouté depuis à une
  -- action réelle en est d'abord retiré.
  delete from public.beneficiaires
    where cible_id::text in (select id from public.donnees_demo where nom_table = 'cibles');
  delete from public.action_partenaires
    where partenaire_id::text in (select id from public.donnees_demo where nom_table = 'partenaires');
  delete from public.actions where id::text in (select id from public.donnees_demo where nom_table = 'actions');
  delete from public.cibles where id::text in (select id from public.donnees_demo where nom_table = 'cibles');
  delete from public.partenaires where id::text in (select id from public.donnees_demo where nom_table = 'partenaires');
  delete from public.membres where id::text in (select id from public.donnees_demo where nom_table = 'membres');
  delete from public.donnees_demo;
end $$;

revoke execute on function public.supprimer_donnees_demo() from public, anon;
grant execute on function public.supprimer_donnees_demo() to authenticated;
