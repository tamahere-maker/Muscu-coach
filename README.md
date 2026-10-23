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
- Inscription avec confirmation de l'adresse e-mail, mot de passe solide (8 caractères, majuscule, minuscule, chiffre, caractère spécial), « Mot de passe oublié ? » sur la page de connexion.
- « Mon compte » (`/compte`) : nom, changement d'adresse e-mail (confirmé par lien) et de mot de passe (mot de passe actuel demandé).

## E-mails des comptes

Les modèles en français sont dans `supabase/templates/`. Le sujet à utiliser est en commentaire en tête de chaque fichier. À coller dans Supabase, Authentication > Emails :

| Fichier | Modèle Supabase |
|---|---|
| `confirmation.html` | Confirm signup |
| `recovery.html` | Reset password |
| `email_change.html` | Change email address |
| `password_changed.html` | Security notifications > Password changed |
| `email_changed.html` | Security notifications > Email address changed |

Réglages Supabase nécessaires :

- Authentication > URL Configuration : Site URL `https://muscu-coach.optepia.workers.dev`, et dans Redirect URLs `https://muscu-coach.optepia.workers.dev/**` (et `http://localhost:5173/**` pour le local).
- Authentication > Emails > SMTP Settings : brancher Resend (hôte `smtp.resend.com`, port 465, utilisateur `resend`, mot de passe = clé API Resend, expéditeur sur un domaine vérifié dans Resend). Sans SMTP personnalisé, Supabase n'envoie que quelques e-mails par heure et seulement aux membres de l'organisation.
- Authentication > Sign In / Providers > Email : « Confirm email » activé, « Secure email change » activé, longueur minimale du mot de passe 8.

## Base de données

Les migrations sont appliquées dans l'ordre sur le projet Supabase :

1. `001_schema.sql` : tables, fonctions et règles d'accès
2. `002_exercices.sql` : 730 exercices (source Free Exercise DB, domaine public), noms en français. Nécessite temporairement l'extension `http`.
3. `003_aliments.sql` : 82 aliments, valeurs nutritionnelles indicatives
4. `004_droits_fonctions.sql` : fonctions réservées aux utilisateurs connectés
5. `005` à `013` : modèles, scan, bilans, suivi…
6. `014_coachs_associes.sql` : coachs associés (périmètre, part du paiement)
7. `015_messages.sql` : messagerie athlète ↔ coachs
8. `016_tableau_de_bord.sql` : tableau de bord du coach
9. `017_consignes_fr.sql` : consignes en français des 647 exercices qui n'en avaient pas

Les animations d'exercices sont des planches d'images dans `public/sprites/`.

## Mise en ligne

`npm run deploy` (nécessite `wrangler login`). Ensuite, renseigner l'adresse du site dans Supabase (Authentication > URL Configuration) pour que les liens de confirmation d'e-mail pointent vers l'app.
