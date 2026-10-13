# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

TypeScript, Vite (pages multiples : portail à la racine, un jeu par dossier sous `jeux/`), sans framework d'interface. Jeu 3D : Three.js. Texte toujours posé via `textContent` (aucun `innerHTML`), CSP stricte dans chaque page HTML. Déploiement actuel : GitHub Pages (`APP_BASE=/rostand/`) ; déploiement prévu : un VPS à domaine propre (`APP_BASE=/`).

## Users

Débutants complets qui veulent apprendre ou changer vers un métier de la tech (DevOps, data, sécurité), souvent sur téléphone en paysage ou sur ordinateur, hors cadre scolaire formel : ils choisissent un parcours, jouent par sessions courtes et reviennent. Public francophone. Aucune connaissance préalable requise. (Précision des profils d'âge et de niveau : non confirmée.)

## Product Purpose

Une plateforme de parcours d'apprentissage joués, chacun suivant la roadmap correspondante de roadmap.sh. Chaque parcours est un jeu à scénario qui donne un enjeu aux notions (le DevOps en infiltration 3D façon Splinter Cell, la data en traque d'une fraude financière, le SQL en enquête policière, la sécurité en réponse à une intrusion). Succès : le joueur termine un parcours, retient les notions (examens, bilan de compétences, notions à revoir) et revient pour le suivant.

## Positioning

Pas des cours à lire ni des quiz isolés : l'apprentissage passe par de vraies commandes et de vraies requêtes tapées dans une situation à résoudre, et la progression est mesurée honnêtement (examens, bilan par thème). Chaque parcours est fidèle à la roadmap officielle correspondante.

## Operating Context

- Un portail à la racine liste les parcours ; l'inscription est prévue au moment où le visiteur veut jouer (pas avant). Comptes prévus : e-mail et mot de passe, et Google. Aujourd'hui : aucun compte, la progression reste dans le navigateur (`localStorage`).
- Un seul parcours est jouable : « DevOps : Shadow Ops » (16 secteurs, jeu d'infiltration 3D, tutoriel guidé, examens, page « Mes compétences »). Les parcours Data Analyst, SQL et Cybersécurité sont annoncés « Bientôt ».
- Le jeu est conçu tactile d'abord (pad de tir, joystick flottant, paysage conseillé, plein écran) et reste jouable au clavier et à la souris.
- Monétisation envisagée plus tard : affiches sponsorisées dans les décors du jeu (offres de recrutement, outils, formations), clairement signalées comme annonces, jamais pendant l'action. Mesure d'audience sans cookie envisagée. Rien de cela n'est encore construit.

## Capabilities and Constraints

- Interface entièrement en français, termes techniques en anglais.
- Aucun emoji nulle part dans l'interface.
- Crédit visible à roadmap.sh ; projet indépendant, non affilié.
- Sécurité : aucune injection HTML, CSP stricte, entrées validées, aucun secret dans le code, liens sortants en `rel="noopener noreferrer"`.
- Performance mobile : qualité graphique réglable, repli automatique si le jeu ralentit ; polices et ressources auto-hébergées, aucun script tiers.
- Non décidé : nom définitif du site (provisoire : « Cellule Écho »), contenu exact et scénarios des parcours à venir, outil de statistiques, pages légales, schéma des comptes.

## Brand Commitments

- Nom provisoire du site : « Cellule Écho » (une seule constante à changer).
- Ton direct, adulte, sans jargon non expliqué ; tutoiement.
- Le portail doit rester sobre et épuré, sans les codes visuels génériques de l'IA (halos lumineux, dégradés, cartes interchangeables, emojis), et sans vert ni blanc vif comme couleurs de marque (consigne de l'auteur, formulée sans nommer de couleur : interprétation à confirmer).
- Le jeu DevOps garde son propre univers visuel (HUD sombre, ambiance infiltration) : il n'est pas régi par le portail.

## Evidence on Hand

- Un jeu complet et jouable (parcours DevOps), déployé sur GitHub Pages ; contenu pédagogique rédigé en français (16 modules, leçons, défis, scénarios, examens).
- Personnages 3D sous licence ouverte (Quaternius CC0) ; police du portail Newsreader (SIL OFL 1.1) ; licences dans `public/licenses/` et `public/models/characters/licenses/`.
- Absent, à ne pas inventer : témoignages, nombre de joueurs, partenaires, annonceurs, tarifs, résultats d'apprentissage mesurés.

## Product Principles

1. Le scénario donne l'enjeu, la pratique donne la compétence : jamais de notion sans situation à résoudre.
2. Fidélité à la roadmap : chaque parcours suit l'ordre et le périmètre de roadmap.sh.
3. Honnêteté du bilan : montrer au joueur ce qu'il maîtrise vraiment et ce qu'il doit revoir.
4. Le débutant d'abord : rien ne suppose une connaissance préalable, tout se joue au doigt comme à la souris.
5. Sobriété : une interface qui s'efface devant le contenu, sans effet décoratif ni promesse gonflée.

## Accessibility & Inclusion

Contraste d'au moins 4,5:1 pour le texte courant, focus clavier visible, préférences de mouvement réduit respectées, cibles tactiles confortables, mise en page sans défilement horizontal à partir de 360 px de large. Public francophone : contenu et attributs de langue en français.
