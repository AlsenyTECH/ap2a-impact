-- Rappels réglables (4/4) : planification au quart d'heure.

-- ---------------------------------------------------------------------
-- 7. Planification : tous les quarts d'heure, on lance ce qui est dû
-- ---------------------------------------------------------------------

-- Ce qui est dû à un moment donné (heure de Dakar), pas encore lancé.
-- Fenêtre de 2 heures : une panne courte est rattrapée, mais activer un rappel
-- l'après-midi ne déclenche pas d'envoi surprise ; il partira le jour suivant.
-- Les séances sont journalisées sur le jour des séances (et non le jour d'envoi) :
-- passer du « matin même » à « la veille » n'oublie ni ne double aucun jour.
create or replace function public.rappels_dus(p_moment timestamp default (now() at time zone 'Africa/Dakar'))
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(x.t order by x.t), '{}') from (
    select 'hebdo' as t, p_moment::date as j from public.reglages_rappels r
      where r.hebdo_actif and extract(isodow from p_moment)::int = r.hebdo_jour
        and p_moment::time >= r.hebdo_heure and p_moment::time < r.hebdo_heure + interval '2 hours'
    union all
    select 'seances', case when r.seances_veille then p_moment::date + 1 else p_moment::date end from public.reglages_rappels r
      where r.seances_actif and p_moment::time >= r.seances_heure and p_moment::time < r.seances_heure + interval '2 hours'
    union all
    select 'sms', p_moment::date from public.reglages_rappels r
      where r.cibles_actif and r.sms_actif and p_moment::time >= r.sms_heure and p_moment::time < r.sms_heure + interval '2 hours'
  ) x
  where not exists (select 1 from public.rappels_lancements l where l.type = x.t and l.jour = x.j)
$$;
revoke all on function public.rappels_dus(timestamp) from public, anon;
grant execute on function public.rappels_dus(timestamp) to authenticated;

create or replace function public.lancer_rappels_dus() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_moment timestamp := now() at time zone 'Africa/Dakar';
  v_type text;
  v_jour date;
  r public.reglages_rappels;
begin
  select * into r from public.reglages_rappels;
  foreach v_type in array public.rappels_dus(v_moment) loop
    v_jour := case when v_type = 'seances' and r.seances_veille then v_moment::date + 1 else v_moment::date end;
    insert into public.rappels_lancements (type, jour) values (v_type, v_jour) on conflict do nothing;
    if not found then continue; end if;
    perform net.http_post(
      url := 'https://mvdsoonjccvfkvvbqefn.supabase.co/functions/v1/rappels',
      headers := jsonb_build_object('content-type', 'application/json', 'x-cle-rappels', public.cle_rappels()),
      body := jsonb_build_object('type', v_type, 'jour', v_jour),
      timeout_milliseconds := 60000);
  end loop;
end $$;
revoke all on function public.lancer_rappels_dus() from public, anon, authenticated;

-- Ce qui est déjà parti aujourd'hui avec l'ancienne planification ne repart pas.
insert into public.rappels_lancements (type, jour)
select 'seances', (now() at time zone 'Africa/Dakar')::date
  where (now() at time zone 'Africa/Dakar')::time >= '06:13'
union all
select 'hebdo', (now() at time zone 'Africa/Dakar')::date
  where extract(isodow from now() at time zone 'Africa/Dakar') = 1 and (now() at time zone 'Africa/Dakar')::time >= '07:47'
on conflict do nothing;

do $$
begin
  -- Base locale de test : ni pg_cron ni pg_net.
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname in ('rappels-hebdo', 'rappels-seances');
  perform cron.schedule('rappels-auto', '1-59/15 * * * *', 'select public.lancer_rappels_dus()');
end;
$$;
