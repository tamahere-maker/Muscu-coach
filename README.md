# Muscu Coach

Application web de coaching en musculation : programmes, suivi des séances, nutrition et compléments. Réservée aux athlètes suivis par un coach.

## Stack

- React + Vite (`src/`)
- Supabase : comptes, base Postgres, règles d'accès RLS (`supabase/migrations/`)
- Cloudflare Workers pour l'hébergement (`wrangler.jsonc`)

## Lancer en local

```bash
cp .env.example .env
npm install
npm run dev
```

## Fonctionnement des comptes

- Un coach crée son compte depuis l'accueil.
- Le coach invite un athlète depuis « Mes athlètes » : l'app génère un lien d'invitation à lui envoyer.
- L'athlète ouvre le lien, crée son compte athlète et accepte. Le premier coach qui l'invite devient son coach principal.
- Les athlètes ne peuvent pas créer de compte sans invitation.

## Base de données

Les migrations sont appliquées dans l'ordre sur le projet Supabase :

1. `001_schema.sql` : tables, fonctions et règles d'accès
2. `002_exercices.sql` : 730 exercices (source Free Exercise DB, domaine public), noms en français. Nécessite temporairement l'extension `http`.
3. `003_aliments.sql` : 82 aliments, valeurs nutritionnelles indicatives
4. `004_droits_fonctions.sql` : fonctions réservées aux utilisateurs connectés

Les animations d'exercices sont des planches d'images dans `public/sprites/`.

## Mise en ligne

`npm run deploy` (nécessite `wrangler login`). Ensuite, renseigner l'adresse du site dans Supabase (Authentication > URL Configuration) pour que les liens de confirmation d'e-mail pointent vers l'app.
