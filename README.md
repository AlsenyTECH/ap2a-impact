# AP2A — Actions et suivi d'impact

Application de l'Association Parcelles Assainies en Action (Dakar) : les
**cibles** (personnes, groupes, ASC, écoles…), les **actions** menées pour
elles (formations avec la 3FPT, kits, dépistages, distributions, nettoyage…),
ce que chaque bénéficiaire a **reçu**, et — en version 2 — ce qu'il en a fait.

- `supabase/` : base de données PostgreSQL (Supabase) — schéma, règles d'accès, référentiels
- `web/` : application React installable sur téléphone (PWA), hébergée sur Vercel

## Qui peut faire quoi

Les droits sont appliqués **par la base de données** (Row Level Security), pas par l'interface.

| Rôle | Droits |
|---|---|
| Administrateur | Tout, y compris attribuer les rôles |
| Bureau | Tout le contenu : membres, cibles, actions, partenaires |
| Coordinateur | Crée cibles et actions ; gère les actions dont il est responsable |
| Membre | Voit les actions ; voit les bénéficiaires seulement des actions où il est mobilisé |

Un compte sans fiche membre active (même email) n'a accès à rien.

## Suivi de l'impact (version 2)

Quand une action est **clôturée**, des suivis sont planifiés pour chaque bénéficiaire
(par défaut 3, 6 et 12 mois après la fin ; réglable par type d'action). Le **référent**
de la cible — à défaut le responsable de l'action — les retrouve dans la page *Suivis*
30 jours avant l'échéance, appelle ou écrit sur WhatsApp, et note la situation :
Réussi / En progrès / En difficulté / Perdu de vue, avec activité, revenu, emplois créés
et usage du kit. La page *Impact* agrège le dernier suivi de chaque bénéficiaire.

## En production

- Base : projet Supabase `ap2a-impact` (réf. `mvdsoonjccvfkvvbqefn`, région Paris)
- Application : projet Vercel `ap2a-impact`, déployé à chaque push sur `main`

## Mise en route (nouvelle installation)

1. **Supabase** : créer un projet, puis appliquer les fichiers de `supabase/migrations/` dans l'ordre
   (SQL Editor, ou `supabase db push`).
2. **Premier administrateur** : dans le SQL Editor,
   `insert into membres (prenom, nom, email, role) values ('Fatou Kiné', 'Diakhaté', 'son@email', 'admin');`
   puis, dans l'application, « Première connexion » avec cet email.
3. **Vercel** : importer le dépôt avec le dossier racine `web`, et les variables
   `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (voir `web/.env.example`).
4. Dans Supabase > Authentication > URL Configuration, mettre l'adresse Vercel comme *Site URL*.

Les autres membres sont ajoutés par le bureau (page Membres, avec leur email) ;
chacun active ensuite son accès avec « Première connexion ».

## Développement

```sh
cd web && cp .env.example .env.local   # renseigner l'URL et la clé du projet
npm install && npm run dev
```

Tests des règles d'accès (PostgreSQL local, Supabase imité) :

```sh
PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/lancer.sh
```
