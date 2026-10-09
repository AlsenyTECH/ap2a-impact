"""
Génère supabase/demo/donnees_demo.sql : un jeu de données fictif mais
réaliste (noms, unités des Parcelles Assainies, activités de l'AP2A) pour
découvrir l'application. Tout est enregistré dans `donnees_demo` et
s'efface depuis l'application (Accueil > Effacer la démonstration).

    python3 supabase/demo/generer.py

Le tirage est fixe (random.seed) : le fichier produit est toujours le même.
Les dates sont relatives au jour où le script SQL est exécuté.
"""

import random
import uuid
from pathlib import Path

random.seed(2026)
U = uuid.UUID
NS = U("6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d")


class R(str):
    """Expression SQL brute (non mise entre guillemets par q)."""


def uid(cle: str) -> R:
    """Identifiant d'une ligne, désigné par une clé courte (voir pg_temp.k)."""
    return R(f"pg_temp.k('{cle}')")


def q(v) -> str:
    """Littéral SQL."""
    if isinstance(v, R):
        return str(v)
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def jour(decalage: int) -> str:
    """Date relative à aujourd'hui (jours)."""
    return f"pg_temp.d({decalage})"


def zone(unite: int | None) -> str:
    return "null" if unite is None else f"pg_temp.z({unite})"


def categorie(libelle: str) -> str:
    return f"pg_temp.c({q(libelle)})"


def profil(genre: str, libelle: str) -> str:
    return f"pg_temp.p({q(genre[0])}, {q(libelle)})"


def type_action(code: str) -> str:
    return f"pg_temp.t({q(code)})"


sql: list[str] = []
demo: list[tuple[str, str]] = []


def enregistrer(table: str, id_: str):
    demo.append((table, id_))


def telephone() -> str:
    return f"{random.choice(['77', '78', '76', '70'])} {random.randint(100, 999)} {random.randint(10, 99)} {random.randint(10, 99)}"


# ---------------------------------------------------------------------
# Membres de l'association (sans compte de connexion)
# ---------------------------------------------------------------------
MEMBRES = [
    ("mariama", "Mariama", "Ba", "bureau", "Trésorière"),
    ("moussa", "Moussa", "Fall", "coordinateur", "Coordinateur formations"),
    ("awa", "Awa", "Ndiaye", "coordinateur", "Coordinatrice santé et social"),
    ("ibrahima", "Ibrahima", "Sarr", "coordinateur", "Coordinateur environnement"),
    ("khady", "Khady", "Sène", "membre", "Chargée de communication"),
    ("ousmane", "Ousmane", "Diouf", "membre", None),
    ("pape", "Pape", "Gueye", "membre", None),
]
for cle, prenom, nom, role, fonction in MEMBRES:
    i = uid(f"membre-{cle}")
    enregistrer("membres", i)
    sql.append(
        "insert into public.membres (id, prenom, nom, telephone, email, role, fonction, date_adhesion) values "
        f"({q(i)}, {q(prenom)}, {q(nom)}, {q(telephone())}, {q(cle + '@demo.ap2a.sn')}, {q(role)}, {q(fonction)}, {jour(-random.randint(200, 900))});"
    )
M = {cle: uid(f"membre-{cle}") for cle, *_ in MEMBRES}

# ---------------------------------------------------------------------
# Partenaires (la 3FPT existe déjà)
# ---------------------------------------------------------------------
PARTENAIRES = [
    ("hopital", "Clinique ophtalmologique partenaire (démo)", "COP", "Santé", "Dr Ndèye Mbaye"),
    ("banque", "Banque alimentaire de Dakar (démo)", "BAD", "Aide alimentaire", "Cheikh Kane"),
    ("mairie", "Services municipaux (démo)", None, "Collectivité", "Service social"),
    ("quincaillerie", "Quincaillerie Touba Parcelles (démo)", None, "Fournisseur de kits", "Modou Seck"),
]
for cle, nom, sigle, domaine, contact in PARTENAIRES:
    i = uid(f"partenaire-{cle}")
    enregistrer("partenaires", i)
    sql.append(
        "insert into public.partenaires (id, nom, sigle, domaine, contact_nom, telephone) values "
        f"({q(i)}, {q(nom)}, {q(sigle)}, {q(domaine)}, {q(contact)}, {q(telephone())});"
    )
