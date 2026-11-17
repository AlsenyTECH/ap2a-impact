-- Présence des bénéficiaires aux événements.
--
-- Un événement relié à des actions (« Bénéficiaires invités ») invite leurs
-- participants. Leur présence se pointe maintenant comme celle des membres :
-- par le scan de leur carte ou à la main, une liste par date de l'événement.
-- Seul qui gère l'événement voit cette liste (ou qui voit les cibles).

create table if not exists public.evenement_presences_cibles (
  evenement_id uuid not null references public.evenements (id) on delete cascade,
  date_id uuid not null,
  cible_id uuid not null references public.cibles (id) on delete cascade,
  pointe_le timestamptz not null default now(),
  pointe_par uuid references public.membres (id) on delete set null default public.mon_membre_id(),
  mode text not null default 'manuel' check (mode in ('manuel', 'scan')),
  primary key (date_id, cible_id),
  foreign key (date_id, evenement_id) references public.evenement_dates (id, evenement_id) on delete cascade
);
create index if not exists evenement_presences_cibles_evenement on public.evenement_presences_cibles (evenement_id);

alter table public.evenement_presences_cibles enable row level security;
create policy ev_presences_cibles_lecture on public.evenement_presences_cibles for select to authenticated
  using (public.peut_gerer_evenement(evenement_id) or public.voit_cibles());
create policy ev_presences_cibles_gestion on public.evenement_presences_cibles for all to authenticated
  using (public.peut_gerer_evenement(evenement_id)) with check (public.peut_gerer_evenement(evenement_id));
grant select, insert, update, delete on public.evenement_presences_cibles to authenticated;
revoke all on public.evenement_presences_cibles from anon;

-- Même date par défaut et même verrou après clôture que pour les membres.
create trigger evenement_presences_cibles_date before insert or update on public.evenement_presences_cibles
  for each row execute function public.date_presence_par_defaut();
create trigger evenement_presences_cibles_verrou before insert or update or delete on public.evenement_presences_cibles
  for each row execute function public.verrou_evenement_lignes();

-- L'auteur du pointage ne se falsifie pas.
create or replace function public.auteur_presence_cible() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.pointe_par := public.mon_membre_id();
  end if;
  return new;
end $$;
revoke all on function public.auteur_presence_cible() from public, anon, authenticated;
create trigger evenement_presences_cibles_auteur before insert or update on public.evenement_presences_cibles
  for each row execute function public.auteur_presence_cible();

-- Bénéficiaires invités d'un événement : participants (non abandonnés) des actions
-- reliées, une ligne par personne ; avec l'empreinte de leur carte pour le scan hors ligne.
create or replace function public.beneficiaires_evenement(p_evenement uuid)
returns table (cible_id uuid, prenom text, nom text, numero_beneficiaire text, actions text, jeton_hash text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.peut_gerer_evenement(p_evenement) then
    raise exception 'Seul qui gère cet événement voit ses bénéficiaires invités' using errcode = '42501';
  end if;
  return query
    select c.id, c.prenom, c.nom, c.numero_beneficiaire,
           string_agg(distinct a.titre, ', ' order by a.titre),
           (select k.jeton_hash from public.cartes k where k.cible_id = c.id and k.revoquee_le is null order by k.emise_le desc limit 1)
    from public.evenement_actions ea
    join public.actions a on a.id = ea.action_id
    join public.beneficiaires b on b.action_id = ea.action_id and b.statut <> 'abandon'
    join public.cibles c on c.id = b.cible_id
    where ea.evenement_id = p_evenement
    group by c.id, c.prenom, c.nom, c.numero_beneficiaire;
end $$;
revoke all on function public.beneficiaires_evenement(uuid) from public, anon;
grant execute on function public.beneficiaires_evenement(uuid) to authenticated;

-- Scan : une carte de bénéficiaire est pointée si l'événement invite des bénéficiaires
-- (actions reliées). Hors de ces actions : pointée comme « non invité », et son nom
-- n'est donné qu'à qui voit les cibles.
create or replace function public.pointer_evenement(p_evenement uuid, p_jeton text, p_date uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ev public.evenements;
  carte public.cartes;
  m public.membres;
  k public.cibles;
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

  -- Carte de bénéficiaire
  if carte.membre_id is null then
    if not exists (select 1 from public.evenement_actions where evenement_id = p_evenement) then
      return jsonb_build_object('statut', 'carte_beneficiaire');
    end if;
    select * into k from public.cibles where id = carte.cible_id;
    invite := exists (select 1 from public.evenement_actions ea
                      join public.beneficiaires b on b.action_id = ea.action_id and b.statut <> 'abandon'
                      where ea.evenement_id = p_evenement and b.cible_id = k.id);
    if carte.revoquee_le is not null then
      return case when invite or public.voit_cibles()
        then jsonb_build_object('statut', 'revoquee', 'prenom', k.prenom, 'nom', k.nom)
        else jsonb_build_object('statut', 'revoquee') end;
    end if;
    deja := exists (select 1 from public.evenement_presences_cibles where date_id = v_date and cible_id = k.id);
    insert into public.evenement_presences_cibles (evenement_id, date_id, cible_id, mode) values (p_evenement, v_date, k.id, 'scan')
    on conflict do nothing;
    return case when invite or public.voit_cibles()
      then jsonb_build_object('statut', case when deja then 'deja' when not invite then 'non_invite' else 'ok' end,
                              'cible_id', k.id, 'prenom', k.prenom, 'nom', k.nom, 'numero', k.numero_beneficiaire, 'beneficiaire', true)
      else jsonb_build_object('statut', case when deja then 'deja' else 'non_invite' end, 'beneficiaire', true) end;
  end if;

  -- Carte de membre
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
