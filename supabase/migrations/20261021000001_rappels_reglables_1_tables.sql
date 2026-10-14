-- Rappels réglables depuis l'application, et rappels aux bénéficiaires.
--
-- * Les horaires ne sont plus écrits dans le code : une tâche tourne tous les
--   quarts d'heure et lance ce qui est dû d'après les réglages, une seule fois
--   par jour (journal rappels_lancements).
-- * Bénéficiaires, avec leur accord : rappel la veille d'une séance de
--   formation, d'un événement (dont les remises de kits et d'attestations) et
--   quelques jours avant un appel de suivi. Par WhatsApp (message préparé par
--   l'application, envoyé par le coordinateur depuis son téléphone) ou par SMS
--   automatique (crédits Brevo).

-- ---------------------------------------------------------------------
-- 1. Réglages (une seule ligne). Heures de Dakar (= UTC), au quart d'heure.
-- ---------------------------------------------------------------------
create table public.reglages_rappels (
  id boolean primary key default true check (id),
  -- Membres : suivis de la semaine
  hebdo_actif boolean not null default true,
  hebdo_jour int not null default 1 check (hebdo_jour between 1 and 7),          -- 1 = lundi … 7 = dimanche
  hebdo_heure time not null default '07:45',
  fenetre_jours int not null default 7 check (fenetre_jours between 1 and 31),  -- suivis prévus dans les N jours
  seuil_retard int not null default 15 check (seuil_retard between 1 and 120),  -- alerte des gestionnaires
  -- Membres : séances (le matin même, ou la veille)
  seances_actif boolean not null default true,
  seances_veille boolean not null default false,
  seances_heure time not null default '06:15',
  -- Bénéficiaires
  cibles_actif boolean not null default false,
  cibles_seances boolean not null default true,
  cibles_evenements boolean not null default true,
  cibles_remises boolean not null default true,
  cibles_suivis boolean not null default true,
  suivi_jours_avant int not null default 3 check (suivi_jours_avant between 1 and 14),
  sms_actif boolean not null default false,
  sms_heure time not null default '18:00',
  sms_expediteur text not null default 'AP2A' check (sms_expediteur ~ '^[A-Za-z0-9]{3,11}$'),
  modifie_le timestamptz not null default now(),
  modifie_par uuid references public.membres (id) on delete set null,
  -- La tâche passe tous les quarts d'heure ; un envoi raté est rattrapé dans les 2 heures.
  constraint heures_valides check (
    hebdo_heure between '05:00' and '21:45' and seances_heure between '05:00' and '21:45' and sms_heure between '05:00' and '21:45'
    and extract(minute from hebdo_heure)::int % 15 = 0 and extract(minute from seances_heure)::int % 15 = 0
    and extract(minute from sms_heure)::int % 15 = 0
    and extract(second from hebdo_heure) = 0 and extract(second from seances_heure) = 0 and extract(second from sms_heure) = 0)
);
insert into public.reglages_rappels default values;

create function public.reglages_rappels_modifies() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.id := true;
  new.modifie_le := now();
  new.modifie_par := public.mon_membre_id();
  return new;
end $$;
create trigger reglages_rappels_modif before update on public.reglages_rappels
  for each row execute function public.reglages_rappels_modifies();

alter table public.reglages_rappels enable row level security;
grant select, update on public.reglages_rappels to authenticated;
create policy reglages_rappels_lecture on public.reglages_rappels for select to authenticated
  using (public.mon_membre_id() is not null);
create policy reglages_rappels_modif on public.reglages_rappels for update to authenticated
  using (public.a_role('admin')) with check (public.a_role('admin'));

-- ---------------------------------------------------------------------
-- 2. Accord du bénéficiaire et canal préféré
-- ---------------------------------------------------------------------
alter table public.cibles
  add column if not exists rappels_accord boolean not null default false,
  add column if not exists rappels_canal text not null default 'whatsapp' check (rappels_canal in ('whatsapp', 'sms'));

-- ---------------------------------------------------------------------
-- 3. Événements ouverts aux participants d'une ou plusieurs actions
--    (ex. cérémonie de remise des attestations de plusieurs promotions)
-- ---------------------------------------------------------------------
create table public.evenement_actions (
  evenement_id uuid not null references public.evenements (id) on delete cascade,
  action_id uuid not null references public.actions (id) on delete cascade,
  primary key (evenement_id, action_id)
);
create index evenement_actions_action on public.evenement_actions (action_id);
alter table public.evenement_actions enable row level security;
grant select, insert, delete on public.evenement_actions to authenticated;
create policy evenement_actions_lecture on public.evenement_actions for select to authenticated
  using (public.mon_membre_id() is not null);
create policy evenement_actions_ajout on public.evenement_actions for insert to authenticated
  with check (public.peut_gerer_evenement(evenement_id));
create policy evenement_actions_suppr on public.evenement_actions for delete to authenticated
  using (public.peut_gerer_evenement(evenement_id));
create trigger evenement_actions_verrou before insert or update or delete on public.evenement_actions
  for each row execute function public.verrou_evenement_lignes();

-- ---------------------------------------------------------------------
-- 4. Journal des rappels aux bénéficiaires (un seul envoi réussi par objet)
-- ---------------------------------------------------------------------
create table public.rappels_cibles (
  id bigint generated always as identity primary key,
  cible_id uuid not null references public.cibles (id) on delete cascade,
  objet text not null check (objet in ('seance', 'evenement', 'suivi')),
  objet_id uuid not null,
  canal text not null check (canal in ('whatsapp', 'sms')),
  statut text not null default 'envoye' check (statut in ('envoye', 'echec')),
  erreur text,
  envoye_le timestamptz not null default now(),
  envoye_par uuid references public.membres (id) on delete set null default public.mon_membre_id()
);
create unique index rappels_cibles_unique on public.rappels_cibles (cible_id, objet, objet_id) where statut = 'envoye';
create index rappels_cibles_date on public.rappels_cibles (envoye_le desc);
alter table public.rappels_cibles enable row level security;
grant select, delete on public.rappels_cibles to authenticated;
create policy rappels_cibles_lecture on public.rappels_cibles for select to authenticated
  using (public.est_gestionnaire() or envoye_par = public.mon_membre_id());
-- Annuler un « envoyé » noté par erreur (par son auteur ; pas les SMS automatiques).
create policy rappels_cibles_annuler on public.rappels_cibles for delete to authenticated
  using (envoye_par = public.mon_membre_id());

-- Journal de la planification (ce qui est déjà parti, par type et par jour).
create table public.rappels_lancements (
  type text not null,
  jour date not null,
  lance_le timestamptz not null default now(),
  primary key (type, jour)
);
alter table public.rappels_lancements enable row level security;
grant select on public.rappels_lancements to authenticated;
create policy rappels_lancements_lecture on public.rappels_lancements for select to authenticated
  using (public.est_gestionnaire());