P = {cle: uid(f"partenaire-{cle}") for cle, *_ in PARTENAIRES}
P["3fpt"] = None  # résolu en SQL
TROISFPT = "pg_temp.f()"


def partenaire(cle: str) -> str:
    return TROISFPT if cle == "3fpt" else q(P[cle])


# ---------------------------------------------------------------------
# Personnes
# ---------------------------------------------------------------------
PRENOMS_H = ["Mamadou", "Aliou", "Cheikh", "Modou", "Babacar", "Abdou", "Serigne", "Lamine", "Omar", "Assane", "Saliou", "Malick", "Bamba", "Idrissa", "Souleymane", "Alioune"]
PRENOMS_F = ["Aminata", "Fatou", "Ndeye", "Coumba", "Astou", "Rokhaya", "Bineta", "Sokhna", "Adama", "Dieynaba", "Mame Diarra", "Yacine", "Penda", "Maimouna", "Seynabou", "Oumy"]
NOMS = ["Diop", "Ndiaye", "Fall", "Sow", "Ba", "Gueye", "Faye", "Sarr", "Diallo", "Sy", "Mbaye", "Ndao", "Cissé", "Kane", "Thiam", "Seck", "Diouf", "Niang", "Camara", "Sène", "Dieng", "Mbengue", "Touré", "Lô"]
UNITES = [7, 9, 11, 13, 14, 15, 16, 17, 19, 22, 24, 25, 26]

personnes: dict[str, dict] = {}


def personne(cle: str, sexe: str, age: int, situation: str | None, metier=None, vulnerabilites=(), unite=None, referent=None, prenom=None, nom=None):
    prenom = prenom or random.choice(PRENOMS_F if sexe == "F" else PRENOMS_H)
    nom = nom or random.choice(NOMS)
    unite = unite or random.choice(UNITES)
    i = uid(f"personne-{cle}")
    enregistrer("cibles", i)
    vul = "'{" + ",".join('"' + v + '"' for v in vulnerabilites) + "}'"
    sql.append(
        f"select pg_temp.pers('personne-{cle}', {q(prenom)}, {q(nom)}, {q(sexe)}, {-age * 365 - random.randint(0, 300)}, {q(telephone())}, "
        f"{q(situation)}, {q(metier)}, {vul}, {q(unite)}, {q(referent)});"
    )
    personnes[cle] = {"id": i, "prenom": prenom, "nom": nom, "sexe": sexe, "unite": unite}
    return i


def collectif(cle: str, libelle_categorie: str, nom: str, effectif=None, responsable=None, precision=None, unite=None, referent=None, adresse=None):
    i = uid(f"cible-{cle}")
    enregistrer("cibles", i)
    sql.append(
        "insert into public.cibles (id, categorie_id, nom, effectif, responsable, sous_type, telephone, zone_id, adresse, referent_id) values "
        f"({q(i)}, {categorie(libelle_categorie)}, {q(nom)}, {q(effectif)}, {q(responsable)}, {q(precision)}, {q(telephone()) if responsable else 'null'}, "
        f"{zone(unite)}, {q(adresse)}, {q(M[referent]) if referent else 'null'});"
    )
    return i


def membre_de(personne_id: str, collectif_id: str, role: str | None = None):
    sql.append(f"insert into public.appartenances values ({q(personne_id)}, {q(collectif_id)}, {q(role)});")


