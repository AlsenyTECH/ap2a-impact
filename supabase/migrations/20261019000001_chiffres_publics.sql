-- Chiffres publics de la page vitrine : uniquement des totaux anonymes,
-- sans les données de démonstration, lisibles sans compte.
create or replace function public.chiffres_publics()
returns jsonb language sql stable security definer set search_path = public as $$
  with actions_reelles as (
    select a.* from public.actions a
    where a.statut <> 'annulee'
      and not exists (select 1 from public.donnees_demo d where d.nom_table = 'actions' and d.id = a.id::text)
  ),
  benefs as (
    select b.*, k.type, k.sexe, extract(year from age(k.date_naissance))::int as age
    from public.beneficiaires b
    join actions_reelles a on a.id = b.action_id
    join public.cibles k on k.id = b.cible_id
    where not exists (select 1 from public.donnees_demo d where d.nom_table = 'cibles' and d.id = k.id::text)
  ),
  personnes as (select distinct on (cible_id) * from benefs where type = 'personne')
  select jsonb_build_object(
    'actions', (select count(*) from actions_reelles),
    'personnes', (select count(*) from personnes),
    'femmes', (select count(*) from personnes where sexe = 'F'),
    'jeunes', (select count(*) from personnes where age between 15 and 35),
    'collectifs', (select count(distinct cible_id) from benefs where type <> 'personne'),
    'certificats', (select count(*) from public.apports ap join benefs b on b.id = ap.beneficiaire_id where ap.nature = 'certificat'),
    'kits', (select count(*) from public.apports ap join benefs b on b.id = ap.beneficiaire_id where ap.nature = 'kit'),
    'valeur_remise', (select coalesce(sum(ap.valeur_fcfa), 0) from public.apports ap join benefs b on b.id = ap.beneficiaire_id),
    'seances', (select count(*) from public.seances s join actions_reelles a on a.id = s.action_id),
    'membres', (select count(*) from public.membres m where m.actif
                and not exists (select 1 from public.donnees_demo d where d.nom_table = 'membres' and d.id = m.id::text)),
    'partenaires', (select count(*) from public.partenaires p where p.actif
                and not exists (select 1 from public.donnees_demo d where d.nom_table = 'partenaires' and d.id = p.id::text))
  )
$$;
revoke all on function public.chiffres_publics() from public;
grant execute on function public.chiffres_publics() to anon, authenticated;
