# Contribuer

Merci de vouloir aider. Les idées, les corrections de contenu et le code sont les bienvenus. **Rien n'est publié sur le site sans validation du mainteneur.**

*English version: [CONTRIBUTING.en.md](CONTRIBUTING.en.md).*

## Comment ça se passe

1. **Une idée, une faute, une question pédagogique mal formulée ?** Ouvre une *issue* (onglet « Issues » > « New issue ») avec le bon modèle. Aucun code nécessaire.
2. **Tu veux proposer un changement toi-même ?** Fais une *pull request* :
   1. « Fork » le dépôt sur ton compte.
   2. Crée une branche : `git checkout -b ma-correction`.
   3. Fais ton changement et lance les contrôles (voir plus bas).
   4. Pousse sur ton fork et ouvre une *pull request* vers `main`.
3. Les contrôles automatiques (types, tests, build) s'exécutent sur ta pull request.
4. Le mainteneur relit, peut demander des changements, puis fusionne. Seule la fusion met le site à jour.

Personne d'autre que le mainteneur ne peut modifier `main` directement.

## Avant d'ouvrir une pull request

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Les trois doivent passer. Un changement visuel : joins une capture d'écran (ordinateur et mobile).

## Ce qui est le plus utile

- **Contenu pédagogique** : un énoncé ambigu, une explication fausse ou trop compliquée pour un débutant, une commande acceptée à tort ou refusée à tort. Le contenu est dans `src/content/` (leçons, défis) et `src/content/scenarios.ts` (terminaux pratiques).
- **Accessibilité et mobile** : tout ce qui est difficile à lire ou à toucher.
- **Bugs reproductibles** : décris l'appareil, le navigateur et les étapes.

Pour une grosse fonctionnalité (nouveau parcours, nouveau mécanisme de jeu), **ouvre d'abord une issue** pour qu'on en discute : ça évite un long travail refusé.

## Traductions

Le site existe en français et en anglais. Une correction de traduction est une contribution précieuse : le contenu est dans
`src/content/en/` (anglais) et `src/content/fr/` (français), l'interface dans `src/i18n/messages/`. Lis `src/i18n/GLOSSARY.md`
avant de proposer un changement de vocabulaire. Les deux langues doivent garder la même structure : les tests le vérifient. Une relecture de l'anglais par un anglophone natif est particulièrement bienvenue.

## Règles de code

- TypeScript strict, noms explicites, petites fonctions, erreurs gérées explicitement (jamais de `catch` vide).
- Aucun `innerHTML` : le texte passe par `textContent` ou les helpers de `src/ui/dom.ts`.
- Aucune dépendance ajoutée sans en discuter (poids, licence, maintenance).
- Aucun secret, jeton ou identifiant dans le code ou dans une capture.
- Aucun emoji dans l'interface. Textes en français, termes techniques en anglais.
- Tests pour la logique ajoutée ou corrigée (`tests/`).

## Images, sons, polices, modèles 3D

N'ajoute que ce que tu as le droit de redistribuer (licence libre, ou ta propre création), et indique la source et la licence dans la pull request.

## Droits sur ta contribution

En ouvrant une pull request, tu confirmes que tu es l'auteur du contenu (ou que tu as le droit de le proposer) et que tu acceptes qu'il soit intégré au projet et exploité avec lui, y compris à des fins commerciales (par exemple si le site accueille un jour de la publicité). Si tu n'es pas d'accord, n'ouvre pas de pull request : une issue reste possible.

## Sécurité

Une faille ? **Ne l'écris pas dans une issue publique.** Voir [SECURITY.md](SECURITY.md).

## Comportement

Voir [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). En bref : respect, critique du travail et non de la personne.