# Jeunes formés en électricité (promotion terminée il y a ~8 mois)
elec = [personne(f"elec{n}", "M" if n < 7 else "F", random.randint(18, 27), random.choice(["En recherche d'emploi", "Sans activité", "Apprenti(e)"]),
                 "Électricité", ("Orphelin(e)",) if n == 3 else (), referent="moussa") for n in range(9)]
# Jeunes en formation plomberie (en cours)
plomb = [personne(f"plomb{n}", "M", random.randint(18, 26), "En recherche d'emploi", "Plomberie", referent="moussa") for n in range(6)]
# Femmes du GPF (couture)
couture = [personne(f"gpf{n}", "F", random.randint(22, 48), random.choice(["Au foyer", "À son compte (artisan, commerçant)", "Sans activité"]),
                    "Couture", ("Femme cheffe de ménage",) if n in (1, 4) else (), unite=17, referent="awa") for n in range(10)]
# Personnes âgées dépistées (cataracte)
cataracte = [personne(f"cata{n}", random.choice("FM"), random.randint(62, 80), "Retraité(e)",
                      vulnerabilites=("Personne âgée isolée",) if n % 3 == 0 else ("Maladie chronique",) if n % 3 == 1 else (), referent="awa") for n in range(7)]
# Joueurs de l'ASC
asc_joueurs = [personne(f"asc{n}", "M", random.randint(16, 28), random.choice(["Élève / étudiant(e)", "Apprenti(e)", "En recherche d'emploi"]), unite=22) for n in range(8)]

# ---------------------------------------------------------------------
# Ménages : chef obligatoire, autres membres parfois
# ---------------------------------------------------------------------
menages = []
for n in range(8):
    sexe = "F" if n % 3 == 0 else "M"
    chef = personne(f"chef{n}", sexe, random.randint(35, 68), random.choice(["Au foyer", "À son compte (artisan, commerçant)", "Sans activité", "Retraité(e)"]),
                    vulnerabilites=(("Femme cheffe de ménage", "Veuf / veuve") if sexe == "F" else ()) + (("Sinistré(e)",) if n >= 4 else ()),
                    unite=random.choice([11, 13, 17, 19, 22]), referent="awa")
    p = personnes[f"chef{n}"]
    m = uid(f"menage-{n}")
    enregistrer("cibles", m)
    sql.append(
        "insert into public.cibles (id, categorie_id, nom, telephone, effectif, zone_id, referent_id) values "
        f"({q(m)}, {categorie('Ménage')}, {q('Ménage ' + p['prenom'] + ' ' + p['nom'])}, {q(telephone())}, {random.randint(4, 11)}, {zone(p['unite'])}, {q(M['awa'])});"
    )
    membre_de(chef, m, "Chef de ménage")
    if n < 3:  # quelques ménages avec d'autres membres renseignés
        enfant = personne(f"enfant{n}", random.choice("FM"), random.randint(8, 16), "Élève / étudiant(e)", unite=p["unite"], nom=p["nom"])
        membre_de(enfant, m, "Enfant")
    menages.append(m)

# ---------------------------------------------------------------------
# Collectifs, structures, lieux
# ---------------------------------------------------------------------
gpf = collectif("gpf", "GPF (groupement de promotion féminine)", "GPF Jigeen Ñu Bokk", 34, "Ndeye Thiam", "Couture et teinture", 17, "awa")
for n, c in enumerate(couture):
    membre_de(c, gpf, ["Présidente", "Trésorière", "Secrétaire"][n] if n < 3 else "Membre")
gie = collectif("gie", "GIE (groupement d'intérêt économique)", "GIE Liggeey Ak Jom", 18, "Abdoulaye Sy", "Transformation de céréales locales", 13, "moussa")
for n, c in enumerate(elec[:3]):
    membre_de(c, gie, "Membre")
