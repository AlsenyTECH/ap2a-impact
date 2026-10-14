-- Rappels réglables (2/4) : calcul des rappels aux bénéficiaires.

-- ---------------------------------------------------------------------
-- 5. Rappels dus aux bénéficiaires pour une journée donnée
-- ---------------------------------------------------------------------
create or replace function public.date_longue(d date) returns text
language sql immutable as $$
  select (array['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'])[extract(dow from d)::int + 1]
    || ' ' || extract(day from d)::int
    || ' ' || (array['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'])[extract(month from d)::int]
$$;

create type public.rappel_cible as (
  cible_id uuid,
  nom text,
  telephone text,
  telephone_intl text,
  canal text,
  objet text,         -- seance | evenement | suivi
  genre text,         -- seance | evenement | remise | suivi
  objet_id uuid,
  action_id uuid,
  evenement_id uuid,
  titre text,
  quand date,
  heure time,
  lieu text,
  message text,       -- WhatsApp
  sms text,           -- version courte
  envoye_le timestamptz,
  envoye_canal text,
  sms_auto boolean,   -- un SMS automatique partira encore aujourd'hui (sinon : boutons manuels)
  erreur text         -- dernier échec d'envoi automatique
);

-- Cœur du calcul ; n'est appelée que par les deux fonctions qui suivent.
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
    -- Événements de demain : participants des actions invitées (une seule fois par personne)
    select distinct on (p.id, e.id) p.id, 'evenement', case when e.type = 'remise' then 'remise' else 'evenement' end, e.id, null::uuid,
           e.id, e.titre, e.date, e.heure_debut, e.lieu
    from r, public.evenements e
    join public.evenement_actions ea on ea.evenement_id = e.id
    join public.beneficiaires b on b.action_id = ea.action_id and b.statut <> 'abandon'
    join personnes p on p.id = b.cible_id
    where e.date = p_jour + 1 and e.cloture_le is null
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

-- Écran « Rappels à envoyer » : ce que le membre connecté peut préparer.
create or replace function public.rappels_cibles_a_envoyer(p_jour date default current_date)
returns setof public.rappel_cible
language sql stable security definer set search_path = public as $$
  select x.* from public.calcul_rappels_cibles(p_jour) x
  where (select cibles_actif from public.reglages_rappels)
    and (public.est_gestionnaire()
      -- Mêmes règles que pour lire les bénéficiaires : équipe de l'action, ou
      -- coordinateur qui la gère (pas un ancien responsable devenu simple membre).
      or (x.action_id is not null and (public.dans_equipe(x.action_id) or public.peut_gerer_action(x.action_id)))
      or (x.evenement_id is not null and public.peut_gerer_evenement(x.evenement_id)))
  order by x.quand, x.heure nulls last, x.titre, x.nom
$$;
revoke all on function public.rappels_cibles_a_envoyer(date) from public, anon;
grant execute on function public.rappels_cibles_a_envoyer(date) to authenticated;

-- Le coordinateur a envoyé le message depuis son téléphone (WhatsApp, ou SMS
-- avec son forfait) : on le note, une seule fois.
create or replace function public.noter_rappel(p_cible uuid, p_objet text, p_objet_id uuid, p_canal text default 'whatsapp')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.rappels_cibles_a_envoyer(current_date) x where x.cible_id = p_cible and x.objet = p_objet and x.objet_id = p_objet_id
    union all
    select 1 from public.rappels_cibles_a_envoyer(current_date - 1) x where x.cible_id = p_cible and x.objet = p_objet and x.objet_id = p_objet_id
  ) then
    raise exception 'Vous ne pouvez pas noter ce rappel' using errcode = '42501';
  end if;
  insert into public.rappels_cibles (cible_id, objet, objet_id, canal) values (p_cible, p_objet, p_objet_id, p_canal)
  on conflict do nothing;
end $$;
revoke all on function public.noter_rappel(uuid, text, uuid, text) from public, anon;
grant execute on function public.noter_rappel(uuid, text, uuid, text) to authenticated;

-- SMS automatiques à envoyer (fonction Edge, rôle service). Jamais aux fiches de démonstration.
create or replace function public.donnees_rappels_sms(p_jour date default current_date)
returns setof public.rappel_cible
language sql stable security definer set search_path = public as $$
  select x.* from public.calcul_rappels_cibles(p_jour) x, public.reglages_rappels r
  where r.cibles_actif and r.sms_actif and x.canal = 'sms' and x.envoye_le is null
    and not exists (select 1 from public.donnees_demo d where d.nom_table = 'cibles' and d.id = x.cible_id::text)
$$;
revoke all on function public.donnees_rappels_sms(date) from public, anon, authenticated;
grant execute on function public.donnees_rappels_sms(date) to service_role;

