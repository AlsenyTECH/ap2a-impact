-- =====================================================================
-- Version 2 : suivi de l'impact.
--
-- Quand une action est clôturée, des SUIVIS sont planifiés pour chaque
-- bénéficiaire (3, 6 et 12 mois après la fin, selon le type d'action).
-- Le référent de la cible (à défaut le responsable de l'action) voit ses
-- suivis à faire, contacte la personne et renseigne en une minute ce
-- qu'elle est devenue. Un suivi peut aussi être ajouté à tout moment.
-- =====================================================================

create type situation_suivi as enum ('reussi', 'en_progres', 'en_difficulte', 'perdu_de_vue');

create table public.suivis (
  id uuid primary key default gen_random_uuid(),
  beneficiaire_id uuid not null references public.beneficiaires (id) on delete cascade,
  -- Échéance planifiée (3, 6, 12 mois...) ; null pour un suivi spontané.
  echeance_mois int check (echeance_mois > 0),
  date_prevue date not null default current_date,
  -- Renseigné quand le suivi est fait.
  fait_le date,
  situation situation_suivi,
  activite text,                                   -- "électricien à son compte", "employé chez..."
  revenu_mensuel_fcfa bigint check (revenu_mensuel_fcfa >= 0),
  emplois_crees int check (emplois_crees >= 0),    -- apprentis, employés
  utilise_apport boolean,                          -- le kit / matériel sert-il encore ?
  commentaire text,
  fichier_chemin text,                             -- photo (atelier, chantier...)
  saisi_par uuid references public.membres (id) on delete set null default public.mon_membre_id(),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (beneficiaire_id, echeance_mois),
  constraint suivi_fait_complet check (fait_le is null or situation is not null)
);
create index suivis_a_faire on public.suivis (date_prevue) where fait_le is null;
create index suivis_beneficiaire on public.suivis (beneficiaire_id);
create trigger suivis_modifie before update on public.suivis
  for each row execute function public.toucher_modifie_le();

-- ---------------------------------------------------------------------
-- Planification automatique
-- ---------------------------------------------------------------------

-- Planifie (ou recale) les suivis d'une action terminée. Les suivis déjà
-- faits ne sont jamais modifiés.
create function public.planifier_suivis(p_action uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.suivis (beneficiaire_id, echeance_mois, date_prevue, saisi_par)
  select b.id, m, (coalesce(a.date_fin, a.date_debut) + make_interval(months => m))::date, null
  from public.actions a
  join public.types_action t on t.id = a.type_id
  join public.beneficiaires b on b.action_id = a.id and b.statut <> 'abandon'
  cross join unnest(t.suivis_mois) m
  where a.id = p_action and a.statut = 'terminee'
  on conflict (beneficiaire_id, echeance_mois) do update
    set date_prevue = excluded.date_prevue
    where suivis.fait_le is null;
end $$;

create function public.apres_maj_action() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.statut = 'terminee' and (old.statut is distinct from 'terminee' or old.date_fin is distinct from new.date_fin) then
    perform public.planifier_suivis(new.id);
  end if;
  return null;
end $$;
create trigger actions_planifier after update on public.actions
  for each row execute function public.apres_maj_action();

-- Bénéficiaire ajouté à une action déjà terminée, ou qui abandonne.
create function public.apres_maj_beneficiaire() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.statut = 'abandon' then
    delete from public.suivis where beneficiaire_id = new.id and fait_le is null and echeance_mois is not null;
  elsif tg_op = 'INSERT' or old.statut = 'abandon' then
    perform public.planifier_suivis(new.action_id);
  end if;
  return null;
end $$;
create trigger beneficiaires_planifier after insert or update of statut on public.beneficiaires
  for each row execute function public.apres_maj_beneficiaire();

-- ---------------------------------------------------------------------
-- Vue de travail : chaque suivi avec la personne à joindre et le
-- membre chargé du suivi (référent de la cible, sinon responsable de
-- l'action). security_invoker : les règles d'accès des tables s'appliquent.
-- ---------------------------------------------------------------------
create view public.suivis_detail with (security_invoker = true) as
select
  s.*,
  b.action_id,
  b.cible_id,
  a.titre as action_titre,
  a.type_id,
  c.type as cible_type,
  c.prenom as cible_prenom,
  c.nom as cible_nom,
  c.telephone as cible_telephone,
  coalesce(c.referent_id, a.responsable_id) as charge_id
from public.suivis s
join public.beneficiaires b on b.id = s.beneficiaire_id
join public.actions a on a.id = b.action_id
join public.cibles c on c.id = b.cible_id;

-- Peut renseigner un suivi : gère l'action, ou est chargé du suivi.
create function public.peut_suivre(p_beneficiaire uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.beneficiaires b
    join public.actions a on a.id = b.action_id
    join public.cibles c on c.id = b.cible_id
    where b.id = p_beneficiaire
      and (public.peut_gerer_action(b.action_id)
           or (public.a_role('coordinateur') and public.mon_membre_id() = coalesce(c.referent_id, a.responsable_id)))
  )
$$;

alter table public.suivis enable row level security;
create policy suivis_lecture on public.suivis for select to authenticated
  using (exists (
    select 1 from public.beneficiaires b
    where b.id = suivis.beneficiaire_id and (public.voit_cibles() or public.dans_equipe(b.action_id))
  ));
create policy suivis_ajout on public.suivis for insert to authenticated
  with check (public.peut_suivre(beneficiaire_id));
create policy suivis_modif on public.suivis for update to authenticated
  using (public.peut_suivre(beneficiaire_id)) with check (public.peut_suivre(beneficiaire_id));
create policy suivis_suppr on public.suivis for delete to authenticated
  using (public.peut_gerer_action((select action_id from public.beneficiaires where id = beneficiaire_id)));

grant select, insert, update, delete on public.suivis to authenticated;
grant select on public.suivis_detail to authenticated;
revoke all on public.suivis, public.suivis_detail from anon;

revoke execute on function public.planifier_suivis(uuid), public.apres_maj_action(), public.apres_maj_beneficiaire()
  from public, anon, authenticated;
revoke execute on function public.peut_suivre(uuid) from public, anon;
grant execute on function public.peut_suivre(uuid) to authenticated;

-- Photos de suivi : même compartiment, chemin "<id bénéficiaire>/suivi-...".
-- Le chargé du suivi peut y déposer, en plus de ceux qui gèrent l'action.
create policy justificatifs_depot_suivi on storage.objects for insert to authenticated
  with check (bucket_id = 'justificatifs' and public.peut_suivre(public.beneficiaire_du_fichier(name)));

-- Actions déjà terminées avant cette version : on planifie aussi.
select public.planifier_suivis(id) from public.actions where statut = 'terminee';
