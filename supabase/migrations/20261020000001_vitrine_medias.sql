-- Médias de la page publique de l'association : photos et vidéos choisies
-- par le bureau, publiées quand il le décide.
--
-- Fichiers dans le compartiment public « vitrine » (lisible par tous, car
-- affiché sur la page publique). Seuls l'admin et le bureau déposent,
-- modifient ou suppriment. Rien n'y est relié aux fiches des bénéficiaires.

create type public.emplacement_media as enum ('galerie', 'accueil', 'video', 'fondatrice');

create table public.vitrine_medias (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('photo', 'video', 'youtube')),
  -- galerie : la grille de photos ; accueil : fond du haut de page ;
  -- video : le film mis en avant ; fondatrice : portrait officiel autorisé.
  emplacement public.emplacement_media not null default 'galerie',
  chemin text check (chemin ~ '^[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm)$'),
  apercu text check (apercu ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$'),
  youtube_id text check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  titre text not null default '' check (length(titre) <= 120),
  legende text not null default '' check (length(legende) <= 400),
  ordre int not null default 0,
  publie boolean not null default false,
  cree_le timestamptz not null default now(),
  cree_par uuid references public.membres (id) on delete set null default public.mon_membre_id(),
  check ((type = 'youtube') = (youtube_id is not null)),
  check (type = 'youtube' or chemin is not null),
  check (type <> 'youtube' or emplacement = 'video')
);
create index on public.vitrine_medias (emplacement, ordre);

alter table public.vitrine_medias enable row level security;
grant select on public.vitrine_medias to anon, authenticated;
grant insert, update, delete on public.vitrine_medias to authenticated;

-- Le public ne voit que ce qui est publié ; le bureau voit tout.
create policy vitrine_lecture_public on public.vitrine_medias for select to anon
  using (publie);
create policy vitrine_lecture on public.vitrine_medias for select to authenticated
  using (publie or public.est_gestionnaire());
create policy vitrine_ajout on public.vitrine_medias for insert to authenticated
  with check (public.est_gestionnaire());
create policy vitrine_modif on public.vitrine_medias for update to authenticated
  using (public.est_gestionnaire()) with check (public.est_gestionnaire());
create policy vitrine_suppr on public.vitrine_medias for delete to authenticated
  using (public.est_gestionnaire());

-- Compartiment public : 50 Mo par fichier (au-delà, passer par YouTube).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vitrine', 'vitrine', true, 52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'])
on conflict (id) do nothing;

create policy vitrine_fichiers_lecture on storage.objects for select to authenticated
  using (bucket_id = 'vitrine' and public.est_gestionnaire());
create policy vitrine_fichiers_depot on storage.objects for insert to authenticated
  with check (bucket_id = 'vitrine' and public.est_gestionnaire());
create policy vitrine_fichiers_remplacement on storage.objects for update to authenticated
  using (bucket_id = 'vitrine' and public.est_gestionnaire()) with check (bucket_id = 'vitrine' and public.est_gestionnaire());
create policy vitrine_fichiers_suppr on storage.objects for delete to authenticated
  using (bucket_id = 'vitrine' and public.est_gestionnaire());
