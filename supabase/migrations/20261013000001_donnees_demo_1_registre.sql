-- =====================================================================
-- Données de démonstration : chaque ligne insérée par le script
-- supabase/demo/donnees_demo.sql est enregistrée ici, pour que
-- l'administrateur puisse tout effacer en un clic depuis l'application,
-- sans toucher aux données réelles.
-- =====================================================================

create table public.donnees_demo (
  nom_table text not null,
  id text not null,
  primary key (nom_table, id)
);
-- Aucun accès direct : seules les deux fonctions ci-dessous s'en servent.
alter table public.donnees_demo enable row level security;
revoke all on public.donnees_demo from anon, authenticated;

create function public.nb_donnees_demo() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.donnees_demo
$$;

revoke execute on function public.nb_donnees_demo() from public, anon;
grant execute on function public.nb_donnees_demo() to authenticated;
