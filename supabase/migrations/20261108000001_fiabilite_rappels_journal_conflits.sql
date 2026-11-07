-- Trois corrections issues de la relecture critique du dossier de conception.
--
--  1. Rappels planifiés : chaque lancement garde l'identifiant de son appel
--     HTTP ; la réponse est vérifiée au passage suivant (15 min). Échec ou
--     envoi partiel : nouvel essai, jusqu'à 3 en tout ; puis « échec », visible
--     dans l'application. Un nouvel essai ne renvoie rien à qui l'a déjà reçu
--     (la fonction Edge écarte les destinataires déjà servis ce jour-là).
--  2. Journal : les valeurs sensibles (téléphone, email, date de naissance,
--     vulnérabilités, notes, adresse) ne sont plus conservées en clair. Elles
--     sont remplacées par une empreinte HMAC-SHA-256 avec une clé secrète :
--     on peut vérifier qu'une valeur donnée apparaît au journal (enquête), mais
--     pas lire les valeurs. Sans la clé, une empreinte de numéro de téléphone
--     ne se retrouve pas en essayant tous les numéros (10^9 essais suffiraient
--     contre un simple SHA-256). Les lignes déjà écrites sont converties.
--  3. Saisies hors connexion :
--     * suivis : numéro de version ; une modification préparée sur une
--       version dépassée (quelqu'un a modifié le suivi entre-temps) est
--       refusée au lieu d'écraser l'autre saisie ;
--     * présences : c'est l'observation la plus récente (heure du pointage
--       sur le téléphone) qui l'emporte, pas la dernière arrivée au serveur.

-- =====================================================================
-- 1. Rappels planifiés : vérification, nouvel essai, échec visible
-- =====================================================================
alter table public.rappels_lancements
  add column if not exists requete_id bigint,
  add column if not exists essais int not null default 1,
  add column if not exists statut text not null default 'lance',
  add column if not exists erreur text,
  add column if not exists verifie_le timestamptz;
alter table public.rappels_lancements drop constraint if exists rappels_lancements_statut_check;
alter table public.rappels_lancements add constraint rappels_lancements_statut_check
  check (statut in ('lance', 'reussi', 'echec'));
-- Lancements antérieurs : leur réponse n'a pas été gardée.
update public.rappels_lancements set statut = 'reussi' where requete_id is null and statut = 'lance';

-- Un appel de la fonction Edge ; renvoie l'identifiant de la requête pg_net.
create or replace function public.appeler_rappels(p_type text, p_jour date) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    return null;   -- base locale de test : pas de pg_net
  end if;
  return net.http_post(
    url := 'https://mvdsoonjccvfkvvbqefn.supabase.co/functions/v1/rappels',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cle-rappels', public.cle_rappels()),
    body := jsonb_build_object('type', p_type, 'jour', p_jour),
    timeout_milliseconds := 120000);
end $$;
revoke all on function public.appeler_rappels(text, date) from public, anon, authenticated;

-- Résultat des lancements en cours. pg_net garde les réponses quelques heures
-- dans net._http_response : passé 2 heures sans réponse, l'appel est perdu.
create or replace function public.verifier_rappels_lances() returns void
language plpgsql security definer set search_path = public as $$
declare
  l public.rappels_lancements;
  v_code int;
  v_corps text;
  v_erreur text;
  v_trouve boolean;
  v_echecs int;
begin
  if to_regclass('net._http_response') is null then
    return;
  end if;
  for l in select * from public.rappels_lancements where statut = 'lance' and requete_id is not null loop
    execute 'select status_code, content, coalesce(error_msg, case when timed_out then ''délai dépassé'' end)
             from net._http_response where id = $1'
      into v_code, v_corps, v_erreur using l.requete_id;
    v_trouve := v_code is not null or v_erreur is not null;
    if not v_trouve then
      if l.lance_le > now() - interval '2 hours' and coalesce(l.verifie_le, l.lance_le) > now() - interval '2 hours' then
        continue;   -- pas encore de réponse
      end if;
      v_erreur := 'pas de réponse';
    end if;
    -- Envoi partiel : la fonction répond 200 avec { echecs: n }.
    v_echecs := 0;
    if v_code between 200 and 299 then
      begin
        v_echecs := coalesce((v_corps::jsonb ->> 'echecs')::int, 0);
      exception when others then
        v_echecs := 0;
      end;
      if v_echecs = 0 then
        update public.rappels_lancements set statut = 'reussi', erreur = null, verifie_le = now()
          where type = l.type and jour = l.jour;
        continue;
      end if;
      v_erreur := v_echecs || ' envoi(s) en échec';
    elsif v_code is not null then
      v_erreur := 'réponse ' || v_code || coalesce(' : ' || left(v_corps, 300), '');
    end if;
    if l.essais < 3 then
      update public.rappels_lancements
        set requete_id = public.appeler_rappels(l.type, l.jour), essais = l.essais + 1, erreur = v_erreur, verifie_le = now()
        where type = l.type and jour = l.jour;
    else
      update public.rappels_lancements set statut = 'echec', erreur = v_erreur, verifie_le = now()
        where type = l.type and jour = l.jour;
    end if;
  end loop;
end $$;
revoke all on function public.verifier_rappels_lances() from public, anon, authenticated;

-- Tous les quarts d'heure : d'abord les vérifications, puis ce qui est dû.
create or replace function public.lancer_rappels_dus() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_moment timestamp := now() at time zone 'Africa/Dakar';
  v_type text;
  v_jour date;
  r public.reglages_rappels;
begin
  perform public.verifier_rappels_lances();
  select * into r from public.reglages_rappels;
  foreach v_type in array public.rappels_dus(v_moment) loop
    v_jour := case when v_type = 'seances' and r.seances_veille then v_moment::date + 1 else v_moment::date end;
    insert into public.rappels_lancements (type, jour) values (v_type, v_jour) on conflict do nothing;
    if not found then continue; end if;
    update public.rappels_lancements set requete_id = public.appeler_rappels(v_type, v_jour)
      where type = v_type and jour = v_jour;
  end loop;
end $$;
revoke all on function public.lancer_rappels_dus() from public, anon, authenticated;

-- =====================================================================
-- 2. Journal : empreintes HMAC des valeurs sensibles
-- =====================================================================
-- Clé secrète : dans le coffre de Supabase (Vault) ; à défaut (base locale de
-- test), dans un schéma privé que l'API ne voit pas.
create schema if not exists prive;
revoke all on schema prive from public, anon, authenticated;
create table if not exists prive.cles (nom text primary key, valeur text not null);
revoke all on prive.cles from public, anon, authenticated;

do $$
begin
  if to_regclass('vault.secrets') is not null then
    if not exists (select 1 from vault.secrets where name = 'journal_cle') then
      perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'journal_cle',
        'Clé HMAC des valeurs sensibles du journal');
    end if;
  else
    insert into prive.cles (nom, valeur) values ('journal_cle', encode(extensions.gen_random_bytes(32), 'hex'))
      on conflict do nothing;
  end if;
