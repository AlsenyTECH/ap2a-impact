-- Profil des membres : adresse, niveau d'études, compétences.
--
-- Niveau d'études et compétences sont sur la fiche : tous les membres les
-- voient, pour savoir qui sait faire quoi (électricité, comptabilité…).
-- L'adresse est une donnée personnelle : table à part, lue seulement par la
-- personne elle-même et par qui gère les membres.

alter table public.membres
  add column if not exists niveau_etude text
    check (niveau_etude in ('aucun', 'primaire', 'moyen', 'secondaire', 'bac', 'bac2', 'licence', 'master', 'doctorat', 'professionnel')),
  add column if not exists competences text[] not null default '{}';

-- Compétences propres : sans espaces en trop, sans doublon, 20 au plus.
create or replace function public.nettoyer_competences(p text[]) returns text[]
language sql immutable as $$
  select coalesce(array(
    select c from (
      select distinct on (lower(trim(x))) left(trim(x), 60) c, min(o) over (partition by lower(trim(x))) o
      from unnest(coalesce(p, '{}')) with ordinality u(x, o) where trim(x) <> ''
    ) t order by o limit 20
  ), '{}')
$$;

create or replace function public.preparer_competences() returns trigger
language plpgsql as $$
begin
  new.competences := public.nettoyer_competences(new.competences);
  return new;
end $$;
drop trigger if exists membres_competences on public.membres;
create trigger membres_competences before insert or update of competences on public.membres
  for each row execute function public.preparer_competences();

-- Adresse : une unité des Parcelles (zone), ou « autre » (adresse libre, zone vide).
create table if not exists public.membres_adresses (
  membre_id uuid primary key references public.membres (id) on delete cascade,
  zone_id int references public.zones (id) on delete set null,
  adresse text check (adresse is null or length(adresse) <= 200),
  repere text check (repere is null or length(repere) <= 200),
  modifie_le timestamptz not null default now()
);
drop trigger if exists membres_adresses_modifie on public.membres_adresses;
create trigger membres_adresses_modifie before update on public.membres_adresses
  for each row execute function public.toucher_modifie_le();

alter table public.membres_adresses enable row level security;
create policy membres_adresses_lecture on public.membres_adresses for select to authenticated
  using (membre_id = public.mon_membre_id() or public.a_permission('membres.gerer'));
create policy membres_adresses_ajout on public.membres_adresses for insert to authenticated
  with check (membre_id = public.mon_membre_id() or public.a_permission('membres.gerer'));
create policy membres_adresses_modif on public.membres_adresses for update to authenticated
  using (membre_id = public.mon_membre_id() or public.a_permission('membres.gerer'))
  with check (membre_id = public.mon_membre_id() or public.a_permission('membres.gerer'));
create policy membres_adresses_suppr on public.membres_adresses for delete to authenticated
  using (membre_id = public.mon_membre_id() or public.a_permission('membres.gerer'));
grant select, insert, update, delete on public.membres_adresses to authenticated;
revoke all on public.membres_adresses from anon;

-- Chacun complète lui-même son niveau d'études et ses compétences
-- (le reste de sa fiche reste géré par le bureau).
create or replace function public.maj_mon_profil(p_niveau text, p_competences text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.mon_membre_id() is null then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  update public.membres set niveau_etude = nullif(p_niveau, ''), competences = coalesce(p_competences, '{}')
    where id = public.mon_membre_id();
end $$;
revoke all on function public.maj_mon_profil(text, text[]) from public, anon;
grant execute on function public.maj_mon_profil(text, text[]) to authenticated;
