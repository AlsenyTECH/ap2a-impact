-- Page publique : le visiteur sans compte ne lit que les colonnes affichées,
-- pas l'identifiant du membre qui a déposé le média.
revoke select on public.vitrine_medias from anon;
grant select (id, type, emplacement, chemin, apercu, youtube_id, titre, legende, ordre, publie, cree_le)
  on public.vitrine_medias to anon;
