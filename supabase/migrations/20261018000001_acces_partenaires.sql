-- Accès des partenaires : formateurs, soignants et bailleurs.
--
-- Un partenaire invité n'a AUCUN droit sur les tables : il n'est pas membre,
-- donc toutes les règles existantes lui refusent tout. Il passe uniquement
-- par les fonctions « portail_* » ci-dessous, qui vérifient son accès à
-- chaque appel et ne renvoient que le nécessaire.
--
-- Portée : seulement les actions auxquelles son organisation participe
-- (action_partenaires). Expiration : pour les formateurs et soignants, un
-- mois après la fin de l'action clôturée. Les bailleurs ne voient que des
-- chiffres anonymes et gardent l'accès tant qu'il n'est pas retiré.
--
-- Secret médical : les notes des consultations ne sont lisibles que par
-- leur auteur et les responsables de l'action, et chaque lecture est notée.

create type type_acces as enum ('formateur', 'soignant', 'bailleur');
create type statut_consultation as enum ('vu', 'rien_a_signaler', 'traite', 'oriente', 'a_revoir');

create table public.acces_partenaires (
  id uuid primary key default gen_random_uuid(),
  partenaire_id uuid not null references public.partenaires (id) on delete cascade,
  type type_acces not null,
  prenom text,
  nom text not null check (length(trim(nom)) > 0),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telephone text,
  user_id uuid unique references auth.users (id) on delete set null,
  revoque_le timestamptz,
  cree_par uuid references public.membres (id) on delete set null default public.mon_membre_id(),
  cree_le timestamptz not null default now()
);
create unique index acces_partenaires_email on public.acces_partenaires (lower(email));

-- Une même adresse ne peut pas être à la fois membre et partenaire invité.
create or replace function public.verifier_acces_partenaire() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.email := lower(trim(new.email));
  if exists (select 1 from public.membres where lower(email) = new.email) then
    raise exception 'Cette adresse est déjà celle d''un membre de l''association' using errcode = '23505';
  end if;
  if tg_op = 'INSERT' then
    select id into new.user_id from auth.users where lower(email) = new.email;
  end if;
  return new;
end $$;
create trigger acces_partenaires_verif before insert or update of email on public.acces_partenaires
  for each row execute function public.verifier_acces_partenaire();

-- À la création du compte (« Première connexion »), il est relié à l'invitation.
create or replace function public.relier_compte_a_partenaire() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.acces_partenaires set user_id = new.id
  where user_id is null and lower(email) = lower(new.email);
  return new;
end $$;
create trigger relier_compte_partenaire after insert on auth.users
  for each row execute function public.relier_compte_a_partenaire();

alter table public.acces_partenaires enable row level security;
create policy acces_lecture on public.acces_partenaires for select to authenticated
  using (public.est_gestionnaire() or user_id = auth.uid());
create policy acces_gestion on public.acces_partenaires for insert to authenticated with check (public.est_gestionnaire());
create policy acces_modif on public.acces_partenaires for update to authenticated
  using (public.est_gestionnaire()) with check (public.est_gestionnaire());
create policy acces_suppr on public.acces_partenaires for delete to authenticated using (public.est_gestionnaire());
grant select, insert, update, delete on public.acces_partenaires to authenticated;
revoke all on public.acces_partenaires from anon;

-- ---------------------------------------------------------------------
-- Droits d'un partenaire connecté
-- ---------------------------------------------------------------------

-- Type d'accès du partenaire connecté pour cette action (null : aucun accès).
create or replace function public.acces_action(p_action uuid) returns type_acces
language sql stable security definer set search_path = public as $$
  select a.type
  from public.acces_partenaires a
  join public.action_partenaires ap on ap.partenaire_id = a.partenaire_id and ap.action_id = p_action
  join public.actions x on x.id = p_action
  where a.user_id = auth.uid() and a.revoque_le is null
    and (a.type = 'bailleur' or x.statut not in ('terminee', 'annulee')
         or current_date <= coalesce(x.date_fin, x.date_debut) + 30)
  order by a.type
  limit 1
$$;

-- Le formateur fait l'appel de ses séances (y compris par scan des cartes).
create or replace function public.peut_faire_appel(p_seance uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.seances s
    where s.id = p_seance
      and (public.peut_gerer_action(s.action_id) or public.dans_equipe(s.action_id) or public.acces_action(s.action_id) = 'formateur')
  )
$$;

