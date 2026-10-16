-- Thème de l'application choisi par chaque membre (vert des Parcelles ou
-- bleu du logo AP2A) : il le suit d'un téléphone à l'autre.
alter table public.membres add column if not exists theme text not null default 'parcelles'
  check (theme in ('parcelles', 'ap2a'));

create or replace function public.choisir_theme(p_theme text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_theme not in ('parcelles', 'ap2a') then
    raise exception 'Thème inconnu' using errcode = '22023';
  end if;
  update public.membres set theme = p_theme where user_id = auth.uid() and actif;
end $$;
revoke all on function public.choisir_theme(text) from public, anon;
grant execute on function public.choisir_theme(text) to authenticated;
