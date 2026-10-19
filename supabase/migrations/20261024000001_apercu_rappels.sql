-- Aperçu des rappels dans l'application (sans email) : ce que la personne
-- connectée recevrait, pour les séances d'un jour ou ses suivis de la semaine.
create or replace function public.mon_apercu_rappels(p_type text, p_jour date default current_date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_moi uuid := public.mon_membre_id();
begin
  if v_moi is null then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if p_type not in ('hebdo', 'seances') then
    raise exception 'Type de rappel inconnu' using errcode = '22023';
  end if;
  return coalesce(public.donnees_rappels_jour(p_type, v_moi, coalesce(p_jour, current_date)) -> 0, '{}'::jsonb);
end $$;
revoke all on function public.mon_apercu_rappels(text, date) from public, anon;
grant execute on function public.mon_apercu_rappels(text, date) to authenticated;

-- L'aperçu fonctionne aussi pour un membre sans adresse email.
create or replace function public.donnees_rappels_jour(p_type text, p_membre uuid, p_jour date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  resultat jsonb;
  r public.reglages_rappels;
  v_jour date := coalesce(p_jour, current_date);
begin
  select * into r from public.reglages_rappels;
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
      where s.fait_le is null and s.date_prevue <= current_date + r.fenetre_jours
        and b.statut <> 'abandon'
    ),
    graves as (
      select jsonb_agg(f.ligne || jsonb_build_object('charge', coalesce(m.prenom || ' ' || m.nom || ' (' || m.numero_adherent || ')', 'Personne'))
                       order by f.date_prevue) as liste
      from a_faire f left join membres m on m.id = f.charge_id
      where f.date_prevue < current_date - r.seuil_retard
    )
    select coalesce(jsonb_agg(x), '[]'::jsonb) into resultat from (
      select m.id as membre_id, m.prenom, m.email, r.seuil_retard as seuil, r.fenetre_jours as fenetre,
             coalesce((select jsonb_agg(f.ligne order by f.date_prevue) from a_faire f where f.charge_id = m.id), '[]'::jsonb) as suivis,
             case when public.membre_a_permission(m.id, 'impact.voir') then coalesce((select liste from graves), '[]'::jsonb) else '[]'::jsonb end as retards
      from membres m
      where m.actif and (m.email is not null and m.email <> '' or p_membre is not null)
        and (p_membre is not null and m.id = p_membre or p_membre is null and m.rappels_email)
        and not exists (select 1 from donnees_demo dd where dd.nom_table = 'membres' and dd.id = m.id::text)
    ) x
    where p_membre is not null or jsonb_array_length(x.suivis) > 0 or jsonb_array_length(x.retards) > 0;
  elsif p_type = 'seances' then
    with du_jour as (
      select s.*, a.titre, a.responsable_id,
             (select count(*) from beneficiaires b where b.action_id = a.id and b.statut <> 'abandon') as inscrits,
             (select count(*) from seances s2 where s2.action_id = a.id and (s2.date, s2.heure_debut) <= (s.date, s.heure_debut)) as numero
      from seances s join actions a on a.id = s.action_id
      where s.date = v_jour and a.statut not in ('terminee', 'annulee')
    ),
    destinataires as (
      select responsable_id as membre_id, d.id as seance_id from du_jour d where responsable_id is not null
      union
      select e.membre_id, d.id from du_jour d join action_equipe e on e.action_id = d.action_id
    )
    select coalesce(jsonb_agg(x), '[]'::jsonb) into resultat from (
      select m.id as membre_id, m.prenom, m.email, v_jour as jour,
             jsonb_agg(jsonb_build_object('action_id', d.action_id, 'action', d.titre, 'numero', d.numero, 'theme', d.theme,
                                          'heure_debut', d.heure_debut, 'heure_fin', d.heure_fin, 'lieu', d.lieu, 'inscrits', d.inscrits)
                       order by d.heure_debut) as seances
      from destinataires r2
      join du_jour d on d.id = r2.seance_id
      join membres m on m.id = r2.membre_id
      where m.actif and (m.email is not null and m.email <> '' or p_membre is not null)
        and (p_membre is not null and m.id = p_membre or p_membre is null and m.rappels_email)
        and not exists (select 1 from donnees_demo dd where dd.nom_table = 'membres' and dd.id = m.id::text)
      group by m.id, m.prenom, m.email
    ) x;
  else
    raise exception 'Type de rappel inconnu : %', p_type;
  end if;
  return resultat;
end;
$$;
