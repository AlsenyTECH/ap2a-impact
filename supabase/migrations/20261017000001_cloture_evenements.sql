-- Clôture des événements : une fois clôturé, un événement est figé (présences,
-- invités, informations). Seul le compte rendu peut encore être complété, et
-- seul un administrateur peut rouvrir. Les événements passés depuis plus de
-- 7 jours sont clôturés automatiquement chaque nuit.

alter table public.evenements add column if not exists cloture_le timestamptz;
alter table public.evenements add column if not exists cloture_par uuid references public.membres (id) on delete set null;
alter table public.evenements add column if not exists compte_rendu text;

create or replace function public.verrou_evenement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Tâches automatiques (sans utilisateur) et purge de la démonstration : pas de verrou.
  if auth.uid() is null or coalesce(current_setting('ap2a.purge_demo', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if old.cloture_le is not null and not public.a_role('admin') then
      raise exception 'Événement clôturé : seul un administrateur peut le supprimer' using errcode = '42501';
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
    if not public.a_role('admin') then
      raise exception 'Seul un administrateur peut rouvrir un événement clôturé' using errcode = '42501';
    end if;
    new.cloture_par := null;
    return new;
  end if;
  if (to_jsonb(new) - 'compte_rendu') is distinct from (to_jsonb(old) - 'compte_rendu') then
    raise exception 'Événement clôturé : seul le compte rendu peut encore être complété' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger evenements_verrou before update or delete on public.evenements
  for each row execute function public.verrou_evenement();

-- Présences et invités d'un événement clôturé : figés.
create or replace function public.verrou_evenement_lignes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_evenement uuid := case when tg_op = 'DELETE' then old.evenement_id else new.evenement_id end;
begin
  if auth.uid() is not null and coalesce(current_setting('ap2a.purge_demo', true), '') <> 'on'
     and exists (select 1 from public.evenements where id = v_evenement and cloture_le is not null) then
    raise exception 'Événement clôturé : la liste de présence ne peut plus être modifiée' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger evenement_presences_verrou before insert or update or delete on public.evenement_presences
  for each row execute function public.verrou_evenement_lignes();
create trigger evenement_invites_verrou before insert or update or delete on public.evenement_invites
  for each row execute function public.verrou_evenement_lignes();

-- Le scan signale clairement un événement clôturé.
create or replace function public.pointer_evenement(p_evenement uuid, p_jeton text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ev public.evenements;
  carte public.cartes;
  m public.membres;
  deja boolean;
  invite boolean;
begin
  select * into ev from public.evenements where id = p_evenement;
  if ev.id is null or not public.peut_gerer_evenement(p_evenement) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if ev.cloture_le is not null then return jsonb_build_object('statut', 'cloture'); end if;
  select * into carte from public.cartes where jeton = p_jeton;
  if carte.id is null then return jsonb_build_object('statut', 'inconnue'); end if;
  if carte.membre_id is null then return jsonb_build_object('statut', 'carte_beneficiaire'); end if;
  select * into m from public.membres where id = carte.membre_id;
  if carte.revoquee_le is not null or not m.actif then
    return jsonb_build_object('statut', 'revoquee', 'prenom', m.prenom, 'nom', m.nom, 'numero', m.numero_adherent);
  end if;
  invite := ev.invites = 'tous' or exists (select 1 from public.evenement_invites where evenement_id = p_evenement and membre_id = m.id);
  deja := exists (select 1 from public.evenement_presences where evenement_id = p_evenement and membre_id = m.id);
  insert into public.evenement_presences (evenement_id, membre_id, mode) values (p_evenement, m.id, 'scan')
  on conflict do nothing;
  return jsonb_build_object('statut', case when deja then 'deja' when not invite then 'non_invite' else 'ok' end,
                            'membre_id', m.id, 'prenom', m.prenom, 'nom', m.nom, 'numero', m.numero_adherent, 'photo', m.photo_chemin);
end;
$$;
revoke all on function public.pointer_evenement(uuid, text) from public, anon;
grant execute on function public.pointer_evenement(uuid, text) to authenticated;
revoke all on function public.verrou_evenement(), public.verrou_evenement_lignes() from public, anon, authenticated;

-- Clôture automatique, chaque nuit à 2h07 (heure de Dakar = UTC).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('evenements-cloture', '7 2 * * *',
      $job$update public.evenements set cloture_le = now() where cloture_le is null and date < current_date - 7$job$);
  end if;
end;
$$;