asc = collectif("asc", "ASC (association sportive et culturelle)", "ASC Jappo Unité 22", 60, "Lamine Cissé", "Football, Navétanes", 22, "ibrahima")
for n, c in enumerate(asc_joueurs):
    membre_de(c, asc, "Capitaine" if n == 0 else "Joueur")
dahira = collectif("dahira", "Dahira", "Dahira Nourou Darayni", 45, "Serigne Mbaye", None, 19, "awa")
ecole = collectif("ecole", "École élémentaire", "École élémentaire Unité 15", 640, "M. Diagne (directeur)", "12 classes", 15, "ibrahima")
poste = collectif("poste", "Poste de santé", "Poste de santé Unité 26", None, "Infirmier chef de poste", None, 26, "awa")
salubrite = collectif("salubrite", "Comité de salubrité / set-setal", "Comité set-setal Unité 17", 25, "Rokhaya Fall", None, 17, "ibrahima")
canal = collectif("canal", "Rue / canal", "Canal à ciel ouvert, Unité 17", precision="Bouché à chaque hivernage", unite=17, adresse="Le long de la route de l'Unité 17")
marche = collectif("marche", "Marché", "Marché de l'Unité 25", unite=25)
site_reboisement = collectif("reboisement", "Site de reboisement", "Allée de l'Unité 22", precision="Plantation de 150 arbres prévue", unite=22, referent="ibrahima")
zone_inondee = collectif("inondee", "Zone inondée / sinistrée", "Bas-fonds de l'Unité 11", precision="Inondé en août 2026", unite=11, referent="awa")

# ---------------------------------------------------------------------
# Actions (créées « en préparation », clôturées ensuite pour planifier
# les suivis automatiquement)
# ---------------------------------------------------------------------
actions: dict[str, str] = {}


def action(cle, code, titre, debut, fin, responsable, lieu=None, unite=None, budget=None, description=None, bilan=None, partenaires=(), equipe=()):
    i = uid(f"action-{cle}")
    enregistrer("actions", i)
    sql.append(
        "insert into public.actions (id, type_id, titre, description, date_debut, date_fin, lieu, zone_id, responsable_id, budget_fcfa, bilan) values "
        f"({q(i)}, {type_action(code)}, {q(titre)}, {q(description)}, {jour(debut)}, {jour(fin) if fin is not None else 'null'}, {q(lieu)}, {zone(unite)}, {q(M[responsable])}, {q(budget)}, {q(bilan)});"
    )
    for cle_p, role in partenaires:
        sql.append(f"insert into public.action_partenaires (action_id, partenaire_id, role) values ({q(i)}, {partenaire(cle_p)}, {q(role)});")
    for cle_m, role in equipe:
        sql.append(f"insert into public.action_equipe (action_id, membre_id, role) values ({q(i)}, {q(M[cle_m])}, {q(role)});")
    actions[cle] = i
    return i


beneficiaires: dict[tuple[str, str], str] = {}


def beneficiaire(action_cle, cible_id, statut="termine", via=None):
    i = uid(f"b-{action_cle}-{len(beneficiaires)}")
    sql.append(
        f"select pg_temp.benef({q(i.split(chr(39))[1])}, {q(action_cle)}, {q(cible_id.split(chr(39))[1])}, {q(statut)}, {q(via.split(chr(39))[1]) if via else 'null'});"
    )
    beneficiaires[(action_cle, cible_id)] = i
    return i


def apport(benef, nature, description, valeur=None, partenaire_cle=None, numero=None, decalage=0, quantite=None):
    sql.append(
        f"select pg_temp.apport({q(benef.split(chr(39))[1])}, {q(nature)}, {q(description)}, {q(valeur)}, {q(quantite)}, {q(partenaire_cle)}, {q(numero)}, {decalage});"
    )


def statut(action_cle, s):
    sql.append(f"update public.actions set statut = {q(s)} where id = {q(actions[action_cle])};")


