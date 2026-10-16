-- Le bleu du logo AP2A devient le thème par défaut ; le vert des Parcelles
-- reste au choix. Personne n'avait encore choisi : tout le monde passe au bleu.
alter table public.membres alter column theme set default 'ap2a';
update public.membres set theme = 'ap2a' where theme = 'parcelles';
