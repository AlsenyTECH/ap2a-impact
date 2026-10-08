-- Imitation minimale de Supabase pour tester les migrations sur un
-- PostgreSQL ordinaire : rôles, auth.users, auth.uid(), storage.
-- Les rôles sont globaux au serveur : créés une seule fois.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
  end if;
end $$;
create schema extensions;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets, name text);
alter table storage.objects enable row level security;
grant usage on schema public, auth, storage, extensions to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant select, insert, delete on storage.objects to authenticated;