# 1. Formation électricité (terminée il y a ~8 mois)
action("elec", "formation", "Formation électricité bâtiment — promotion 2025", -390, -250, "moussa",
       "Centre de formation 3FPT, Dakar", None, 4_500_000,
       "Formation de 4 mois en électricité bâtiment, certificat délivré par la 3FPT, puis remise d'un kit complet pour démarrer.",
       "9 jeunes inscrits, 8 ont terminé. Très bonne assiduité. Prévoir un module « gérer son activité » pour la prochaine promotion.",
       [("3fpt", "formateur"), ("quincaillerie", "prestataire")], [("moussa", "Responsable"), ("pape", "Logistique")])
for n, c in enumerate(elec):
    b = beneficiaire("elec", c, "abandon" if n == 8 else "termine")
    if n == 8:
        continue
    apport(b, "formation", "Formation électricité bâtiment (4 mois)", 350_000, "3fpt", decalage=-250)
    apport(b, "certificat", "Certificat de qualification — électricité bâtiment", None, "3fpt", f"3FPT-2025-{1040 + n}", decalage=-240)
    apport(b, "kit", "Kit d'électricien (outillage, multimètre, EPI)", 150_000, "quincaillerie", decalage=-235)
statut("elec", "terminee")

# 2. Couture avec le GPF (terminée il y a ~5 mois) : le GPF et ses membres
action("couture", "formation", "Formation couture et teinture — GPF Jigeen Ñu Bokk", -250, -160, "awa",
       "Siège du GPF, Unité 17", 17, 2_800_000, "Perfectionnement en couture et teinture, avec une machine à coudre par participante.",
       "Le GPF a ouvert un atelier collectif. 7 femmes sur 10 travaillent régulièrement.", [("quincaillerie", "prestataire")],
       [("awa", "Responsable"), ("khady", "Communication")])
b_gpf = beneficiaire("couture", gpf)
apport(b_gpf, "kit", "Local équipé : 2 tables de coupe, fer industriel", 400_000, decalage=-160)
for c in couture:
    b = beneficiaire("couture", c, via=gpf)
    apport(b, "kit", "Machine à coudre à pédale", 120_000, "quincaillerie", decalage=-160, quantite=1)
statut("couture", "terminee")

# 3. Dépistage cataracte (terminé il y a ~3,5 mois)
action("cataracte", "sante", "Dépistage gratuit de la cataracte", -110, -110, "awa", "Poste de santé Unité 26", 26, 1_500_000,
       "Journée de dépistage, puis prise en charge gratuite des opérations par la clinique partenaire.",
       "142 personnes dépistées, 7 opérées gratuitement.", [("hopital", "prestataire")], [("awa", "Responsable"), ("ousmane", "Accueil"), ("khady", "Accueil")])
b_poste = beneficiaire("cataracte", poste)
for c in cataracte:
    b = beneficiaire("cataracte", c)
    apport(b, "soin", "Opération de la cataracte (un œil)", 75_000, "hopital", decalage=-100)
statut("cataracte", "terminee")

# 4. Ramadan (terminé, pas de suivi individuel)
action("ramadan", "distribution", "Kits Ramadan 2026", -225, -225, "mariama", "Siège de l'association", 17, 1_200_000,
       "Distribution de kits alimentaires aux familles les plus vulnérables.", "8 familles servies en priorité, kits livrés à domicile pour les personnes âgées.",
       [("banque", "soutien")], [("mariama", "Responsable"), ("ousmane", "Distribution"), ("pape", "Distribution")])
for m in menages:
    b = beneficiaire("ramadan", m)
    apport(b, "don", "Kit Ramadan : riz 25 kg, huile 5 L, sucre, dattes", 35_000, "banque", decalage=-225, quantite=1)
statut("ramadan", "terminee")

