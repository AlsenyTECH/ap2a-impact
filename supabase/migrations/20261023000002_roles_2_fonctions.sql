-- Rôles et droits, suite : chaque vérification porte sur un droit précis.
-- (Fonctions remplacées sur place : mêmes noms, mêmes paramètres.)

-- Voir les cibles, gérer une action, un événement, faire un suivi.
create or replace function public.voit_cibles() returns boolean
language sql stable set search_path = public as $$ select public.a_permission('cibles.voir') $$;

create or replace function public.peut_gerer_action(p_action uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.a_permission('actions.gerer') or exists (
    select 1 from public.actions a
    where a.id = p_action
      and public.a_permission('actions.creer')
      and public.mon_membre_id() in (a.responsable_id, a.cree_par)
  )
$$;

create or replace function public.peut_gerer_evenement(p_evenement uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.a_permission('evenements.gerer') or exists (
    select 1 from public.evenements e
    where e.id = p_evenement and public.a_permission('evenements.creer') and e.cree_par = public.mon_membre_id())
$$;

create or replace function public.peut_suivre(p_beneficiaire uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.beneficiaires b
    join public.actions a on a.id = b.action_id
    join public.cibles c on c.id = b.cible_id
    where b.id = p_beneficiaire
      and (public.peut_gerer_action(b.action_id)
           or (public.a_permission('suivis.faire') and public.mon_membre_id() = coalesce(c.referent_id, a.responsable_id)))
  )
$$;

-- Photos et cartes des membres : la personne elle-même, ou qui gère les membres.
create or replace function public.change_photo(chemin text) returns boolean
language sql stable security definer set search_path = public as $$
  select case split_part(chemin, '/', 1)
    when 'membres' then public.a_permission('membres.gerer') or public.id_de_photo(chemin) = public.mon_membre_id()
    when 'cibles' then public.voit_cibles() and public.id_de_photo(chemin) is not null
    else false end
$$;

create or replace function public.definir_photo_membre(p_membre uuid, p_chemin text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.a_permission('membres.gerer') or p_membre = public.mon_membre_id()) then
    raise exception 'Il faut le droit « Gérer les membres » pour changer la photo d''un autre membre' using errcode = '42501';
  end if;
  update public.membres set photo_chemin = p_chemin where id = p_membre;
end;
$$;

create or replace function public.emettre_carte(p_membre uuid default null, p_cible uuid default null)
returns public.cartes language plpgsql security definer set search_path = public as $$
declare
  carte public.cartes;
begin
  if num_nonnulls(p_membre, p_cible) <> 1 then
    raise exception 'Indiquez un membre ou une cible';
  end if;
  if p_membre is not null then
    if not (public.a_permission('membres.gerer') or p_membre = public.mon_membre_id()) then
      raise exception 'Il faut le droit « Gérer les membres » pour émettre la carte d''un autre membre' using errcode = '42501';
    end if;
    update public.cartes set revoquee_le = now() where membre_id = p_membre and revoquee_le is null;
  else
    if not public.voit_cibles() then
      raise exception 'Accès refusé' using errcode = '42501';
    end if;
    if not exists (select 1 from public.cibles where id = p_cible and type = 'personne') then
      raise exception 'Les cartes sont réservées aux personnes' using errcode = '23514';
    end if;
    update public.cibles set numero_beneficiaire = 'B-' || lpad(nextval('public.numeros_beneficiaires')::text, 5, '0')
      where id = p_cible and numero_beneficiaire is null;
    update public.cartes set revoquee_le = now() where cible_id = p_cible and revoquee_le is null;
  end if;
  insert into public.cartes (membre_id, cible_id) values (p_membre, p_cible) returning * into carte;
  return carte;
end;
$$;

create or replace function public.revoquer_carte(p_carte uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  carte public.cartes;
begin
  select * into carte from public.cartes where id = p_carte;
  if carte.id is null then raise exception 'Carte inconnue'; end if;
  if not ((carte.membre_id is not null and public.a_permission('membres.gerer'))
          or (carte.cible_id is not null and public.voit_cibles())) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  update public.cartes set revoquee_le = now() where id = p_carte and revoquee_le is null;
end;
$$;

-- Rappels à envoyer aux bénéficiaires : tous pour qui voit les rappels.
create or replace function public.rappels_cibles_a_envoyer(p_jour date default current_date)
returns setof public.rappel_cible language sql stable security definer set search_path = public as $$
  select x.* from public.calcul_rappels_cibles(p_jour) x
  where (select cibles_actif from public.reglages_rappels)
    and (public.a_permission('rappels.voir')
      or (x.action_id is not null and (public.dans_equipe(x.action_id) or public.peut_gerer_action(x.action_id)))
      or (x.evenement_id is not null and public.peut_gerer_evenement(x.evenement_id)))
  order by x.quand, x.heure nulls last, x.titre, x.nom
$$;

-- Rouvrir une action ou un événement clôturé.
create or replace function public.verrou_action_cloturee() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.statut not in ('terminee', 'annulee') or auth.uid() is null
     or coalesce(current_setting('ap2a.purge_demo', true), '') = 'on' then
    return new;
  end if;
  if new.statut is distinct from old.statut then
    if not public.a_permission('actions.rouvrir') then
      raise exception 'Il faut le droit « Rouvrir une action clôturée »' using errcode = '42501';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - 'bilan' - 'modifie_le') is distinct from (to_jsonb(old) - 'bilan' - 'modifie_le') then
    raise exception 'Action clôturée : seul le bilan peut encore être complété' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.verrou_evenement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Tâches automatiques (sans utilisateur) et purge de la démonstration : pas de verrou.
  if auth.uid() is null or coalesce(current_setting('ap2a.purge_demo', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if old.cloture_le is not null and not public.a_permission('evenements.rouvrir') then
      raise exception 'Événement clôturé : il faut le droit « Rouvrir ou supprimer un événement clôturé »' using errcode = '42501';
    end if;
    return old;
  end if;
  if old.cloture_le is null then
    if new.cloture_le is not null then
      new.cloture_par := public.mon_membre_id();
    end if;
    return new;
  end if;
  if new.cloture_le is null then
    if not public.a_permission('evenements.rouvrir') then
      raise exception 'Il faut le droit « Rouvrir ou supprimer un événement clôturé »' using errcode = '42501';
    end if;
    new.cloture_par := null;
    return new;
  end if;
  if (to_jsonb(new) - 'compte_rendu') is distinct from (to_jsonb(old) - 'compte_rendu') then
    raise exception 'Événement clôturé : seul le compte rendu peut encore être complété' using errcode = '42501';
  end if;
  return new;
end $$;

-- Rôle d'un membre : l'ancien champ « role » et le nouveau « role_id » restent
-- d'accord ; seul qui gère les rôles en change, jamais le sien, et sans donner
-- plus de droits qu'il n'en a.
create or replace function public.verifier_changement_role() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_mes text[];
  v_cible text[];
  v_avant text[];
begin
  if tg_op = 'INSERT' then
    if new.role_id is null then new.role_id := (select id from public.roles where code = new.role::text); end if;
  elsif new.role_id is distinct from old.role_id then
    null;
  elsif new.role is distinct from old.role then
    new.role_id := (select id from public.roles where code = new.role::text);
  end if;
  new.role := coalesce((select case when r.code in ('admin', 'bureau', 'coordinateur', 'membre') then r.code::public.role_membre end
                        from public.roles r where r.id = new.role_id), 'membre');

  if auth.uid() is null then
    return new;
  end if;
  v_mes := public.mes_permissions();
  select case when code = 'admin' then array(select code from public.permissions) else permissions end
    into v_cible from public.roles where id = new.role_id;
  if tg_op = 'INSERT' and new.role_id is distinct from (select id from public.roles where code = 'membre') then
    if not public.a_permission('roles.gerer') then
      raise exception 'Il faut le droit « Gérer les rôles » pour attribuer ce rôle' using errcode = '42501';
    end if;
    if not (v_cible <@ v_mes) then
      raise exception 'Vous ne pouvez pas attribuer un rôle qui a plus de droits que vous' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.role_id is distinct from old.role_id then
    if not public.a_permission('roles.gerer') then
      raise exception 'Il faut le droit « Gérer les rôles » pour changer un rôle' using errcode = '42501';
    end if;
    if old.user_id = auth.uid() then
      raise exception 'Vous ne pouvez pas changer votre propre rôle' using errcode = '42501';
    end if;
    select case when code = 'admin' then array(select code from public.permissions) else permissions end
      into v_avant from public.roles where id = old.role_id;
    if not (v_cible <@ v_mes) or not (v_avant <@ v_mes) then
      raise exception 'Vous ne pouvez pas changer le rôle de quelqu''un qui a (ou aurait) plus de droits que vous' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id and not public.a_permission('membres.comptes') then
    raise exception 'Il faut le droit « Gérer les comptes de connexion » pour relier un compte à une fiche' using errcode = '42501';
  end if;
  -- Il doit rester quelqu'un pour gérer les rôles.
  if tg_op = 'UPDATE' and public.membre_a_permission(old.id, 'roles.gerer')
     and (not new.actif or not ('roles.gerer' = any(v_cible)))
     and not public.reste_gestionnaire_roles(old.id, null) then
    raise exception 'Plus personne ne pourrait gérer les rôles' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.garder_gestionnaire_roles() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.membre_a_permission(old.id, 'roles.gerer')
     and not public.reste_gestionnaire_roles(old.id, null) then
    raise exception 'Plus personne ne pourrait gérer les rôles' using errcode = '42501';
  end if;
  return old;
end $$;
create trigger membres_garder_roles before delete on public.membres
  for each row execute function public.garder_gestionnaire_roles();

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
      where m.actif and m.email is not null and m.email <> ''
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
      where m.actif and m.email is not null and m.email <> ''
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

create or replace function public.verifier_carte(p_jeton text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when c.membre_id is not null then jsonb_build_object(
        'statut', case when c.revoquee_le is not null then 'revoquee' when not m.actif then 'inactive' else 'valide' end,
        'type', 'membre', 'prenom', m.prenom, 'nom', m.nom, 'numero', m.numero_adherent, 'role', m.role, 'role_nom', (select r.nom from public.roles r where r.id = m.role_id),
        'depuis', m.date_adhesion, 'emise_le', c.emise_le, 'revoquee_le', c.revoquee_le)
      else jsonb_build_object(
        'statut', case when c.revoquee_le is not null then 'revoquee' else 'valide' end,
        'type', 'beneficiaire', 'prenom', k.prenom, 'nom', left(coalesce(k.nom, ''), 1) || '.', 'numero', k.numero_beneficiaire,
        'emise_le', c.emise_le, 'revoquee_le', c.revoquee_le)
      end
    from public.cartes c
    left join public.membres m on m.id = c.membre_id
    left join public.cibles k on k.id = c.cible_id
    where c.jeton = p_jeton
  ), jsonb_build_object('statut', 'inconnue'))
$$;