-- Responsable d'une action (le responsable ou son créateur) : lit les notes médicales.
create or replace function public.responsable_action(p_action uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.actions where id = p_action and public.mon_membre_id() in (responsable_id, cree_par))
$$;

-- ---------------------------------------------------------------------
-- Consultations (actions de santé)
-- ---------------------------------------------------------------------
create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  beneficiaire_id uuid not null references public.beneficiaires (id) on delete cascade,
  date date not null default current_date,
  statut statut_consultation not null,
  auteur uuid references auth.users (id) on delete set null default auth.uid(),
  auteur_nom text,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
create index consultations_beneficiaire on public.consultations (beneficiaire_id);
-- Notes médicales à part : aucune règle de lecture, accès par fonction seulement.
create table public.consultations_notes (
  consultation_id uuid primary key references public.consultations (id) on delete cascade,
  diagnostic text,
  traitement text,
  orientation text,
  notes text
);
create table public.journal_medical (
  id bigint generated always as identity primary key,
  quand timestamptz not null default now(),
  user_id uuid,
  qui text,
  action_id uuid,
  nb_notes integer not null
);

alter table public.consultations enable row level security;
alter table public.consultations_notes enable row level security;
alter table public.journal_medical enable row level security;
-- Le résultat (vu / traité / orienté…) est visible de l'équipe ; le détail, non.
create policy consultations_lecture on public.consultations for select to authenticated using (
  exists (select 1 from public.beneficiaires b where b.id = consultations.beneficiaire_id
          and (public.voit_cibles() or public.dans_equipe(b.action_id)))
);
create policy journal_medical_lecture on public.journal_medical for select to authenticated using (public.a_role('admin'));
grant select on public.consultations, public.journal_medical to authenticated;
revoke all on public.consultations, public.consultations_notes, public.journal_medical from anon;
revoke all on public.consultations_notes from authenticated;

-- Qui suis-je, pour la signature d'une consultation ou du journal.
create or replace function public.mon_nom() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select prenom || ' ' || nom || ' (' || numero_adherent || ')' from public.membres where user_id = auth.uid()),
    (select trim(concat_ws(' ', a.prenom, a.nom)) || ' — ' || p.nom from public.acces_partenaires a
       join public.partenaires p on p.id = a.partenaire_id where a.user_id = auth.uid()))
$$;

create or replace function public.enregistrer_consultation(
  p_beneficiaire uuid, p_statut statut_consultation, p_diagnostic text default null, p_traitement text default null,
  p_orientation text default null, p_notes text default null, p_date date default current_date, p_consultation uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_action uuid;
  v_id uuid := p_consultation;
begin
  select action_id into v_action from public.beneficiaires where id = p_beneficiaire;
  if v_action is null or not (public.acces_action(v_action) = 'soignant' or public.responsable_action(v_action)) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if v_id is null then
    insert into public.consultations (beneficiaire_id, date, statut, auteur_nom)
    values (p_beneficiaire, coalesce(p_date, current_date), p_statut, public.mon_nom()) returning id into v_id;
  else
    -- Seul l'auteur (ou un responsable de l'action) corrige une consultation.
    update public.consultations set statut = p_statut, date = coalesce(p_date, date), modifie_le = now()
    where id = v_id and beneficiaire_id = p_beneficiaire and (auteur = auth.uid() or public.responsable_action(v_action));
    if not found then raise exception 'Accès refusé' using errcode = '42501'; end if;
  end if;
  insert into public.consultations_notes (consultation_id, diagnostic, traitement, orientation, notes)
  values (v_id, nullif(trim(p_diagnostic), ''), nullif(trim(p_traitement), ''), nullif(trim(p_orientation), ''), nullif(trim(p_notes), ''))
  on conflict (consultation_id) do update set diagnostic = excluded.diagnostic, traitement = excluded.traitement,
    orientation = excluded.orientation, notes = excluded.notes;
  return v_id;
end;
$$;