# 5. Set-setal (terminé il y a 5 mois)
action("setsetal", "environnement", "Set-setal et curage du canal — Unité 17", -153, -153, "ibrahima", "Unité 17", 17, 250_000,
       "Journée de nettoyage avec le comité de salubrité et l'ASC.", "3 tonnes de déchets évacuées, canal dégagé avant l'hivernage.",
       [("mairie", "soutien")], [("ibrahima", "Responsable"), ("pape", "Matériel")])
for c in (canal, salubrite):
    beneficiaire("setsetal", c)
b_asc = beneficiaire("setsetal", asc)
apport(b_asc, "don", "Pelles, râteaux, brouettes, gants", 180_000, decalage=-153)
statut("setsetal", "terminee")

# 6. Réfection d'école (terminée il y a ~6 semaines)
action("ecole", "rehabilitation", "Réfection de 3 salles de classe — École Unité 15", -100, -40, "ibrahima", "École élémentaire Unité 15", 15, 1_800_000,
       "Toiture, peinture, tables-bancs et tableaux pour 3 salles avant la rentrée.", "Travaux terminés à temps pour la rentrée d'octobre.",
       [("mairie", "financeur")], [("ibrahima", "Responsable")])
b_ecole = beneficiaire("ecole", ecole)
apport(b_ecole, "financement", "Réfection de 3 salles (toiture, peinture)", 1_350_000, "mairie", decalage=-40)
apport(b_ecole, "don", "30 tables-bancs", 450_000, decalage=-40, quantite=30)
statut("ecole", "terminee")

# 7. Sinistrés des pluies (terminé il y a 5 semaines)
action("pluies", "sinistres", "Appui aux sinistrés des pluies — août 2026", -45, -34, "awa", "Unité 11 et Unité 13", 11, 900_000,
       "Pompage, matelas, kits d'hygiène et vivres pour les familles inondées.", None, [("banque", "soutien"), ("mairie", "soutien")], [("awa", "Responsable"), ("ousmane", "Terrain")])
beneficiaire("pluies", zone_inondee)
for m in menages[4:]:
    b = beneficiaire("pluies", m)
    apport(b, "don", "2 matelas, kit d'hygiène, sac de riz", 60_000, "banque", decalage=-36)
statut("pluies", "terminee")

# 8. Plomberie (en cours)
action("plomberie", "formation", "Formation plomberie sanitaire — promotion 2026", -38, 67, "moussa", "Centre de formation 3FPT, Dakar", None, 3_200_000,
       "Formation de 3 mois et demi ; kit de plombier remis à la fin.", None, [("3fpt", "formateur")], [("moussa", "Responsable")])
for c in plomb:
    beneficiaire("plomberie", c, "inscrit")
statut("plomberie", "en_cours")

# 9 et 10. En préparation
action("arbres", "environnement", "Reboisement de l'allée de l'Unité 22", 37, 37, "ibrahima", "Unité 22", 22, 600_000,
       "150 arbres (neems, filaos) avec l'ASC Jappo et les élèves.", None, [("mairie", "soutien")], [("ibrahima", "Responsable"), ("pape", "Logistique")])
beneficiaire("arbres", site_reboisement, "inscrit")
beneficiaire("arbres", asc, "inscrit")
action("cata2", "sante", "Dépistage de la cataracte — décembre", 64, 64, "awa", "Poste de santé Unité 26", 26, 1_500_000,
       "Deuxième journée de dépistage, ouverte aux Unités 24 à 26.", None, [("hopital", "prestataire")], [("awa", "Responsable")])

# ---------------------------------------------------------------------
# Suivis déjà faits (les suivis sont planifiés à la clôture)
# ---------------------------------------------------------------------
ACTIVITES_ELEC = [
    ("reussi", "Électricien à son compte", 150_000, 1),
    ("reussi", "Employé dans une entreprise de BTP", 120_000, 0),
    ("en_progres", "Petits chantiers dans le quartier", 60_000, 0),
    ("reussi", "Électricien à son compte, 2 apprentis", 220_000, 2),
    ("en_difficulte", "N'a pas trouvé de chantier, a vendu une partie du kit", None, 0),
    ("en_progres", "Stage dans une entreprise d'électricité", 40_000, 0),
    ("reussi", "Électricienne, installations domestiques", 130_000, 1),
    ("perdu_de_vue", None, None, None),
]


