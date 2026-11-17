-- Localités, annonces aux membres, événements sur plusieurs dates.
--
--  1. Adresse « Autre » rattachée à une commune (liste des zones) : les membres
--     hors Parcelles se trient et se filtrent aussi par localité.
--  2. Annonces : le responsable d'une action ou d'un événement informe tous
--     les membres, ou ceux qu'il choisit (triés par localité). Il ne reçoit que
--     le nom, la localité et la présence d'un téléphone ou d'un email : jamais
--     l'adresse détaillée (réservée à qui gère les membres). Chaque membre peut
--     refuser les annonces dans « Mon profil ». Le SMS (payant) demande le droit
--     « Envoyer des annonces par SMS ».
--  3. Événements : plusieurs dates (aujourd'hui, demain, dans un mois…), chacune
--     avec ses heures, son lieu et sa liste de présence ; rappels la veille de
--     chaque date ; clôture automatique 7 jours après la dernière date.

-- =====================================================================
-- 1. Localité des membres
-- =====================================================================
-- Avec une adresse « Autre », zone_id désigne la commune ou la localité (et
-- non plus rien) ; avec une unité des Parcelles, l'unité.

-- Localité lisible et clé de tri : unités dans l'ordre, puis communes, puis adresses libres.
create or replace function public.localite_membre(p_membre uuid, out libelle text, out tri text, out zone_id int)
language sql stable security definer set search_path = public as $$
  select
    case when z.id is not null then z.nom when coalesce(a.adresse, '') <> '' then 'Autre adresse' else 'Non renseignée' end,
    case
      when z.niveau = 'quartier' and z.chemin like '%Parcelles Assainies > Unité %'
        then '1-' || lpad(regexp_replace(z.nom, '\D', '', 'g'), 3, '0')
      when z.id is not null then '2-' || lower(z.nom)
      when coalesce(a.adresse, '') <> '' then '3-'
      else '4-' end,
    z.id
  from (select p_membre as id) m
  left join public.membres_adresses a on a.membre_id = m.id
  left join public.zones z on z.id = a.zone_id
$$;
revoke all on function public.localite_membre(uuid) from public, anon, authenticated;

-- Liste des membres avec leur localité, pour qui gère les membres (tri et filtre de la page Membres).
create or replace function public.localites_membres()
returns table (membre_id uuid, localite text, tri text, zone_id int, adresse text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.a_permission('membres.gerer') then
    raise exception 'Il faut le droit « Gérer les membres »' using errcode = '42501';
  end if;
  return query
    select m.id, l.libelle, l.tri, l.zone_id, a.adresse
    from public.membres m
    cross join lateral public.localite_membre(m.id) l
    left join public.membres_adresses a on a.membre_id = m.id;
end $$;
revoke all on function public.localites_membres() from public, anon;
grant execute on function public.localites_membres() to authenticated;

-- =====================================================================
-- 2. Annonces aux membres
-- =====================================================================
alter table public.membres add column if not exists annonces boolean not null default true;

create or replace function public.regler_annonces(p_actif boolean) returns void
language sql security definer set search_path = public as $$
  update public.membres set annonces = p_actif where id = public.mon_membre_id();
$$;
revoke all on function public.regler_annonces(boolean) from public, anon;
grant execute on function public.regler_annonces(boolean) to authenticated;

insert into public.permissions (code, groupe, libelle, description, ordre) values
  ('annonces.sms', 'Membres', 'Envoyer des annonces par SMS',
   'Prévenir des membres d''une action ou d''un événement par SMS automatique (payant). WhatsApp et email restent ouverts à qui gère l''action ou l''événement.', 74)
on conflict (code) do nothing;
update public.roles set permissions = array_append(permissions, 'annonces.sms')
  where code = 'bureau' and not ('annonces.sms' = any(permissions));

-- Membres que le responsable d'une action ou d'un événement peut informer.
create or replace function public.membres_pour_annonce(p_action uuid default null, p_evenement uuid default null)
returns table (membre_id uuid, prenom text, nom text, numero_adherent text, fonction text, localite text, tri text,
               zone_id int, adresse text, a_telephone boolean, a_email boolean, annonces boolean, invite boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_gere boolean := public.a_permission('membres.gerer');
begin
  if (p_action is null) = (p_evenement is null) then
    raise exception 'Une action ou un événement' using errcode = '22023';
  end if;
  if (p_action is not null and not public.peut_gerer_action(p_action))
     or (p_evenement is not null and not public.peut_gerer_evenement(p_evenement)) then
    raise exception 'Seul qui gère cette action ou cet événement peut informer les membres' using errcode = '42501';
  end if;
  return query
    select m.id, m.prenom, m.nom, m.numero_adherent, m.fonction, l.libelle, l.tri, l.zone_id,
           case when v_gere then a.adresse end,
           coalesce(m.telephone, '') <> '', coalesce(m.email, '') <> '' and m.email not like '%.invalid', m.annonces,
           p_evenement is not null and exists (select 1 from public.evenement_invites i where i.evenement_id = p_evenement and i.membre_id = m.id)
    from public.membres m
    cross join lateral public.localite_membre(m.id) l
    left join public.membres_adresses a on a.membre_id = m.id
    where m.actif;
end $$;
revoke all on function public.membres_pour_annonce(uuid, uuid) from public, anon;
grant execute on function public.membres_pour_annonce(uuid, uuid) to authenticated;

-- =====================================================================
-- 3. Événements sur plusieurs dates
-- =====================================================================
alter table public.evenements add column if not exists date_fin date;

create table if not exists public.evenement_dates (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid not null references public.evenements (id) on delete cascade,
  date date not null,
  heure_debut time,
  heure_fin time,
  lieu text check (lieu is null or length(lieu) <= 200),
  note text check (note is null or length(note) <= 300),
  cree_le timestamptz not null default now(),
  unique (id, evenement_id)
);
create index if not exists evenement_dates_evenement on public.evenement_dates (evenement_id, date);
create index if not exists evenement_dates_date on public.evenement_dates (date);

-- Chaque événement existant reçoit sa date actuelle.
insert into public.evenement_dates (evenement_id, date, heure_debut, heure_fin)
select e.id, e.date, e.heure_debut, e.heure_fin from public.evenements e
where not exists (select 1 from public.evenement_dates d where d.evenement_id = e.id);
update public.evenements set date_fin = date where date_fin is null;

alter table public.evenement_dates enable row level security;
create policy evenement_dates_lecture on public.evenement_dates for select to authenticated
  using (public.mon_membre_id() is not null);
create policy evenement_dates_gestion on public.evenement_dates for all to authenticated
  using (public.peut_gerer_evenement(evenement_id)) with check (public.peut_gerer_evenement(evenement_id));
grant select, insert, update, delete on public.evenement_dates to authenticated;
revoke all on public.evenement_dates from anon;

-- Événement clôturé : ses dates sont figées.
create trigger evenement_dates_verrou before insert or update or delete on public.evenement_dates
  for each row execute function public.verrou_evenement_lignes();

-- Un événement garde toujours au moins une date.
create or replace function public.garder_une_date() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.evenements where id = old.evenement_id)
     and (select count(*) from public.evenement_dates where evenement_id = old.evenement_id) <= 1 then
    raise exception 'Un événement garde au moins une date' using errcode = '23514';
  end if;
  return old;
end $$;
revoke all on function public.garder_une_date() from public, anon, authenticated;
create trigger evenement_dates_derniere before delete on public.evenement_dates
  for each row execute function public.garder_une_date();

-- Première et dernière date, recopiées sur l'événement (listes, tri, clôture).
create or replace function public.resumer_dates_evenement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v uuid := coalesce(new.evenement_id, old.evenement_id);
  v_min date;
  v_max date;
begin
  select min(date), max(date) into v_min, v_max from public.evenement_dates where evenement_id = v;
  if v_min is not null then
    update public.evenements set date = v_min, date_fin = v_max
      where id = v and (date, date_fin) is distinct from (v_min, v_max);
  end if;
  return null;
end $$;
revoke all on function public.resumer_dates_evenement() from public, anon, authenticated;
create trigger evenement_dates_resume after insert or update or delete on public.evenement_dates
  for each row execute function public.resumer_dates_evenement();

-- Un nouvel événement reçoit automatiquement sa première date.
create or replace function public.premiere_date_evenement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.evenement_dates (evenement_id, date, heure_debut, heure_fin)
  values (new.id, new.date, new.heure_debut, new.heure_fin);
  return null;
end $$;
revoke all on function public.premiere_date_evenement() from public, anon, authenticated;
create trigger evenements_premiere_date after insert on public.evenements
  for each row execute function public.premiere_date_evenement();

-- Présences : une liste par date.
alter table public.evenement_presences add column if not exists date_id uuid;
update public.evenement_presences p set date_id = (
  select d.id from public.evenement_dates d where d.evenement_id = p.evenement_id order by d.date, d.heure_debut nulls first limit 1)
where p.date_id is null;

-- Sans date précisée (ancienne application, saisie gardée hors connexion) :
-- la date du jour si l'événement en a une, sinon sa première date.
create or replace function public.date_presence_par_defaut() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.date_id is null then
    select d.id into new.date_id from public.evenement_dates d
    where d.evenement_id = new.evenement_id
    order by (d.date = current_date) desc, d.date, d.heure_debut nulls first limit 1;
  end if;
  return new;
end $$;
revoke all on function public.date_presence_par_defaut() from public, anon, authenticated;
create trigger evenement_presences_date before insert or update on public.evenement_presences
  for each row execute function public.date_presence_par_defaut();

alter table public.evenement_presences alter column date_id set not null;
alter table public.evenement_presences drop constraint if exists evenement_presences_pkey;
alter table public.evenement_presences add constraint evenement_presences_pkey primary key (date_id, membre_id);
alter table public.evenement_presences drop constraint if exists evenement_presences_date_fkey;
alter table public.evenement_presences add constraint evenement_presences_date_fkey
  foreign key (date_id, evenement_id) references public.evenement_dates (id, evenement_id) on delete cascade;
create index if not exists evenement_presences_evenement on public.evenement_presences (evenement_id);

-- Pointage par scan, pour une date donnée (par défaut celle du jour).
create or replace function public.pointer_evenement(p_evenement uuid, p_jeton text, p_date uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ev public.evenements;
  carte public.cartes;
  m public.membres;
  v_date uuid := p_date;
  deja boolean;
  invite boolean;
begin
  select * into ev from public.evenements where id = p_evenement;
  if ev.id is null or not public.peut_gerer_evenement(p_evenement) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if ev.cloture_le is not null then return jsonb_build_object('statut', 'cloture'); end if;
  if v_date is null then
    select d.id into v_date from public.evenement_dates d where d.evenement_id = p_evenement
    order by (d.date = current_date) desc, d.date limit 1;
  elsif not exists (select 1 from public.evenement_dates where id = v_date and evenement_id = p_evenement) then
    raise exception 'Cette date n''appartient pas à l''événement' using errcode = '22023';
  end if;
  select * into carte from public.cartes where jeton = p_jeton;
  if carte.id is null then return jsonb_build_object('statut', 'inconnue'); end if;
  if carte.membre_id is null then return jsonb_build_object('statut', 'carte_beneficiaire'); end if;
  select * into m from public.membres where id = carte.membre_id;
  if carte.revoquee_le is not null or not m.actif then
    return jsonb_build_object('statut', 'revoquee', 'prenom', m.prenom, 'nom', m.nom, 'numero', m.numero_adherent);
  end if;
  invite := ev.invites = 'tous' or exists (select 1 from public.evenement_invites where evenement_id = p_evenement and membre_id = m.id);
  deja := exists (select 1 from public.evenement_presences where date_id = v_date and membre_id = m.id);
  insert into public.evenement_presences (evenement_id, date_id, membre_id, mode) values (p_evenement, v_date, m.id, 'scan')
  on conflict do nothing;
  return jsonb_build_object('statut', case when deja then 'deja' when not invite then 'non_invite' else 'ok' end,
                            'membre_id', m.id, 'prenom', m.prenom, 'nom', m.nom, 'numero', m.numero_adherent, 'photo', m.photo_chemin);
end $$;
revoke all on function public.pointer_evenement(uuid, text, uuid) from public, anon;
grant execute on function public.pointer_evenement(uuid, text, uuid) to authenticated;

-- L'ancienne forme (sans date) reste valable : date du jour.
create or replace function public.pointer_evenement(p_evenement uuid, p_jeton text)
returns jsonb language sql security definer set search_path = public as $$
  select public.pointer_evenement(p_evenement, p_jeton, null::uuid)
$$;
revoke all on function public.pointer_evenement(uuid, text) from public, anon;
grant execute on function public.pointer_evenement(uuid, text) to authenticated;

-- Clôture automatique : 7 jours après la DERNIÈRE date.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('evenements-cloture', '7 2 * * *',
      $job$update public.evenements set cloture_le = now() where cloture_le is null and coalesce(date_fin, date) < current_date - 7$job$);
  end if;
end $$;

-- Rappels aux bénéficiaires : la veille de chaque date.
create or replace function public.calcul_rappels_cibles(p_jour date)
returns setof public.rappel_cible
language sql stable security definer set search_path = public as $$
  with r as (select * from public.reglages_rappels),
  personnes as (
    select c.id, coalesce(nullif(trim(c.prenom), ''), c.nom) as appel, trim(concat_ws(' ', c.prenom, c.nom)) as nom,
           c.telephone, c.telephone_normalise as tel, c.rappels_canal as canal
    from public.cibles c
    where c.actif and c.rappels_accord and length(coalesce(c.telephone_normalise, '')) >= 9
  ),
  items as (
    -- Séances de formation de demain
    select p.id as cible_id, 'seance'::text as objet, 'seance'::text as genre, s.id as objet_id, a.id as action_id,
           null::uuid as evenement_id, a.titre, s.date as quand, s.heure_debut as heure, coalesce(s.lieu, a.lieu) as lieu
    from r, public.seances s
    join public.actions a on a.id = s.action_id and a.statut not in ('terminee', 'annulee')
    join public.beneficiaires b on b.action_id = a.id and b.statut <> 'abandon'
    join personnes p on p.id = b.cible_id
    where r.cibles_seances and s.date = p_jour + 1
    union all
    -- Événements de demain (chaque date d'un événement sur plusieurs jours) : participants
    -- des actions invitées, une seule fois par personne et par date
    select distinct on (p.id, d.id) p.id, 'evenement', case when e.type = 'remise' then 'remise' else 'evenement' end, d.id, null::uuid,
           e.id, e.titre, d.date, coalesce(d.heure_debut, e.heure_debut), coalesce(d.lieu, e.lieu)
    from r, public.evenement_dates d
    join public.evenements e on e.id = d.evenement_id
    join public.evenement_actions ea on ea.evenement_id = e.id
    join public.beneficiaires b on b.action_id = ea.action_id and b.statut <> 'abandon'
    join personnes p on p.id = b.cible_id
    where d.date = p_jour + 1 and e.cloture_le is null
      and case when e.type = 'remise' then r.cibles_remises else r.cibles_evenements end
    union all
    -- Appels de suivi prévus dans les N jours (sans rien dire de l'action : secret médical).
    -- Une fenêtre plutôt qu'un jour exact : un jour sans envoi est rattrapé le lendemain.
    select p.id, 'suivi', 'suivi', s.id, b.action_id, null::uuid, a.titre, s.date_prevue, null::time, null::text
    from r, public.suivis s
    join public.beneficiaires b on b.id = s.beneficiaire_id and b.statut <> 'abandon'
    join public.actions a on a.id = b.action_id
    join personnes p on p.id = b.cible_id
    where r.cibles_suivis and s.fait_le is null and s.date_prevue between p_jour + 1 and p_jour + r.suivi_jours_avant
  )
  select i.cible_id, p.nom, p.telephone,
         case when length(p.tel) = 9 then '221' || p.tel when p.tel like '00%' then substr(p.tel, 3) else p.tel end,
         p.canal, i.objet, i.genre, i.objet_id, i.action_id, i.evenement_id, i.titre, i.quand, i.heure, i.lieu,
         case i.genre
           when 'seance' then format('Bonjour %s, c''est l''AP2A. Rappel : demain %s%s, séance de formation « %s »%s. Merci d''être à l''heure !',
             p.appel, public.date_longue(i.quand), ' à ' || to_char(i.heure, 'HH24"h"MI'), i.titre, ', ' || i.lieu)
           when 'evenement' then format('Bonjour %s, c''est l''AP2A. Vous êtes invité(e) demain %s%s : « %s »%s. Nous comptons sur votre présence !',
             p.appel, public.date_longue(i.quand), ' à ' || to_char(i.heure, 'HH24"h"MI'), i.titre, ', ' || i.lieu)
           when 'remise' then format('Bonjour %s, c''est l''AP2A. La remise de votre kit ou de votre attestation a lieu demain %s%s%s (« %s »). Merci d''être présent(e) !',
             p.appel, public.date_longue(i.quand), ' à ' || to_char(i.heure, 'HH24"h"MI'), ', ' || i.lieu, i.titre)
           else format('Bonjour %s, c''est l''AP2A. Nous vous appellerons dans les prochains jours pour prendre de vos nouvelles. Merci de nous répondre !', p.appel)
         end,
         case i.genre
           when 'seance' then format('AP2A : demain %s%s, séance « %s »%s. Merci d''être à l''heure.',
             to_char(i.quand, 'DD/MM'), ' à ' || to_char(i.heure, 'HH24"h"MI'), left(i.titre, 40), ', ' || left(i.lieu, 30))
           when 'evenement' then format('AP2A : vous êtes invité(e) demain %s%s : « %s »%s.',
             to_char(i.quand, 'DD/MM'), ' à ' || to_char(i.heure, 'HH24"h"MI'), left(i.titre, 45), ', ' || left(i.lieu, 30))
           when 'remise' then format('AP2A : remise de votre kit ou attestation demain %s%s%s. Merci d''être présent(e).',
             to_char(i.quand, 'DD/MM'), ' à ' || to_char(i.heure, 'HH24"h"MI'), ', ' || left(i.lieu, 40))
           else 'AP2A : nous vous appellerons dans les prochains jours pour prendre de vos nouvelles. Merci de répondre !'
         end,
         j.envoye_le, j.canal,
         -- SMS automatique encore à venir aujourd'hui : préférence SMS, SMS activés, pas encore
         -- passé ni échoué, pas une fiche de démonstration.
         p.canal = 'sms' and r.cibles_actif and r.sms_actif and j.envoye_le is null and e.erreur is null
           and not exists (select 1 from public.rappels_lancements l where l.type = 'sms' and l.jour = p_jour)
           and not exists (select 1 from public.donnees_demo d where d.nom_table = 'cibles' and d.id = i.cible_id::text),
         e.erreur
  from items i
  cross join r
  join personnes p on p.id = i.cible_id
  left join lateral (
    select rc.envoye_le, rc.canal from public.rappels_cibles rc
    where rc.cible_id = i.cible_id and rc.objet = i.objet and rc.objet_id = i.objet_id and rc.statut = 'envoye'
    limit 1
  ) j on true
  left join lateral (
    select rc.erreur from public.rappels_cibles rc
    where rc.cible_id = i.cible_id and rc.objet = i.objet and rc.objet_id = i.objet_id and rc.statut = 'echec'
    order by rc.envoye_le desc limit 1
  ) e on true
$$;
revoke all on function public.calcul_rappels_cibles(date) from public, anon, authenticated;