-- Consultations d'une action ; le détail médical n'est rendu qu'à son auteur
-- et aux responsables de l'action, et chaque lecture du détail est notée.
create or replace function public.lire_consultations(p_action uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  resultat jsonb;
  nb integer;
  responsable boolean := public.responsable_action(p_action);
begin
  if not (public.acces_action(p_action) = 'soignant' or responsable or public.voit_cibles() or public.dans_equipe(p_action)) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'beneficiaire_id', c.beneficiaire_id, 'date', c.date, 'statut', c.statut, 'auteur_nom', c.auteur_nom,
           'mien', c.auteur = auth.uid(),
           'detail', case when c.auteur = auth.uid() or responsable then
             jsonb_build_object('diagnostic', n.diagnostic, 'traitement', n.traitement, 'orientation', n.orientation, 'notes', n.notes) end)
           order by c.date desc, c.cree_le desc), '[]'::jsonb),
         count(*) filter (where c.auteur is distinct from auth.uid() and responsable and n.consultation_id is not null)
    into resultat, nb
  from public.consultations c
  join public.beneficiaires b on b.id = c.beneficiaire_id
  left join public.consultations_notes n on n.consultation_id = c.id
  where b.action_id = p_action;
  if nb > 0 then
    insert into public.journal_medical (user_id, qui, action_id, nb_notes) values (auth.uid(), public.mon_nom(), p_action, nb);
  end if;
  return resultat;
end;
$$;

-- ---------------------------------------------------------------------
-- Portail des partenaires
-- ---------------------------------------------------------------------

-- Mon accès (organisation, type) et les actions auxquelles j'ai accès.
create or replace function public.portail_actions()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'acces', (select jsonb_build_object('type', a.type, 'prenom', a.prenom, 'nom', a.nom, 'partenaire', p.nom, 'sigle', p.sigle)
              from public.acces_partenaires a join public.partenaires p on p.id = a.partenaire_id
              where a.user_id = auth.uid() and a.revoque_le is null),
    'actions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'titre', x.titre, 'type', t.libelle, 'date_debut', x.date_debut, 'date_fin', x.date_fin,
        'lieu', x.lieu, 'statut', x.statut, 'acces', public.acces_action(x.id),
        'expire_le', case when x.statut in ('terminee', 'annulee') and public.acces_action(x.id) <> 'bailleur'
                          then coalesce(x.date_fin, x.date_debut) + 30 end,
        'participants', (select count(*) from public.beneficiaires b where b.action_id = x.id))
        order by x.date_debut desc)
      from public.actions x left join public.types_action t on t.id = x.type_id
      where public.acces_action(x.id) is not null), '[]'::jsonb)
  )
$$;

-- Participants d'une action (formateur, soignant) : identité utile seulement.
create or replace function public.portail_participants(p_action uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  t type_acces := public.acces_action(p_action);
begin
  if t is null or t = 'bailleur' then raise exception 'Accès refusé' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'beneficiaire_id', b.id, 'statut', b.statut, 'prenom', k.prenom, 'nom', k.nom, 'type', k.type, 'sexe', k.sexe,
      'age', extract(year from age(k.date_naissance))::int, 'telephone', k.telephone, 'numero', k.numero_beneficiaire,
      'certificats', (select coalesce(jsonb_agg(jsonb_build_object('id', ap.id, 'description', ap.description, 'numero_document', ap.numero_document, 'date', ap.date_remise)), '[]'::jsonb)
                      from public.apports ap where ap.beneficiaire_id = b.id and ap.nature = 'certificat'),
      'presences', (select count(*) filter (where pr.present) || '/' || count(*) from public.presences pr where pr.beneficiaire_id = b.id))
      order by k.nom, k.prenom)
    from public.beneficiaires b join public.cibles k on k.id = b.cible_id
    where b.action_id = p_action and b.statut <> 'abandon'), '[]'::jsonb);
end;
$$;

-- Séances et appel déjà fait (formateur).
create or replace function public.portail_seances(p_action uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.acces_action(p_action) is distinct from 'formateur' then raise exception 'Accès refusé' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'date', s.date, 'heure_debut', s.heure_debut, 'heure_fin', s.heure_fin, 'theme', s.theme, 'lieu', s.lieu,
      'presences', (select coalesce(jsonb_object_agg(pr.beneficiaire_id, pr.present), '{}'::jsonb) from public.presences pr where pr.seance_id = s.id))
      order by s.date, s.heure_debut)
    from public.seances s where s.action_id = p_action), '[]'::jsonb);
end;
$$;

