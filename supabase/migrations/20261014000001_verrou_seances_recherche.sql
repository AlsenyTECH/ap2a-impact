-- =====================================================================
-- Transparence et organisation :
--   1. une action clôturée (terminée ou annulée) est figée ;
--   2. un journal garde la trace des modifications sensibles ;
--   3. une action peut avoir plusieurs séances, avec les présences ;
--   4. chaque cible connaît ses groupes, pour la recherche et les tris.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Séances d'une action (une formation sur plusieurs jours) et présences
-- ---------------------------------------------------------------------
create table public.seances (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.actions (id) on delete cascade,
  date date not null,
  heure_debut time,
  heure_fin time,
  theme text,
  lieu text,
  notes text,
  cree_le timestamptz not null default now(),
  check (heure_debut is null or heure_fin is null or heure_fin > heure_debut)
);
create index seances_action on public.seances (action_id, date);

create table public.presences (
  seance_id uuid not null references public.seances (id) on delete cascade,
  beneficiaire_id uuid not null references public.beneficiaires (id) on delete cascade,
  present boolean not null default true,
  note text,
  primary key (seance_id, beneficiaire_id)
);
create index presences_beneficiaire on public.presences (beneficiaire_id);

-- ---------------------------------------------------------------------
-- 1. Verrouillage des actions clôturées
-- ---------------------------------------------------------------------

-- Action concernée par une ligne d'une table liée.
create function public.action_de_ligne(p_table text, p_ligne jsonb) returns uuid
language sql stable security definer set search_path = public as $$
  select case p_table
    when 'apports' then (select action_id from public.beneficiaires where id = (p_ligne->>'beneficiaire_id')::uuid)
    when 'presences' then (select action_id from public.seances where id = (p_ligne->>'seance_id')::uuid)
    when 'actions' then (p_ligne->>'id')::uuid
    else (p_ligne->>'action_id')::uuid
  end
$$;

