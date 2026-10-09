-- =====================================================================
-- Catégories de cibles, ménages et profils des personnes.
--
-- Chaque cible a une CATÉGORIE (ASC, GIE, école, dahira...), rangée dans
-- une FAMILLE (Sport et culture, Groupements économiques...). Familles et
-- catégories sont modifiables par le bureau. La catégorie fixe la NATURE
-- de la cible, qui décide des champs à remplir :
--   personne  : un individu (situation, métier, vulnérabilités)
--   menage    : une famille, avec son chef de ménage (autres membres facultatifs)
--   collectif : un groupe dont on enregistre les membres (ASC, GIE, GPF...)
--   structure : un établissement (école, poste de santé...)
--   lieu      : un endroit (marché, zone inondée...)
-- =====================================================================

-- Étape 1/4 : nouvelles natures.
--
-- Les migrations passent par un outil qui demande une confirmation humaine
-- pour toute suppression (DROP) : elles n'en contiennent donc aucune. Les
-- anciennes valeurs du type (groupe, asc, etablissement, organisation,
-- zone_sinistree) restent déclarées mais ne sont plus utilisées.
-- =====================================================================

alter type type_cible add value if not exists 'menage';
alter type type_cible add value if not exists 'collectif';
alter type type_cible add value if not exists 'structure';
alter type type_cible add value if not exists 'lieu';