-- Appel d'une séance par le formateur : { "<id bénéficiaire>": true | false, … }.
create or replace function public.portail_appel(p_seance uuid, p_presences jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_action uuid;
  n integer;
begin
  select action_id into v_action from public.seances where id = p_seance;
  if v_action is null or not public.peut_faire_appel(p_seance) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  insert into public.presences (seance_id, beneficiaire_id, present)
  select p_seance, b.id, (e.value)::boolean
  from jsonb_each_text(p_presences) e
  join public.beneficiaires b on b.id = e.key::uuid and b.action_id = v_action
  on conflict (seance_id, beneficiaire_id) do update set present = excluded.present;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Certificat délivré par le formateur (au nom de son organisation).
create or replace function public.portail_certificat(p_beneficiaire uuid, p_description text, p_numero text default null, p_date date default current_date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_action uuid;
  v_partenaire uuid;
  v_id uuid;
begin
  select action_id into v_action from public.beneficiaires where id = p_beneficiaire;
  if v_action is null or public.acces_action(v_action) is distinct from 'formateur' then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  select partenaire_id into v_partenaire from public.acces_partenaires where user_id = auth.uid() and revoque_le is null;
  insert into public.apports (beneficiaire_id, nature, description, partenaire_id, numero_document, date_remise)
  values (p_beneficiaire, 'certificat', p_description, v_partenaire, nullif(trim(p_numero), ''), coalesce(p_date, current_date))
  returning id into v_id;
  return v_id;
end;
$$;

-- Rapport anonyme d'une action (tous les partenaires, dont les bailleurs).
create or replace function public.portail_rapport(p_action uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r jsonb;
begin
  if public.acces_action(p_action) is null then raise exception 'Accès refusé' using errcode = '42501'; end if;
  with b as (
    select b.*, k.type, k.sexe, extract(year from age(k.date_naissance))::int as age
    from public.beneficiaires b join public.cibles k on k.id = b.cible_id where b.action_id = p_action
  ),
  derniers as (
    select distinct on (s.beneficiaire_id) s.situation
    from public.suivis s join b on b.id = s.beneficiaire_id
    where s.fait_le is not null and s.situation is not null
    order by s.beneficiaire_id, s.fait_le desc
  )
  select jsonb_build_object(
    'action', (select jsonb_build_object('titre', x.titre, 'type', t.libelle, 'date_debut', x.date_debut, 'date_fin', x.date_fin,
                                         'lieu', x.lieu, 'statut', x.statut, 'bilan', x.bilan)
               from public.actions x left join public.types_action t on t.id = x.type_id where x.id = p_action),
    'beneficiaires', (select count(*) from b),
    'personnes', (select count(*) from b where type = 'personne'),
    'collectifs', (select count(*) from b where type <> 'personne'),
    'femmes', (select count(*) from b where sexe = 'F'),
    'hommes', (select count(*) from b where sexe = 'M'),
    'jeunes', (select count(*) from b where age between 15 and 35),
    'termine', (select count(*) from b where statut = 'termine'),
    'abandon', (select count(*) from b where statut = 'abandon'),
    'apports', (select coalesce(jsonb_agg(jsonb_build_object('nature', nature, 'nombre', n, 'valeur', v)), '[]'::jsonb) from (
                  select ap.nature, count(*) n, coalesce(sum(ap.valeur_fcfa), 0) v from public.apports ap join b on b.id = ap.beneficiaire_id group by ap.nature) z),
    'seances', (select count(*) from public.seances where action_id = p_action),
    'presence', (select round(100.0 * count(*) filter (where pr.present) / nullif(count(*), 0)) from public.presences pr join b on b.id = pr.beneficiaire_id),
    'situations', (select coalesce(jsonb_object_agg(situation, n), '{}'::jsonb) from (select situation, count(*) n from derniers group by situation) z),
    'consultations', (select coalesce(jsonb_object_agg(statut, n), '{}'::jsonb) from (
                       select c.statut, count(*) n from public.consultations c join b on b.id = c.beneficiaire_id group by c.statut) z)
  ) into r;
  return r;
end;
$$;

-- Droits d'exécution.
revoke all on function public.verifier_acces_partenaire(), public.relier_compte_a_partenaire(), public.acces_action(uuid),
  public.responsable_action(uuid), public.mon_nom(),
  public.enregistrer_consultation(uuid, statut_consultation, text, text, text, text, date, uuid), public.lire_consultations(uuid),
  public.portail_actions(), public.portail_participants(uuid), public.portail_seances(uuid), public.portail_appel(uuid, jsonb),
  public.portail_certificat(uuid, text, text, date), public.portail_rapport(uuid) from public, anon;
grant execute on function public.acces_action(uuid), public.responsable_action(uuid), public.mon_nom(),
  public.enregistrer_consultation(uuid, statut_consultation, text, text, text, text, date, uuid), public.lire_consultations(uuid),
  public.portail_actions(), public.portail_participants(uuid), public.portail_seances(uuid), public.portail_appel(uuid, jsonb),
  public.portail_certificat(uuid, text, text, date), public.portail_rapport(uuid) to authenticated;
