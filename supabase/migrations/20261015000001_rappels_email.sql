-- Rappels automatiques par email
--  * chaque lundi : les suivis à faire de chaque membre (+ retards graves pour les gestionnaires)
--  * chaque matin : les séances du jour pour le responsable et l'équipe
-- L'envoi est fait par la fonction Edge « rappels », appelée par pg_cron.

alter table public.membres add column if not exists rappels_email boolean not null default true;

-- Un membre règle lui-même ses rappels (la modification des fiches reste réservée aux gestionnaires).
create or replace function public.regler_rappels(p_actif boolean)
returns void language sql security definer set search_path = public as $$
  update public.membres set rappels_email = p_actif where id = public.mon_membre_id();
$$;
revoke all on function public.regler_rappels(boolean) from public, anon;
grant execute on function public.regler_rappels(boolean) to authenticated;

-- Journal des envois.
create table if not exists public.rappels_envoyes (
  id bigint generated always as identity primary key,
  envoye_le timestamptz not null default now(),
  type text not null,
  membre_id uuid references public.membres(id) on delete set null,
  email text,
  nb integer not null default 0,
  statut text not null,
  erreur text
);
alter table public.rappels_envoyes enable row level security;
create policy rappels_lecture on public.rappels_envoyes for select to authenticated
  using (public.est_gestionnaire() or membre_id = public.mon_membre_id());

-- Contenu des rappels, par membre. Réservé au service (fonction Edge).
create or replace function public.donnees_rappels(p_type text, p_membre uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  resultat jsonb;
begin
  if p_type = 'hebdo' then
    with a_faire as (
      select coalesce(c.referent_id, a.responsable_id) as charge_id,
             jsonb_build_object(
               'cible_id', c.id, 'nom', trim(concat_ws(' ', c.prenom, c.nom)), 'telephone', c.telephone,
               'action', a.titre, 'echeance', s.echeance_mois, 'date_prevue', s.date_prevue,
               'retard', current_date - s.date_prevue) as ligne,
             s.date_prevue
      from suivis s
      join beneficiaires b on b.id = s.beneficiaire_id
      join actions a on a.id = b.action_id
      join cibles c on c.id = b.cible_id
      where s.fait_le is null and s.date_prevue <= current_date + 7
        and b.statut <> 'abandon'
    ),
    graves as (
      select jsonb_agg(f.ligne || jsonb_build_object('charge', coalesce(m.prenom || ' ' || m.nom || ' (' || m.numero_adherent || ')', 'Personne'))
                       order by f.date_prevue) as liste
      from a_faire f left join membres m on m.id = f.charge_id
      where f.date_prevue < current_date - 15
    )
    select coalesce(jsonb_agg(x), '[]'::jsonb) into resultat from (
      select m.id as membre_id, m.prenom, m.email,
             coalesce((select jsonb_agg(f.ligne order by f.date_prevue) from a_faire f where f.charge_id = m.id), '[]'::jsonb) as suivis,
             case when m.role in ('admin', 'bureau', 'coordinateur') then coalesce((select liste from graves), '[]'::jsonb) else '[]'::jsonb end as retards
      from membres m
      where m.actif and m.email is not null and m.email <> ''
        and (p_membre is not null and m.id = p_membre or p_membre is null and m.rappels_email)
    ) x
    where p_membre is not null or jsonb_array_length(x.suivis) > 0 or jsonb_array_length(x.retards) > 0;

  elsif p_type = 'seances' then
    with du_jour as (
      select s.*, a.titre, a.responsable_id,
             (select count(*) from beneficiaires b where b.action_id = a.id and b.statut <> 'abandon') as inscrits,
             (select count(*) from seances s2 where s2.action_id = a.id and (s2.date, s2.heure_debut) <= (s.date, s.heure_debut)) as numero
      from seances s join actions a on a.id = s.action_id
      where s.date = current_date and a.statut not in ('terminee', 'annulee')
    ),
    destinataires as (
      select responsable_id as membre_id, d.id as seance_id from du_jour d where responsable_id is not null
      union
      select e.membre_id, d.id from du_jour d join action_equipe e on e.action_id = d.action_id
    )
    select coalesce(jsonb_agg(x), '[]'::jsonb) into resultat from (
      select m.id as membre_id, m.prenom, m.email,
             jsonb_agg(jsonb_build_object('action_id', d.action_id, 'action', d.titre, 'numero', d.numero, 'theme', d.theme,
                                          'heure_debut', d.heure_debut, 'heure_fin', d.heure_fin, 'lieu', d.lieu, 'inscrits', d.inscrits)
                       order by d.heure_debut) as seances
      from destinataires r
      join du_jour d on d.id = r.seance_id
      join membres m on m.id = r.membre_id
      where m.actif and m.email is not null and m.email <> ''
        and (p_membre is not null and m.id = p_membre or p_membre is null and m.rappels_email)
      group by m.id, m.prenom, m.email
    ) x;
  else
    raise exception 'Type de rappel inconnu : %', p_type;
  end if;
  return resultat;
end;
$$;
revoke all on function public.donnees_rappels(text, uuid) from public, anon, authenticated;
grant execute on function public.donnees_rappels(text, uuid) to service_role;
