-- Affichage clair, sombre, ou comme le téléphone : choisi par chaque membre,
-- il le suit d'un appareil à l'autre.
alter table public.membres add column if not exists mode text not null default 'clair'
  check (mode in ('clair', 'sombre', 'auto'));

create or replace function public.choisir_mode(p_mode text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_mode not in ('clair', 'sombre', 'auto') then
    raise exception 'Affichage inconnu' using errcode = '22023';
  end if;
  update public.membres set mode = p_mode where user_id = auth.uid() and actif;
end $$;
revoke all on function public.choisir_mode(text) from public, anon;
grant execute on function public.choisir_mode(text) to authenticated;
