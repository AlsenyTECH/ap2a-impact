-- Planification des rappels : pg_cron appelle la fonction Edge « rappels ».
-- La clé qui authentifie ces appels est tirée au hasard et gardée dans le coffre (Vault) ;
-- la fonction Edge la relit avec le rôle service. Rien n'est stocké en clair dans le dépôt.

create or replace function public.cle_rappels()
returns text language plpgsql stable security definer set search_path = public as $$
begin
  return (select decrypted_secret from vault.decrypted_secrets where name = 'rappels_cle' limit 1);
end;
$$;
revoke all on function public.cle_rappels() from public, anon, authenticated;
grant execute on function public.cle_rappels() to service_role;

do $$
begin
  -- Base locale de test : ni pg_cron ni pg_net, on s'arrête là.
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    return;
  end if;
  create extension if not exists pg_net;
  create extension if not exists pg_cron;

  if not exists (select 1 from vault.secrets where name = 'rappels_cle') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'rappels_cle', 'Authentifie les appels de pg_cron à la fonction rappels');
  end if;

  -- Heure de Dakar = UTC. Lundi 7h47 : suivis de la semaine. Chaque jour 6h13 : séances du jour.
  perform cron.schedule('rappels-hebdo', '47 7 * * 1', $job$
    select net.http_post(
      url := 'https://mvdsoonjccvfkvvbqefn.supabase.co/functions/v1/rappels',
      headers := jsonb_build_object('content-type', 'application/json', 'x-cle-rappels', public.cle_rappels()),
      body := '{"type":"hebdo"}'::jsonb,
      timeout_milliseconds := 60000)
  $job$);
  perform cron.schedule('rappels-seances', '13 6 * * *', $job$
    select net.http_post(
      url := 'https://mvdsoonjccvfkvvbqefn.supabase.co/functions/v1/rappels',
      headers := jsonb_build_object('content-type', 'application/json', 'x-cle-rappels', public.cle_rappels()),
      body := '{"type":"seances"}'::jsonb,
      timeout_milliseconds := 60000)
  $job$);
end;
$$;
