-- Fonction de déclencheur : pas d'appel direct par l'API.
revoke execute on function public.kits_sortie_remise() from public, anon, authenticated;