def suivi(action_cle, cible_id, mois, situation, activite=None, revenu=None, emplois=None, utilise=None, commentaire=None, retard=5, saisi="moussa"):
    b = beneficiaires[(action_cle, cible_id)]
    sql.append(
        f"select pg_temp.suivi({q(b.split(chr(39))[1])}, {mois}, {retard}, {q(situation)}, {q(activite)}, {q(revenu)}, {q(emplois)}, {q(utilise)}::boolean, {q(commentaire)}, {q(saisi)});"
    )


for n, c in enumerate(elec[:8]):
    sit, act, rev, emp = ACTIVITES_ELEC[n]
    # À 3 mois : tous suivis, la situation était encore en construction.
    sit3 = {"reussi": "en_progres", "en_progres": "en_progres", "en_difficulte": "en_difficulte", "perdu_de_vue": "en_difficulte"}[sit]
    suivi("elec", c, 3, sit3, "Démarre, cherche des chantiers" if sit3 == "en_progres" else "Pas encore d'activité", 30_000 if sit3 == "en_progres" else None, 0, True, retard=random.randint(2, 12))
    # À 6 mois : 6 sur 8 faits, 2 encore en retard.
    if n not in (2, 5):
        suivi("elec", c, 6, sit, act, rev, emp, None if sit == "perdu_de_vue" else sit != "en_difficulte",
              "Injoignable, a déménagé à Thiès selon sa famille" if sit == "perdu_de_vue" else None, retard=random.randint(1, 10))

for n, c in enumerate(couture):
    sit = ["reussi", "reussi", "en_progres", "reussi", "en_progres", "reussi", "en_difficulte", "reussi", "en_progres", "reussi"][n]
    suivi("couture", c, 3, sit, "Couturière à domicile" if sit != "en_difficulte" else "Machine en panne", [90_000, 75_000, 35_000, 110_000, 40_000, 80_000, None, 70_000, 30_000, 95_000][n],
          1 if n in (0, 3) else 0, sit != "en_difficulte", "A besoin d'une réparation de machine" if sit == "en_difficulte" else None, saisi="awa")
suivi("couture", gpf, 3, "reussi", "Atelier collectif ouvert 5 jours par semaine", 450_000, 3, True, "Commandes d'uniformes scolaires pour la rentrée", saisi="awa")

for n, c in enumerate(cataracte):
    sit = "perdu_de_vue" if n == 6 else "en_difficulte" if n == 4 else "reussi"
    suivi("cataracte", c, 1, sit, "Vue retrouvée, reprend ses activités" if sit == "reussi" else None, None, None, None,
          "Gêne persistante, revoir le médecin" if sit == "en_difficulte" else "Injoignable" if sit == "perdu_de_vue" else None, saisi="awa")