-- Bénéficiaires, apports, équipe, partenaires, séances et présences d'une
-- action clôturée ne peuvent plus être ajoutés, modifiés ni retirés.
-- (Seul l'effacement des données de démonstration lève ce verrou.)
create function public.verrou_action() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ligne jsonb := to_jsonb(coalesce(new, old));
  v_statut statut_action;
begin
  if coalesce(current_setting('ap2a.purge_demo', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  select statut into v_statut from public.actions where id = public.action_de_ligne(tg_table_name, v_ligne);
  if v_statut in ('terminee', 'annulee') then
    raise exception 'Action clôturée : sa liste, ce qui a été remis, son équipe et ses séances ne peuvent plus être modifiés. Un administrateur peut la rouvrir.'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

-- Sur l'action elle-même : une fois clôturée, seul le bilan peut encore
-- être complété ; seul un administrateur peut la rouvrir.
create function public.verrou_action_cloturee() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.statut not in ('terminee', 'annulee') or auth.uid() is null
     or coalesce(current_setting('ap2a.purge_demo', true), '') = 'on' then
    return new;
  end if;
  if new.statut is distinct from old.statut then
    if not public.a_role('admin') then
      raise exception 'Seul un administrateur peut rouvrir une action clôturée' using errcode = '42501';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - 'bilan' - 'modifie_le') is distinct from (to_jsonb(old) - 'bilan' - 'modifie_le') then
    raise exception 'Action clôturée : seul le bilan peut encore être complété' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger actions_verrou before update on public.actions
  for each row execute function public.verrou_action_cloturee();

create trigger beneficiaires_verrou before insert or update or delete on public.beneficiaires
  for each row execute function public.verrou_action();
create trigger apports_verrou before insert or update or delete on public.apports
  for each row execute function public.verrou_action();
create trigger equipe_verrou before insert or update or delete on public.action_equipe
  for each row execute function public.verrou_action();
create trigger partenaires_action_verrou before insert or update or delete on public.action_partenaires
  for each row execute function public.verrou_action();

-- ---------------------------------------------------------------------
-- 3. Séances et présences
-- ---------------------------------------------------------------------

create trigger seances_verrou before insert or update or delete on public.seances
  for each row execute function public.verrou_action();
create trigger presences_verrou before insert or update or delete on public.presences
  for each row execute function public.verrou_action();

-- Peut faire l'appel : ceux qui gèrent l'action et son équipe de terrain.
create function public.peut_faire_appel(p_seance uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.seances s
    where s.id = p_seance and (public.peut_gerer_action(s.action_id) or public.dans_equipe(s.action_id))
  )
$$;

alter table public.seances enable row level security;
alter table public.presences enable row level security;
create policy seances_lecture on public.seances for select to authenticated using (public.mon_membre_id() is not null);
create policy seances_gestion on public.seances for all to authenticated
  using (public.peut_gerer_action(action_id)) with check (public.peut_gerer_action(action_id));
create policy presences_lecture on public.presences for select to authenticated
  using (exists (select 1 from public.seances s where s.id = presences.seance_id and (public.voit_cibles() or public.dans_equipe(s.action_id))));
create policy presences_gestion on public.presences for all to authenticated
  using (public.peut_faire_appel(seance_id)) with check (public.peut_faire_appel(seance_id));
grant select, insert, update, delete on public.seances, public.presences to authenticated;
revoke all on public.seances, public.presences from anon;

-- ---------------------------------------------------------------------
-- 2. Journal des modifications
-- ---------------------------------------------------------------------
create table public.journal (
  id bigserial primary key,
  quand timestamptz not null default now(),
  membre_id uuid references public.membres (id) on delete set null,
  table_nom text not null,
  operation text not null,
  ligne_id text,
  action_id uuid,
  libelle text,
  details jsonb
);
create index journal_action on public.journal (action_id, quand desc);
create index journal_quand on public.journal (quand desc);

-- Nom lisible de ce qui a changé, figé au moment de la modification.
create function public.libelle_ligne(p_table text, p_ligne jsonb) returns text
language sql stable security definer set search_path = public as $$
  select case p_table
    when 'actions' then p_ligne->>'titre'
    when 'cibles' then concat_ws(' ', p_ligne->>'prenom', p_ligne->>'nom')
    when 'beneficiaires' then (select concat_ws(' ', prenom, nom) from public.cibles where id = (p_ligne->>'cible_id')::uuid)
    when 'apports' then concat_ws(' — ', p_ligne->>'description',
      (select concat_ws(' ', c.prenom, c.nom) from public.beneficiaires b join public.cibles c on c.id = b.cible_id where b.id = (p_ligne->>'beneficiaire_id')::uuid))
    when 'action_equipe' then (select concat(prenom, ' ', nom, ' (', numero_adherent, ')') from public.membres where id = (p_ligne->>'membre_id')::uuid)
    when 'action_partenaires' then (select coalesce(sigle, nom) from public.partenaires where id = (p_ligne->>'partenaire_id')::uuid)
    when 'seances' then concat_ws(' — ', to_char((p_ligne->>'date')::date, 'DD/MM/YYYY'), p_ligne->>'theme')
    when 'membres' then concat(p_ligne->>'prenom', ' ', p_ligne->>'nom', ' (', p_ligne->>'numero_adherent', ')')
  end
$$;

create function public.journaliser() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ancien jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_nouveau jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_ligne jsonb := coalesce(v_nouveau, v_ancien);
  v_details jsonb;
  v_cle text;
begin
  if coalesce(current_setting('ap2a.purge_demo', true), '') = 'on' then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    -- Seuls les champs modifiés : { "statut": ["en_cours", "terminee"], ... }
    v_details := '{}';
    for v_cle in select jsonb_object_keys(v_nouveau) loop
      if v_cle not in ('modifie_le', 'telephone_normalise', 'recherche', 'groupes')
         and v_nouveau->v_cle is distinct from v_ancien->v_cle then
        v_details := v_details || jsonb_build_object(v_cle, jsonb_build_array(v_ancien->v_cle, v_nouveau->v_cle));
      end if;
    end loop;
    if v_details = '{}' then
      return null;
    end if;
  end if;
  insert into public.journal (membre_id, table_nom, operation, ligne_id, action_id, libelle, details)
  values (
    public.mon_membre_id(), tg_table_name, tg_op,
    coalesce(v_ligne->>'id', v_ligne->>'beneficiaire_id', v_ligne->>'membre_id', v_ligne->>'partenaire_id'),
    case when tg_table_name in ('cibles', 'membres') then null else public.action_de_ligne(tg_table_name, v_ligne) end,
    public.libelle_ligne(tg_table_name, v_ligne),
    v_details
  );
  return null;
end $$;

create trigger actions_journal after insert or update or delete on public.actions
  for each row execute function public.journaliser();
create trigger beneficiaires_journal after insert or update or delete on public.beneficiaires
  for each row execute function public.journaliser();
create trigger apports_journal after insert or update or delete on public.apports
  for each row execute function public.journaliser();
create trigger equipe_journal after insert or update or delete on public.action_equipe
  for each row execute function public.journaliser();
create trigger partenaires_action_journal after insert or update or delete on public.action_partenaires
  for each row execute function public.journaliser();
create trigger seances_journal after insert or update or delete on public.seances
  for each row execute function public.journaliser();
create trigger membres_journal after insert or update or delete on public.membres
  for each row execute function public.journaliser();

-- Lecture : le bureau voit tout ; un coordinateur, le journal des actions
-- qu'il gère. Personne ne peut écrire ni effacer le journal directement.
alter table public.journal enable row level security;
create policy journal_lecture on public.journal for select to authenticated
  using (public.est_gestionnaire() or (action_id is not null and public.peut_gerer_action(action_id)));
grant select on public.journal to authenticated;
revoke all on public.journal from anon;

-- ---------------------------------------------------------------------
-- 4. Groupes de chaque cible et texte de recherche
-- ---------------------------------------------------------------------
alter table public.cibles
  add column groupes text,
  add column recherche text;
create index cibles_recherche on public.cibles (recherche);

create or replace function public.preparer_cible() returns trigger
language plpgsql set search_path = public as $$
begin
  new.type := (select nature from public.categories_cible where id = new.categorie_id);
  new.telephone_normalise := nullif(public.normaliser_telephone(new.telephone), '');
  if new.type <> 'personne' then
    new.prenom := null; new.sexe := null; new.date_naissance := null;
    new.situation_id := null; new.vulnerabilites := '{}'; new.metier := null;
  end if;
  if new.situation_id is not null
     and not exists (select 1 from public.profils_personne where id = new.situation_id and genre = 'situation') then
    raise exception 'Situation inconnue' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(new.vulnerabilites) v
             where not exists (select 1 from public.profils_personne where id = v and genre = 'vulnerabilite')) then
    raise exception 'Vulnérabilité inconnue' using errcode = '23514';
  end if;
  -- Recherche sans accents ni majuscules : nom, prénom, téléphone, métier, groupes.
  new.recherche := lower(extensions.unaccent('extensions.unaccent'::regdictionary, concat_ws(' ', new.prenom, new.nom, new.telephone_normalise, new.metier, new.sous_type, new.groupes)));
  return new;
end $$;

-- Liste des groupes (ménage, GPF, ASC...) dont une personne est membre.
create function public.maj_groupes(p_personne uuid) returns void
language sql security definer set search_path = public as $$
  update public.cibles c set groupes = (
    select string_agg(k.nom, ', ' order by k.nom)
    from public.appartenances a join public.cibles k on k.id = a.collectif_id
    where a.personne_id = c.id
  ) where c.id = p_personne
$$;

create function public.apres_appartenance() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' then perform public.maj_groupes(old.personne_id); end if;
  if tg_op <> 'DELETE' then perform public.maj_groupes(new.personne_id); end if;
  return null;
end $$;
create trigger appartenances_groupes after insert or update or delete on public.appartenances
  for each row execute function public.apres_appartenance();

-- Un groupe renommé : ses membres sont mis à jour.
create function public.apres_renommage_groupe() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.maj_groupes(a.personne_id) from public.appartenances a where a.collectif_id = new.id;
  return null;
end $$;
create trigger cibles_renommage after update of nom on public.cibles
  for each row when (new.type <> 'personne' and new.nom is distinct from old.nom)
  execute function public.apres_renommage_groupe();

-- Remplissage pour les cibles existantes.
update public.cibles c set groupes = (
  select string_agg(k.nom, ', ' order by k.nom)
  from public.appartenances a join public.cibles k on k.id = a.collectif_id
  where a.personne_id = c.id
) where c.id is not null;

-- ---------------------------------------------------------------------
-- Vue des suivis : informations supplémentaires pour les filtres et tris.
-- ---------------------------------------------------------------------
create or replace view public.suivis_detail with (security_invoker = true) as
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
  coalesce(c.referent_id, a.responsable_id) as charge_id,
  c.metier as cible_metier,
  c.groupes as cible_groupes,
  c.sexe as cible_sexe,
  c.date_naissance as cible_naissance,
  z.nom as cible_zone,
  k.libelle as cible_categorie,
  f.nom as cible_famille,
  t.libelle as action_type,
  m.prenom || ' ' || m.nom as charge_nom,
  m.numero_adherent as charge_numero
from public.suivis s
join public.beneficiaires b on b.id = s.beneficiaire_id
join public.actions a on a.id = b.action_id
join public.cibles c on c.id = b.cible_id
left join public.zones z on z.id = c.zone_id
left join public.categories_cible k on k.id = c.categorie_id
left join public.familles_cible f on f.id = k.famille_id
left join public.types_action t on t.id = a.type_id
left join public.membres m on m.id = coalesce(c.referent_id, a.responsable_id);

-- ---------------------------------------------------------------------
-- Droits d'exécution
-- ---------------------------------------------------------------------
revoke execute on function public.action_de_ligne(text, jsonb), public.verrou_action(), public.verrou_action_cloturee(),
  public.libelle_ligne(text, jsonb), public.journaliser(), public.maj_groupes(uuid), public.apres_appartenance(),
  public.apres_renommage_groupe() from public, anon, authenticated;
revoke execute on function public.peut_faire_appel(uuid) from public, anon;
grant execute on function public.peut_faire_appel(uuid) to authenticated;
