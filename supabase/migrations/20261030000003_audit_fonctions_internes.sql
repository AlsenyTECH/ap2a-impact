-- Audit : fonctions internes que ni l'application ni les règles d'accès n'appellent.
-- Elles restent utilisables par les autres fonctions de la base et les tâches planifiées.
revoke execute on function public.rappels_dus(timestamp without time zone) from public, anon, authenticated;
revoke execute on function public.acces_action(uuid) from public, anon, authenticated;
revoke execute on function public.responsable_action(uuid) from public, anon, authenticated;
