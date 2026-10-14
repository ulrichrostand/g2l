# API Gaming to Learn

Comptes (e-mail + mot de passe), inscriptions aux cours, compteur d'inscrits, sauvegarde de la progression dans le cloud.
Node 22, TypeScript, Fastify, PostgreSQL. Le site statique (dossier racine) reste indépendant : sans API, il fonctionne comme avant.

## Lancer en local

```sh
cd server
npm install            # .npmrc active legacy-peer-deps (conflit de pairs de vitest)
export DATABASE_URL=postgres://utilisateur:motdepasse@localhost:5432/g2l
export ALLOWED_ORIGINS=http://localhost:5173      # adresse du site (Vite en développement)
export COOKIE_SECURE=false                         # HTTP local uniquement
npm run build && npm start                         # applique les migrations puis écoute sur 127.0.0.1:3000
npm test                                           # tests sur une base PostgreSQL embarquée (PGlite)
```

## Configuration (variables d'environnement)

| Variable | Rôle | Défaut |
|---|---|---|
| `DATABASE_URL` | Connexion PostgreSQL (obligatoire) | |
| `ALLOWED_ORIGINS` | Origines du site autorisées à utiliser le cookie de session (obligatoire, https en production) | |
| `NODE_ENV` | `production` impose HTTPS et le cookie Secure | `development` |
| `HOST` / `PORT` | Adresse d'écoute | `127.0.0.1` / `3000` |
| `COOKIE_SECURE` | Cookie réservé à HTTPS (interdit de le couper en production) | `true` en production |
| `TRUST_PROXY` | Lire l'IP réelle derrière un reverse proxy de confiance | `false` |
| `SESSION_DAYS` | Durée d'une session | `30` |
| `MIGRATE_ON_START` | Appliquer les migrations au démarrage | `true` |

Une configuration invalide arrête le serveur avec un message clair.

## Routes

Toutes sous `/api`, en JSON. Les erreurs ont la forme `{ "error": { "code", "message" } }`.

| Méthode et route | Accès | Rôle |
|---|---|---|
| `GET /health` | public | Vérifie la base |
| `GET /courses/stats` | public | Nombre d'inscrits par cours (cache 30 s) |
| `POST /auth/register` | public | `{ email, password, courseId? }` : crée le compte, ouvre la session, inscrit au cours |
| `POST /auth/login` | public | `{ email, password }` |
| `POST /auth/logout` | session | Ferme la session |
| `GET /me` | session | Compte et cours suivis |
| `GET /me/export` | session | Toutes les données du compte (portabilité RGPD) |
| `DELETE /me` | session | `{ password }` : supprime le compte et tout ce qui s'y rattache (effacement RGPD) |
| `POST /courses/:courseId/enroll` | session | Inscription (idempotente) |
| `GET /progress/:courseId` | session | `{ version, updatedAt, data }`, ou 404 |
| `PUT /progress/:courseId` | session | `{ baseVersion, data }` : écriture conditionnelle, `409 conflict` avec la version en place si `baseVersion` est périmée |

Les cours acceptés sont listés dans `src/courses.ts` (un test du dépôt vérifie qu'ils correspondent au catalogue du site).

## Sécurité : ce qui est en place

- **Mots de passe** : Argon2id (paramètres minimaux OWASP), 10 à 128 caractères, mots de passe triviaux refusés. Jamais journalisés.
- **Sessions** : jeton de 256 bits dans un cookie `HttpOnly`, `Secure`, `SameSite=Lax` (préfixe `__Host-`). Seule l'empreinte SHA-256 est en base : une fuite de la base ne livre aucune session. 30 jours, 10 sessions par compte au plus, nouveau jeton à chaque connexion.
- **Connexion** : même réponse pour un e-mail inconnu et un mauvais mot de passe, même temps de réponse (empreinte factice) ; limite par IP et blocage temporaire par adresse après 10 échecs en 15 minutes.
- **CSRF** : l'en-tête `Origin` doit être une origine déclarée ; seul le JSON est accepté (pas de formulaire HTML venu d'un autre site).
- **Débit** : 300 requêtes/min par IP, 5 inscriptions/heure, 10 connexions/10 min.
- **Entrées** : validées avec zod (schémas stricts, champs inconnus refusés), requêtes SQL toujours paramétrées, corps limité (4 Ko pour les comptes, 256 Ko pour une progression).
- **En-têtes** : Helmet (CSP `default-src 'none'`, nosniff, HSTS).
- **Erreurs** : une erreur interne ne renvoie jamais de détail (ni SQL, ni chemin, ni identifiants).
- **Conteneur** : utilisateur sans privilèges, système de fichiers en lecture seule, aucune capacité Linux.

## Limites connues (v1)

- **Pas de « mot de passe oublié »** : il faut un envoi d'e-mails (SMTP). Un joueur qui oublie son mot de passe perd l'accès à son compte (sa progression reste dans son navigateur s'il l'a jouée là).
- **Pas de vérification de l'adresse e-mail** : n'importe qui peut s'inscrire avec l'adresse d'un autre. L'inscription révèle qu'une adresse existe déjà (limité par le débit).
- **Pas de connexion Google** (prévue après la v1).
- Le limiteur d'échecs par e-mail est en mémoire : valable pour une seule instance de l'API.