# ---------------------------------------------------------------------
PREAMBULE = """-- Identifiants déterministes : chaque partie du fichier peut s'exécuter seule.
create or replace function pg_temp.k(c text) returns uuid language sql immutable as $$ select md5('ap2a-demo:' || c)::uuid $$;
create or replace function pg_temp.d(n int) returns date language sql as $$ select current_date + n $$;
create or replace function pg_temp.z(u int) returns int language sql as $$
  select id from public.zones where chemin = 'Dakar > Dakar > Parcelles Assainies > Unité ' || u $$;
create or replace function pg_temp.c(l text) returns int language sql as $$ select id from public.categories_cible where libelle = l $$;
create or replace function pg_temp.p(g text, l text) returns int language sql as $$
  select id from public.profils_personne where left(genre, 1) = g and libelle = l $$;
create or replace function pg_temp.t(c text) returns int language sql as $$ select id from public.types_action where code = c $$;
create or replace function pg_temp.f() returns uuid language sql as $$ select id from public.partenaires where sigle = '3FPT' limit 1 $$;
create or replace function pg_temp.pers(cle text, pre text, nm text, sx text, naiss int, tel text, sit text, met text, vul text[], u int, ref text) returns void
language sql as $$
  insert into public.cibles (id, categorie_id, prenom, nom, sexe, date_naissance, telephone, situation_id, metier, vulnerabilites, zone_id, referent_id)
  values (pg_temp.k(cle), pg_temp.c('Personne'), pre, nm, sx, pg_temp.d(naiss), tel, pg_temp.p('s', sit), met,
          coalesce((select array_agg(pg_temp.p('v', v)) from unnest(vul) v), '{}'), pg_temp.z(u),
          case when ref is null then null else pg_temp.k('membre-' || ref) end) $$;
create or replace function pg_temp.benef(cle text, act text, cib text, st text, via text) returns void language sql as $$
  insert into public.beneficiaires (id, action_id, cible_id, statut, via_collectif_id)
  values (pg_temp.k(cle), pg_temp.k('action-' || act), pg_temp.k(cib), st::public.statut_beneficiaire,
          case when via is null then null else pg_temp.k(via) end) $$;
create or replace function pg_temp.apport(b text, nat text, descr text, val bigint, qte numeric, par text, num text, j int) returns void language sql as $$
  insert into public.apports (beneficiaire_id, nature, description, valeur_fcfa, quantite, partenaire_id, numero_document, date_remise)
  values (pg_temp.k(b), nat::public.nature_apport, descr, val, qte,
          case when par is null then null when par = '3fpt' then pg_temp.f() else pg_temp.k('partenaire-' || par) end, num, pg_temp.d(j)) $$;
create or replace function pg_temp.suivi(b text, mois int, retard int, sit text, act text, rev bigint, emp int, ut boolean, com text, par text) returns void language sql as $$
  update public.suivis set fait_le = least(current_date, date_prevue + retard), situation = sit::public.situation_suivi, activite = act,
    revenu_mensuel_fcfa = rev, emplois_crees = emp, utilise_apport = ut, commentaire = com, saisi_par = pg_temp.k('membre-' || par)
  where beneficiaire_id = pg_temp.k(b) and echeance_mois = mois $$;"""

REGISTRE = (
    "-- Registre : tout ce qui a été créé pourra être effacé depuis l'application.\n"
    "insert into public.donnees_demo (nom_table, id) select t, pg_temp.k(c)::text from (values\n"
    + ",\n".join(f"  ({q(t)}, {q(i.split(chr(39))[1])})" for t, i in demo)
    + "\n) as v(t, c) on conflict do nothing;"
)

# Découpage en parties autonomes (chacune dans sa transaction).
TAILLE = 15000
parties, courante = [], []
for instr in sql + [REGISTRE]:
    if courante and sum(len(x) for x in courante) + len(instr) > TAILLE:
        parties.append(courante)
        courante = []
    courante.append(instr)
parties.append(courante)


entete = "-- Fichier généré par supabase/demo/generer.py — ne pas modifier à la main.\n-- Données fictives de démonstration (noms et numéros inventés).\n"
contenu = entete + "\n".join(
    f"-- ===== PARTIE {n + 1}/{len(parties)} =====\n" + PREAMBULE + "\nbegin;\n" + "\n".join(partie) + "\ncommit;"
    for n, partie in enumerate(parties)
) + "\n"
Path(__file__).with_name("donnees_demo.sql").write_text(contenu, encoding="utf-8")
print(f"{len(sql)} instructions, {len(demo)} lignes de démonstration, {len(contenu)} caractères, {len(parties)} parties")