end $$;

create or replace function public.cle_journal() returns bytea
language plpgsql stable security definer set search_path = public as $$
declare
  v text;
begin
  if to_regclass('vault.decrypted_secrets') is not null then
    execute 'select decrypted_secret from vault.decrypted_secrets where name = ''journal_cle'' limit 1' into v;
  end if;
  if v is null then
    select valeur into v from prive.cles where nom = 'journal_cle';
  end if;
  return decode(v, 'hex');
end $$;
revoke all on function public.cle_journal() from public, anon, authenticated;

-- Colonnes dont la valeur n'est jamais écrite en clair au journal.
create or replace function public.champs_sensibles(p_table text) returns text[]
language sql immutable as $$
  select case p_table
    when 'membres' then array['telephone', 'email']
    when 'cibles' then array['telephone', 'date_naissance', 'vulnerabilites', 'notes', 'adresse']
    when 'acces_partenaires' then array['telephone', 'email']
    else '{}'::text[]
  end
$$;

-- Empreinte d'une valeur : même mise en forme qu'à la saisie (téléphone à
-- 9 chiffres, email en minuscules), HMAC-SHA-256, 64 premiers bits en hexadécimal.
create or replace function public.empreinte_valeur(p_champ text, p_valeur text) returns text
language sql stable security definer set search_path = public as $$
  select case when p_valeur is null or p_valeur = '' then null else
    'hmac:' || left(encode(extensions.hmac(
      convert_to(case
        when p_champ = 'telephone' then public.normaliser_telephone(p_valeur)
        when p_champ = 'email' then lower(trim(p_valeur))
        else trim(p_valeur) end, 'UTF8'),
      public.cle_journal(), 'sha256'), 'hex'), 16)
  end
