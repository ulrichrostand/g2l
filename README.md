# SHADOW OPS — DevOps Infiltration

Jeu d'infiltration **3D** (façon *Splinter Cell*) pour apprendre le DevOps en suivant la roadmap
[roadmap.sh/devops](https://roadmap.sh/devops).

> Le collectif ENTROPIA a pris le contrôle de l'infrastructure d'Helix Corp. Tu es **Spectre**,
> agent de la cellule Écho. Traverse 16 secteurs, pirate leurs terminaux en maîtrisant les notions
> DevOps, et reste dans l'ombre.

## Principe

Pensé pour un **grand débutant** : aucune connaissance requise, on part de « c'est quoi un serveur ? ».

- **1 module de la roadmap = 1 mission** dans un complexe 3D généré (salles, couloirs, racks serveurs).
- **Apprendre** : chaque mission contient **5 dossiers jaunes** à ramasser. Chacun est une leçon courte :
  explication simple, analogie de la vie courante, exemple de commande, point à retenir.
- **Prouver** : **5 terminaux** à pirater, un par leçon (QCM, commande à taper, étapes à remettre dans l'ordre).
  Un terminal est **verrouillé tant que sa leçon n'a pas été lue** : le 1er dossier trouvé ouvre la leçon 1 et débloque le
  terminal 1, le 2e dossier le terminal 2, etc. (`src/game/dossierLessons.ts`). Un terminal verrouillé affiche « dossier
  manquant » en jaune, sans mettre la mission en pause ; les dossiers sont les points jaunes de la mini-carte. La console
  principale n'a pas de dossier et n'est jamais verrouillée. Jamais de question sans cours, et le dossier reste consultable
  pendant la question.
- **Pratiquer** : chaque secteur a une **console principale** (terminal bleu) : un vrai incident à résoudre
  en enchaînant 4 à 6 commandes dans un faux terminal qui répond comme les vrais outils
  (installer et vérifier nginx, publier un correctif avec Git, diagnostiquer le réseau couche par couche,
  déployer un conteneur, `terraform plan/apply`, réparer une CI rouge, sauver un pod en `CrashLoopBackOff`…).
  Historique avec les flèches, `command not found` pour une faute de frappe, solution proposée après 2 erreurs.
- **Combattre** (inspiré des jeux de tir vus de dessus) :
  - **Pistolet à visée libre** : clic droit maintenu pour épauler (laser, tir précis, déplacement lent),
    clic gauche ou Espace pour tirer là où pointe la souris. **On peut rater** : la balle part dans l'axe visé,
    avec une dispersion qui grandit en marchant, en courant, en tirant à la hanche ou en enchaînant les tirs ;
    les murs et les racks arrêtent les balles. Chargeur de 8 (R pour recharger), réserve rechargée par les terminaux.
  - **Une balle qui touche suspend la sentinelle** (signal `SIGSTOP`) : à genoux, elle ne voit plus et ne tire plus
    pendant 10 s. **Seulement alors**, F ouvre le gadget pour la **terminer avec une vraie commande** :
    on lit `ps aux` (la ligne en état `T`) et on tape `kill <PID>`, puis `docker stop <nom>` (conteneur `Paused`)
    et `kubectl delete pod <nom>` au fil des modules. Sans balle au but, pas de commande.
    Une mauvaise commande fait du bruit et réveille le processus plus tôt. Les secteurs avancés ont un **bouclier** (2 ou 3 balles).
  - **Les sentinelles ripostent quand elles te voient** : alarme, les sentinelles proches convergent, tirent des balles
    visibles (on peut les esquiver ou se mettre à couvert), te poursuivent puis fouillent la zone. Santé qui remonte
    après quelques secondes à l'abri ; à zéro, une vie en moins et retour au point d'insertion.
  - **Neutralisation silencieuse** (E) : approche une sentinelle calme par derrière.
  - **Caméras** : une balle les brouille 12 s ; à partir du module GATEWAY, F permet ensuite de les couper
    définitivement au **pare-feu** (`tcpdump` puis `ufw deny from <IP>` ou `iptables … -j DROP`).
  - Retours visuels et sonores : traçantes, flash du canon, étincelles, marqueur de touche, pictogrammes « ? », « ! » et « ⏸ »
    au-dessus des sentinelles, voile rouge quand on est touché, caméra qui anticipe la visée.
- Les **sentinelles** ont un **cône de vision** visible, bloqué par les murs et les racks. S'accroupir réduit leur portée, courir fait du bruit.
- Les **caméras de surveillance** (dès le module 1) balaient la salle : si elles te voient trop longtemps, c'est l'alerte.
- En fin de mission : **débriefing** (score, étoiles, dossiers, neutralisations, statut « Fantôme »),
  **récapitulatif**, **tous les dossiers du module** et **revue de chaque terminal**. Le cours reste consultable depuis la carte.
- **Boss de fin de secteur** : une fois tous les terminaux piratés, un boss se réveille dans la salle d'extraction
  (Processus Zombie, Fork Bomb, Merge Conflict, 502 Bad Gateway, OOMKiller, CrashLoopBackOff… jusqu'à ENTROPIA).
  3 phases : on brise son armure au pistolet en esquivant ses salves annoncées (rafales, éventails, anneaux, spirales),
  puis, quand il est à genoux, on l'achève avec **une vraie commande du module** en lisant la sortie du terminal
  (ex. `ps aux`, puis `kill <PID>`, puis `kill -9 <PID>`). Indice après une erreur, commande montrée après deux.
  L'extraction ne s'ouvre qu'une fois le boss vaincu.
- **Créateur d'agent façon Sims / Lagos Life** : carrure, taille, teinte de peau, 10 coiffures (afro, tresses, locs, chignon,
  gele…), hauts (gilet tactique, sweat, t-shirt, veste, boubou) avec motifs (ankara, aso-oke, camouflage, rayures, circuit),
  bas, chaussures, accessoires (sac, casque radio, lunettes, casquette) et couleurs libres, avec aperçu 3D en direct
  qu'on fait tourner au doigt ou à la souris. Proposé au premier lancement, modifiable depuis l'écran titre,
  et conservé dans la sauvegarde (y compris le code de transfert).
- Personnages 3D stylisés : visage, coiffures et vêtements modélisés, sentinelles robotisées aux coques arrondies.
- **Mode examen** (carte des opérations) : pour chaque module terminé, un examen chronométré de 8 questions
  (les 5 défis + 3 commandes de pratique tirées au sort, formulées sans donner la commande), et un
  **examen général** de 12 questions mélangeant tous les secteurs libérés. Une seule réponse par question,
  aucun indice, **note sur 20** avec mention, **correction détaillée** à la fin, meilleure note sauvegardée.
- **Son** : ambiance de salle serveur entièrement synthétisée (bourdonnement, ventilation, bips de machines)
  avec un **bourdon de tension qui monte quand tu es repéré**. Activable/désactivable depuis l'écran titre ou la pause.
- **Sauvegarde** :
  - automatique à chaque terminal piraté, dossier ramassé, sentinelle neutralisée et à chaque pause (témoin « 💾 Sauvegardé ») ;
  - **reprise de mission** depuis l'écran titre ou la carte, exactement où tu l'as laissée ;
  - **code de sauvegarde** (menu 💾 Sauvegarde) à copier puis importer pour passer du téléphone au PC.
    Le code est vérifié (somme de contrôle + validation stricte du contenu) avant d'être importé.

## Parcours (aligné sur roadmap.sh/devops)

| # | Mission | Section de la roadmap |
|---|---------|-----------------------|
| 0 | GENESIS | Introduction : serveur, Dev + Ops, terminal, automatisation (tutoriel) |
| 1 | KERNEL | Learn a Programming Language · Operating System |
| 2 | SHELL | Terminal Knowledge (bash, texte, processus, perf, réseau, éditeurs) |
| 3 | BRANCH | Version Control Systems · VCS Hosting |
| 4 | PACKET | Networking & Protocols (OSI, DNS, HTTP/S, TLS, SSH, mail) |
| 5 | GATEWAY | What is and how to setup X (proxies, LB, cache, firewall, Nginx) |
| 6 | CONTAINER | Containers (Docker, LXC) |
| 7 | NIMBUS | Cloud Providers · Serverless |
| 8 | BLUEPRINT | Provisioning (Terraform, Pulumi, CloudFormation, CDK) |
| 9 | PUPPETEER | Configuration Management (Ansible, Chef, Puppet, Salt) |
| 10 | PIPELINE | CI/CD Tools · Artifact Management |
| 11 | VAULT | Secret Management |
| 12 | HELM | Container Orchestration (Kubernetes, EKS/GKE/AKS, ECS…) |
| 13 | SYNC | GitOps · Service Mesh |
| 14 | WATCHTOWER | Infrastructure Monitoring · Logs Management · Observability |
| 15 | ARCHITECT | Cloud Design Patterns |

L'ordre suit la roadmap, avec deux ajustements pédagogiques : le réseau est vu avant les proxies,
et les conteneurs avant le cloud (prérequis du serverless et de Kubernetes).

## Commandes

| Touche | Action |
|--------|--------|
| ZQSD / WASD / flèches | Se déplacer (touches physiques : AZERTY et QWERTY) |
| Clic droit (maintenu) | Viser : laser, tir précis, déplacement lent |
| Clic gauche / Espace | Tirer vers le curseur (on peut rater) |
| R | Recharger |
| F | Terminer avec une vraie commande la cible qu'on vient de toucher |
| Maj | Courir (bruyant, tir imprécis) |
| C | S'accroupir (discret, tir plus précis) |
| E | Pirater un terminal / ouvrir la console principale / neutraliser une sentinelle par derrière |
| N | Vision nocturne |
| Échap | Pause |

**Sur mobile / tablette** (détecté automatiquement) : joystick flottant sous le pouce gauche
(le pousser au-delà de l'anneau fait courir), boutons à droite : Pirater/Neutraliser (selon
la situation), **pad de tir** (glisser le pouce pour viser avec le laser, relâcher pour tirer ; une tape tire droit devant),
Gadget (actif sur une cible touchée), Accroupir, Vision, Pause. La caméra recule automatiquement en mode portrait.

## Lancer le projet

```bash
npm ci
npm run dev        # serveur de développement
npm test           # tests unitaires (vitest)
npm run build      # typecheck + build de production dans dist/
npm run preview    # sert le build
```

Le workflow `.github/workflows/ci.yml` lance typecheck, tests et build à chaque PR, puis déploie
sur **GitHub Pages** à chaque push sur `main` (activer *Settings → Pages → Source : GitHub Actions*).

## Architecture

```
src/
  combat/      balistique (tir, dispersion, chargeur, projectiles), gadgets-commandes et identités des cibles
  core/        grille, pathfinding BFS, ligne de vue DDA, RNG déterministe, entrées, sons + ambiance, réglages
  level/       génération procédurale BSP + construction de la scène Three.js
  avatar/      apparence personnalisable : données validées (et migration des anciennes), personnage humain glTF, agent procédural de repli
  render/      pipeline de rendu (bloom, vignette, ombres) selon la qualité, studio 3D du créateur d'agent
  entities/    joueur, sentinelles (ronde, alerte, combat, fouille, suspendue), boss, caméras, effets de combat, terminaux, dossiers
  game/        boucle de mission, difficulté, score, examen, progression, points de reprise, code de sauvegarde
  challenges/  évaluation des réponses et des commandes de scénario (pure, testée)
  content/     les 16 modules (leçons, questions, explications), leurs interventions pratiques et leurs boss
  ui/          HUD + minimap, écrans, panneaux (leçon, piratage, console, gadget, boss, examen), créateur d'agent, contrôles tactiles
tests/         niveaux, IA et combat, boss, balistique, avatar et créateur, caméras, gadgets, scénarios, examen, ambiance, contenu, score, sauvegarde, tactile
```

Ajouter ou modifier une notion = éditer un fichier de `src/content/modules/` ; le test
`tests/logic.test.ts` vérifie la cohérence du contenu (index de bonne réponse, commandes acceptées…).
Les interventions pratiques sont dans `src/content/scenarios.ts` : une étape avec un champ `exam`
devient aussi une question d'examen (`tests/exam.test.ts` vérifie qu'elle ne donne pas la réponse
et qu'aucune commande n'est posée deux fois).

### Graphismes

- Post-traitement : **bloom** (néons, écrans, visières, LED), vignettage, ton ACES.
- **Ombres douces** dynamiques autour du joueur (qualité haute).
- Décor procédural (aucune image à télécharger) : murs en panneaux avec bande lumineuse,
  sol métallique, réglettes et flaques de lumière, néons qui grésillent, câbles, grilles,
  poussière en suspension, **couleur d'ambiance propre à chaque secteur**.
- **Agent du joueur : humain riggé en glTF** (corps, tête et vêtements Quaternius, CC0) animé par
  `AnimationMixer` : repos, marche, trottinement, sprint, accroupi, visée et tir au pistolet (buste et jambes
  mêlés séparément). **Créateur « façon Sims »** sur ce même modèle : silhouette homme ou femme, carrure,
  taille, peau, 5 coupes, barbe, couleurs du gilet, de la chemise, du pantalon, des bottes et des optiques,
  appliquées en direct sans reconstruire le personnage. Si le modèle ne charge pas, un agent procédural
  simplifié prend le relais.
- **Sentinelles androïdes** sur le même squelette (mannequin Quaternius, CC0) : métal anthracite et lignes
  rouges lumineuses, elles marchent en ronde, courent et tirent en combat, tombent à genoux une fois
  suspendues (lignes bleues) et s'effondrent neutralisées. On les distingue de l'agent d'un coup d'œil.
- **Boss androïdes géants** (~3 m) sur le même squelette : épaulières, plastron, réacteur dorsal et canon au
  bras dans la couleur du boss. Les plaques tombent à mesure que l'armure baisse ; les articulations et les
  évents s'illuminent pendant la charge d'une salve ; agenouillé en veille et quand il est exposé, effondré vaincu.
- **Tutoriel guidé** au premier secteur d'une campagne neuve : 7 étapes (se déplacer, ramasser un dossier, pirater
  un terminal, viser, tirer, s'accroupir, neutraliser une sentinelle), chacune validée par le geste réellement
  fait, avec la consigne du clavier ou du tactile et un repère (anneau ou flèche au bord de l'écran) sur la cible.
  « Passer le tutoriel » à tout moment ; il ne se rejoue pas (sauf après « Réinitialiser la progression »).
- L'agent **recule sous les impacts** et **s'effondre** à zéro de santé avant l'écran « À terre ».
- Cônes de vision en dégradé ; écrans de terminaux animés.
- **Qualité réglable** (Haute / Moyenne / Basse) depuis l'écran titre ou la pause, choisie
  automatiquement (Moyenne sur mobile) et **abaissée automatiquement** si le jeu passe sous ~40 images/s.
  En **Basse**, les sentinelles et le boss restent de simples robots procéduraux (pas d'androïde animé à
  65 os, et `sentinel.glb` n'est même pas téléchargé) ; passer en Basse en pleine mission, à la main ou
  automatiquement, les remplace immédiatement.

**Mes compétences** (depuis l'accueil ou la carte) : bilan par secteur (À faire, À consolider, Acquis, Maîtrisé),
moyenne des examens, et liste des notions à revoir avec leur point clé. Une notion est « à revoir » si son défi a
été raté au moins une fois lors de la dernière mission du secteur (champ `missed` de la sauvegarde, facultatif).

### Contribuer

Idées, corrections de contenu et code sont les bienvenus : voir [CONTRIBUTING.md](CONTRIBUTING.md). Tout passe par une issue ou une
pull request, relue et validée par le mainteneur avant publication. Faille de sécurité : [SECURITY.md](SECURITY.md).

### Langues (français et anglais)

Le site est bilingue, **une URL par langue** : `/` (français) et `/en/` (anglais) pour le portail, `/jeux/devops/` et `/en/games/devops/`
pour le jeu. La langue d'une page est son attribut `<html lang>`, lu une fois au chargement (`src/i18n/lang.ts`). Un sélecteur FR / EN
(`src/i18n/switcher.ts`) est dans le portail et sur l'écran titre ; le choix est mémorisé (`localStorage`, clé `site-lang`). À la
première visite sur l'accueil français, un navigateur anglophone est redirigé vers `/en/` (jamais l'inverse, jamais en boucle).

- **Interface** : textes dans des catalogues typés `src/i18n/messages/<zone>.ts` (`createTranslator`), le catalogue anglais doit avoir
  exactement les clés et les `{paramètres}` du français (erreur de compilation sinon, et `tests/i18n.test.ts`).
- **Contenu pédagogique** : `src/content/fr/` (source) et `src/content/en/` (traduction), mêmes identifiants, mêmes nombres de leçons,
  défis, étapes et phases ; `tests/contentLanguages.test.ts` vérifie la parité, que chaque commande acceptée l'est bien, et l'absence
  de français dans l'anglais. Guide de traduction : `src/i18n/GLOSSARY.md`.
- **Ajouter un jeu** : une entrée dans `src/portal/catalog.ts` (texte français et anglais obligatoires, vérifié par les tests),
  `jeux/<jeu>/index.html` et `en/games/<jeu>/index.html`, déclarés dans `vite.config.ts`.
- Non fait : balises `hreflang` absolues (il faut le nom de domaine définitif).

### Structure du site (portail + jeux)

- `index.html` et `en/index.html` + `src/portal/` : le **portail**, qui liste les parcours (`src/portal/catalog.ts` : une entrée par parcours,
  validée par les tests). Les parcours « bientôt » n'ont pas de bouton Jouer.
- `jeux/devops/index.html` + `src/` : le jeu DevOps, servi sous `/jeux/devops/`. Un nouveau parcours = une entrée du catalogue
  + un dossier `jeux/<id>/` déclaré dans `vite.config.ts`.
- Préfixe d'URL : variable `APP_BASE` au build (`/g2l/` sur GitHub Pages, `/` par défaut, donc sur un VPS à domaine propre).
- Le portail utilise les polices Chakra Petch et Barlow (SIL OFL 1.1, auto-hébergées via `@fontsource`, licences dans `public/licenses/`), un portail lumineux en WebGL (`src/portal/portalGate.ts`) et de vraies captures du jeu (`public/portal/`).
- La progression reste dans le navigateur (`localStorage`, même origine pour tout le site) : elle survit au changement d'adresse du jeu.

### Choix techniques

- **Three.js + Vite + TypeScript strict**, aucune dépendance runtime autre que Three.js (le personnage glTF
  est chargé par le `GLTFLoader` de three.js, sans décodeur supplémentaire).
- Niveaux **générés de façon déterministe** (graine = id du module) : les rondes sont identiques d'une partie à l'autre, on peut les apprendre. Chaque niveau généré est validé (tous les terminaux et la sortie accessibles) et testé pour les 16 modules.
- Cônes de vision **découpés contre les murs** par lancer de rayons sur la grille (DDA, O(distance)).
- Murs et racks en `InstancedMesh`, éclairage plafonné : fluide sur un portable.
- Sécurité : tout le texte passe par `textContent` (aucun `innerHTML`), CSP stricte dans chaque page HTML (`jeux/devops/index.html`, `index.html`) (`connect-src 'self' blob:` : le `GLTFLoader` décode les textures
  intégrées au `.glb` via des URL `blob:` créées par la page elle-même), sauvegarde locale validée avant usage.

## Affiches publicitaires et éclairage

**Affiches** (`src/ads/`) : des affiches texte sont peintes **au sol** de quelques salles (4 par niveau au plus, une par salle), orientées vers le haut de l'écran : vue de dessus, le sol se lit bien mieux qu'un mur. Elles n'occupent jamais une case de jeu (départ, sortie, terminal, dossier, caméra, ronde de garde) et restent hors de l'ombre du mur sud.
- Les annonceurs se déclarent dans **un seul fichier** : `src/ads/sponsors.ts` (`SPONSORS`), avec dates de début/fin, accroche FR/EN, adresse https et couleur. Un test (`sponsorProblems`) refuse une annonce invalide.
- Sans annonceur actif, l'affiche « À venir » (sans nom de partenaire) s'affiche à la place.
- Chaque affiche porte la mention « PUBLICITÉ » / « ADVERTISEMENT ». Elle est dessinée en canvas : aucun script, aucune requête, aucun clic, aucun suivi, donc rien à ajouter dans la CSP.

**Éclairage** (`src/level/lighting.ts`) : chaque salle a un niveau `off`, `dim`, `normal` ou `bright` (valeurs dans `LIGHT_LEVELS`). La salle de départ est toujours `normal`, le nombre de salles allumées est plafonné par la qualité graphique, et l'ambiance (`AMBIENT_LIGHT`) garantit que les salles sans néon restent lisibles.

**Accueil** : un seul écran façon lobby, sans défilement. L'agent du joueur (rendu 3D) est au centre, les raccourcis sont sur le bord gauche, le dossier de mission à droite, le gros bouton de lancement en bas à droite et le hamburger (icône seule) en haut à droite. L'agent est libéré dès qu'on quitte l'accueil.

**Réglages joueur** : le menu « Paramètres » (hamburger) de l'écran titre et de la pause regroupe la langue, les graphismes, la **luminosité** (Normale / Claire / Sombre, via l'exposition de l'image) et le son. Les réglages sont mémorisés sur l'appareil.

## Mentions légales et confidentialité

Pages statiques bilingues : `mentions-legales/index.html` (`/mentions-legales/`) et `en/legal/index.html` (`/en/legal/`), liées depuis le pied du portail et l'accueil du jeu. Version **provisoire, non professionnelle** : éditeur anonyme (identité communiquée à l'hébergeur, LCEN art. 6 III 2°), contact par GitHub Issues, hébergeur GitHub Pages, aucune donnée collectée, stockage local détaillé clé par clé (un test vérifie que chaque clé réellement utilisée y figure).

**À revoir dès que le site devient professionnel** (micro-entreprise, annonceurs payants, mesure d'audience, comptes) : identité complète de l'éditeur, SIRET, contact direct, mentions sur la publicité, consentement aux traceurs. Cette page n'est pas un avis juridique.

## Comptes et API (optionnels)

Le dossier `server/` contient l'API (Node, Fastify, PostgreSQL) : comptes e-mail + mot de passe, inscription au cours quand on clique sur « Jouer », compteur public d'inscrits, **sauvegarde de la progression dans le cloud**, export et suppression du compte. Voir `server/README.md` (routes, sécurité, limites) et `deploy/README.md` (mise en ligne sur un VPS avec HTTPS automatique).

Côté site, tout est **désactivé par défaut** (GitHub Pages n'a pas d'API) : un build avec `VITE_ACCOUNTS=1` active la fenêtre d'inscription (« Jouer » propose « Jouer sans compte »), le bouton de connexion de l'en-tête, le bloc « Compte » du menu Paramètres du jeu et le compteur d'inscrits. Le compte reste facultatif (`REQUIRE_ACCOUNT_TO_PLAY` dans `src/account/config.ts`).

**Synchronisation sans conflit** : la progression est faite de « meilleurs résultats », donc `mergeProgress` fusionne l'appareil et le compte en gardant le meilleur de chaque côté (secteur par secteur, jamais de recul, résultat identique dans les deux sens). Aucune question n'est posée au joueur ; une panne réseau ne gêne pas le jeu (nouvel essai plus tard). Les mentions légales ont deux variantes (avec et sans comptes) choisies au build.

En développement : lancer l'API (`server/`, port 3000) puis `VITE_ACCOUNTS=1 npm run dev` ; Vite relaie `/api` vers l'API.

## Mesure d'audience

Anonyme et sans cookie, via [GoatCounter](https://www.goatcounter.com) (compte `g2l`, voir `ANALYTICS_SITE_CODE` dans `src/analytics/track.ts`). Aucun script tiers : le site envoie un pixel (requête d'image) vers `g2l.goatcounter.com`, ce qui est autorisé dans la CSP des pages (`img-src`, vérifié par un test).
- Pages vues (portail, jeu, mentions légales) et des évènements de parcours : `play-click/<jeu>`, `campaign-start`, `tutorial-complete`, `tutorial-skip`, `intel-pickup/<secteur>`, `terminal-hack/<secteur>`, `terminal-locked/<secteur>`, `player-down/<secteur>`, `mission-failed/<secteur>`, `mission-quit/<secteur>`, `sector-complete/<secteur>`, `contribute-click/{guide,issue,footer,game}`. Noms d'évènements restreints à `[a-z0-9/-]` : pas de texte libre.
- Rien d'envoyé en local, sous « Ne pas me suivre », pour les navigateurs automatisés, ni après le refus du visiteur (bouton dans les mentions légales, clé `site-no-analytics`).
- Du référent, seul le nom de domaine est transmis. Jamais la progression, l'avatar ni le stockage local.
- Beaucoup d'applications (LinkedIn, X, messageries) ne transmettent aucun référent : pour savoir d'où viennent les visites, ajoute une étiquette au lien partagé, par exemple `https://ulrichrostand.github.io/g2l/?ref=linkedin`. Paramètres lus : `ref`, `utm_source`, `source` (lettres, chiffres, `_` et `-`, 40 caractères au plus). L'étiquette remplace le référent dans GoatCounter et est conservée par la redirection vers l'anglais.
- La taille d'écran (largeur, hauteur, densité) accompagne les pages vues, pour connaître la part de téléphones.
- Pour changer de compte ou d'outil : modifier la constante, la CSP des six pages et la section « Mesure d'audience » des mentions légales.

## Partage et référencement

Chaque page a ses balises Open Graph et Twitter (aperçu quand on partage le lien), son adresse canonique et ses `hreflang` FR/EN. L'image de partage est `public/share/og-image.png` (1200×630). Les adresses absolues sont calculées au build : domaine par défaut `https://ulrichrostand.github.io` (variable `SITE_ORIGIN` pour un autre), préfixe par `APP_BASE`. Le build produit aussi `sitemap.xml` et `robots.txt` (ce dernier n'est lu par les moteurs qu'à la racine d'un domaine propre). Au changement de nom de domaine : définir `SITE_ORIGIN`, reconstruire, et déclarer le sitemap dans la Search Console.

## Qualité graphique

Le jeu démarre en « Haute » sur ordinateur et « Moyenne » sur téléphone. Si l'image saccade en mission (moins de 40 images/s sur 4 s), la baisse est **progressive et pour la session seulement** (`QualityController`) : d'abord la résolution du rendu 3D (100 % → 85 % → 70 %, bloom et ombres conservés, interface toujours nette), puis seulement le profil d'effets. Le profil « Basse » remplace aussi les androïdes animés par de simples robots : la baisse automatique ne l'atteint donc jamais sur un ordinateur doté d'une carte graphique dédiée (plancher « Moyenne »). Seul un choix du joueur dans le menu Paramètres est mémorisé.

Le menu Paramètres affiche une ligne de diagnostic : carte graphique détectée, images/s mesurées, résolution, et un conseil si le navigateur calcule en logiciel ou sur la puce intégrée (`src/core/diagnostics.ts`).

## Licence

Tous droits réservés (voir `LICENSE`) : le code est consultable sur GitHub, mais ne peut être copié, réutilisé ni redistribué sans autorisation. Les contributions passent par pull request et sont validées par le propriétaire (voir `CONTRIBUTING.md`). Les composants tiers gardent leur licence (tableau ci-dessous).

## Ressources 3D et licences

| Ressource | Auteur | Licence | Fichier |
|---|---|---|---|
| Universal Base Characters (tête, yeux, sourcils, cheveux) | [Quaternius](https://quaternius.com/packs/universalbasecharacters.html) | CC0 1.0 | `public/models/characters/agent-male.glb`, `agent-female.glb` |
| Modular Character Outfits – Fantasy (chemise, pantalon, gilet, bottes) | [Quaternius](https://quaternius.com/packs/modularcharacteroutfitsfantasy.html) | CC0 1.0 | idem |
| Universal Animation Library (animations, androïde des sentinelles) | [Quaternius](https://quaternius.itch.io/universal-animation-library) | CC0 1.0 | idem, et `sentinel.glb` |

Provenance exacte, empreintes SHA-256 des sources et reconstruction : `public/models/characters/README.md`
(script : `scripts/build-agent-glb.mjs`). Textes de licence : `public/models/characters/licenses/`.

## Mobile : orientation et plein écran

Aucun navigateur ne permet d'imposer le paysage partout, le jeu le **conseille** donc sans le forcer : sur un
écran tactile en portrait, un encart (sur l'écran de briefing, ou en mission si aucun tutoriel n'est affiché)
propose « Plein écran », qui verrouille le paysage quand le navigateur l'autorise (Android / Chrome). Sur iPhone,
sans API plein écran, il invite seulement à tourner le téléphone. « Plus tard » l'écarte pour la session. Installé
sur l'écran d'accueil, le jeu s'ouvre directement en paysage plein écran sur Android (`public/manifest.webmanifest`).

**Commandes tactiles** (disposition façon jeux mobiles) : joystick flottant à gauche ; à droite, un gros pad de tir
(glisser pour viser, relâcher pour tirer) avec Action, Accroupir, Gadget et Vision en arc autour, à distance du pad
et loin du bord (un glissé trop près du bord déclenche les gestes système en plein écran). La pause est en haut
de l'écran ; en plein écran, un bouton « Réduire » en haut et l'entrée « Quitter le plein écran » du menu pause
permettent d'en sortir, et le menu pause propose « Plein écran » sinon.

## Limites connues

- Nécessite WebGL.
- Les défis « commande » sont plus confortables avec un clavier physique (clavier virtuel sur mobile).