$$;
revoke all on function public.empreinte_valeur(text, text) from public, anon, authenticated;

-- Remplace, dans les détails d'une ligne du journal, les valeurs sensibles par leur empreinte.
create or replace function public.masquer_details(p_table text, p_details jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_champ text;
  v_res jsonb := p_details;
  v_paire jsonb;
begin
  if p_details is null then return null; end if;
  foreach v_champ in array public.champs_sensibles(p_table) loop
    v_paire := p_details -> v_champ;
    if v_paire is not null and jsonb_typeof(v_paire) = 'array' then
      v_res := v_res || jsonb_build_object(v_champ, jsonb_build_array(
        public.empreinte_valeur(v_champ, case jsonb_typeof(v_paire -> 0) when 'string' then v_paire ->> 0 when 'null' then null else (v_paire -> 0)::text end),
        public.empreinte_valeur(v_champ, case jsonb_typeof(v_paire -> 1) when 'string' then v_paire ->> 1 when 'null' then null else (v_paire -> 1)::text end)));
    end if;
  end loop;
  return v_res;
end $$;
revoke all on function public.masquer_details(text, jsonb) from public, anon, authenticated;

create or replace function public.journaliser() returns trigger
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
    -- Seuls les champs modifiés ; jamais le jeton d'une carte ; valeurs sensibles en empreinte.
    v_details := '{}';
    for v_cle in select jsonb_object_keys(v_nouveau) loop
      if v_cle not in ('modifie_le', 'telephone_normalise', 'recherche', 'groupes', 'jeton', 'jeton_hash', 'version')
         and v_nouveau->v_cle is distinct from v_ancien->v_cle then
        v_details := v_details || jsonb_build_object(v_cle, jsonb_build_array(v_ancien->v_cle, v_nouveau->v_cle));
      end if;
    end loop;
    if v_details = '{}' then
      return null;
    end if;
    v_details := public.masquer_details(tg_table_name, v_details);
  end if;
  insert into public.journal (membre_id, auteur_nom, table_nom, operation, ligne_id, action_id, libelle, details)
  values (
    public.mon_membre_id(), public.mon_nom(), tg_table_name, tg_op,
    coalesce(v_ligne->>'id', v_ligne->>'beneficiaire_id', v_ligne->>'membre_id', v_ligne->>'partenaire_id'),
    public.action_de_ligne(tg_table_name, v_ligne),
    public.libelle_ligne(tg_table_name, v_ligne),
    v_details
  );
  return null;
end $$;
revoke all on function public.journaliser() from public, anon, authenticated;

-- Lignes déjà écrites : les valeurs en clair sont remplacées par leur empreinte.
update public.journal j set details = public.masquer_details(j.table_nom, j.details)
where j.details is not null and j.details ?| public.champs_sensibles(j.table_nom);

-- Enquête : l'empreinte d'une valeur donnée, pour la rechercher dans le journal.
-- Réservé à qui voit le journal complet.
create or replace function public.empreinte_journal(p_champ text, p_valeur text) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.a_permission('journal.voir') then
    raise exception 'Seul qui voit l''historique peut faire cette recherche' using errcode = '42501';
  end if;
  if p_champ not in ('telephone', 'email', 'date_naissance', 'notes', 'adresse') then
    raise exception 'Champ inconnu' using errcode = '22023';
  end if;
  return public.empreinte_valeur(p_champ, p_valeur);
end $$;
revoke all on function public.empreinte_journal(text, text) from public, anon;
grant execute on function public.empreinte_journal(text, text) to authenticated;

-- =====================================================================
-- 3. Saisies hors connexion : pas d'écrasement silencieux
-- =====================================================================
-- 3a. Suivis : version
alter table public.suivis add column if not exists version int not null default 1;

create or replace function public.controler_version_suivi() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.version is distinct from old.version then
    raise exception 'Ce suivi a été modifié par quelqu''un d''autre entre-temps : votre saisie n''a pas été enregistrée. Rouvrez le suivi pour voir la nouvelle version.'
      using errcode = '40001';
  end if;
  new.version := old.version + 1;
  return new;
end $$;
revoke all on function public.controler_version_suivi() from public, anon, authenticated;
drop trigger if exists suivis_version on public.suivis;
create trigger suivis_version before update on public.suivis
  for each row execute function public.controler_version_suivi();

-- La version est exposée par la vue des suivis (colonne ajoutée en dernier).
create or replace view public.suivis_detail with (security_invoker = true) as
 select s.id, s.beneficiaire_id, s.echeance_mois, s.date_prevue, s.fait_le, s.situation, s.activite,
    s.revenu_mensuel_fcfa, s.emplois_crees, s.utilise_apport, s.commentaire, s.fichier_chemin, s.saisi_par,
    s.cree_le, s.modifie_le, b.action_id, b.cible_id, a.titre as action_titre, a.type_id, c.type as cible_type,
    c.prenom as cible_prenom, c.nom as cible_nom, c.telephone as cible_telephone,
    coalesce(c.referent_id, a.responsable_id) as charge_id, c.metier as cible_metier, c.groupes as cible_groupes,
    c.sexe as cible_sexe, c.date_naissance as cible_naissance, z.nom as cible_zone, k.libelle as cible_categorie,
    f.nom as cible_famille, t.libelle as action_type, (m.prenom || ' ' || m.nom) as charge_nom,
    m.numero_adherent as charge_numero, s.version
   from public.suivis s
     join public.beneficiaires b on b.id = s.beneficiaire_id
     join public.actions a on a.id = b.action_id
     join public.cibles c on c.id = b.cible_id
     left join public.zones z on z.id = c.zone_id
     left join public.categories_cible k on k.id = c.categorie_id
     left join public.familles_cible f on f.id = k.famille_id
     left join public.types_action t on t.id = a.type_id
     left join public.membres m on m.id = coalesce(c.referent_id, a.responsable_id);

-- 3b. Présences : l'observation la plus récente l'emporte
create or replace function public.garder_presence_recente() returns trigger
language plpgsql set search_path = public as $$
begin
  -- Heure du téléphone : jamais dans le futur (horloge déréglée).
  if new.pointe_le is null or new.pointe_le > now() then
    new.pointe_le := now();
  end if;
  if tg_op = 'UPDATE' and old.pointe_le is not null and new.pointe_le < old.pointe_le then
    return old;   -- pointage plus ancien que celui déjà enregistré : ignoré
  end if;
  return new;
end $$;
revoke all on function public.garder_presence_recente() from public, anon, authenticated;
drop trigger if exists presences_recente on public.presences;
create trigger presences_recente before insert or update on public.presences
  for each row execute function public.garder_presence_recente();
