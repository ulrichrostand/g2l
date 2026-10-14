---
name: Portail Gaming to Learn
description: Le hall d'entrée d'une salle d'arcade : fond presque noir, accent citron néon, titres anguleux, un portail lumineux et de vraies captures des jeux.
colors:
  void: "#080b0a"
  surface: "#10160f"
  surface-raised: "#161e15"
  line: "#243024"
  text: "#eef2ea"
  text-soft: "#b1bbad"
  text-faint: "#86907f"
  lime: "#c6f135"
  lime-bright: "#d6ff4c"
  lime-ink: "#0b0f04"
typography:
  display:
    fontFamily: "'Chakra Petch', 'Arial Narrow', sans-serif"
    fontSize: "clamp(2.6rem, 6.5vw, 4.75rem)"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "0.01em"
  headline:
    fontFamily: "'Chakra Petch', 'Arial Narrow', sans-serif"
    fontSize: "clamp(1.75rem, 4vw, 2.5rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.01em"
  monogram:
    fontFamily: "'Chakra Petch', 'Arial Narrow', sans-serif"
    fontSize: "3.4rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.06em"
  title:
    fontFamily: "'Chakra Petch', 'Arial Narrow', sans-serif"
    fontSize: "1.4rem"
    fontWeight: 700
    lineHeight: 1.15
  lead:
    fontFamily: "Barlow, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 400
    lineHeight: 1.6
  body:
    fontFamily: "Barlow, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Barlow, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  sm: "8px"
  md: "12px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
  4xl: "96px"
components:
  button-primary:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.lime-ink}"
    typography: "{typography.label}"
    padding: "0 24px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.lime-bright}"
    textColor: "{colors.lime-ink}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.lime}"
    typography: "{typography.label}"
    padding: "0 24px"
    height: "48px"
  button-outline-hover:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.lime-ink}"
  button-dark:
    backgroundColor: "{colors.lime-ink}"
    textColor: "{colors.lime}"
    typography: "{typography.label}"
    padding: "0 24px"
    height: "48px"
  game-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "16px"
  nav-link:
    textColor: "{colors.text-soft}"
    typography: "{typography.body}"
---

# Design System: Portail Gaming to Learn

## Overview

**Creative North Star: "Le hall d'arcade"**

Le portail est l'entrée d'une salle de jeux : il fait noir, une seule couleur brille, et le premier objet qu'on voit est un portail lumineux qui invite à passer. Les titres sont anguleux et en capitales, comme les frontons de bornes d'arcade ; le texte courant reste sobre et très lisible. Chaque jeu a sa place au même rang : le portail présente une collection, pas un produit unique.

L'énergie vient de trois choses seulement : l'accent citron néon, le shader du portail et les vraies captures des jeux. Tout le reste est calme : surfaces vert-noir à peine distinctes, filets fins, grands espaces entre les sections. Aucune image n'est inventée : un jeu sans capture est présenté par une affiche typographique (son monogramme en contour citron), pas par une fausse illustration.

Rejets confirmés : emojis, glyphes à la place d'icônes, illustrations générées ou empruntées, texte en dégradé, formulaire factice (pas de champ d'inscription tant que les comptes n'existent pas).

**Key Characteristics:**
- Fond presque noir teinté vert, un seul accent : le citron néon.
- Titres Chakra Petch en capitales, texte Barlow.
- Portail lumineux en WebGL dans le premier écran.
- Cartes de jeux au même rang, défilement horizontal avec aimantation.
- Uniquement de vraies captures, ou une affiche typographique.

## Colors

Une base vert-noir très sombre et un unique accent citron, utilisé pour l'action et la lumière.

### Primary
- **Citron néon** (#c6f135) : boutons principaux, contours des boutons secondaires, marque, genre des jeux, intertitres de la méthode, anneau du portail, bandeau d'appel final.
- **Citron vif** (#d6ff4c) : survol du bouton principal uniquement.

### Neutral
- **Vide** (#080b0a) : fond de page.
- **Surface** (#10160f) : cartes de jeux, fond des vignettes.
- **Surface relevée** (#161e15) : fond des visuels en attente de chargement.
- **Filet** (#243024) : bordures de cartes, séparateurs, pied de page.
- **Texte** (#eef2ea) : titres et texte principal.
- **Texte doux** (#b1bbad) : texte secondaire, navigation.
- **Texte effacé** (#86907f) : métadonnées, notes, mentions « bientôt ». Au-dessus de 4,5:1 sur le fond.
- **Encre citron** (#0b0f04) : texte posé sur le citron.

### Named Rules
**The Single Light Rule.** Le citron est la seule source de lumière de la page. Aucune autre teinte vive, aucun dégradé décoratif.

**The Ink On Lime Rule.** Sur un fond citron, le texte est toujours l'encre citron (#0b0f04), jamais blanc.

## Typography

**Display Font:** Chakra Petch 700 (repli Arial Narrow)
**Body Font:** Barlow 400, 500, 600 (repli Segoe UI, Roboto)

**Character:** Chakra Petch apporte l'angle et la tension des interfaces de jeu ; Barlow, légèrement étroite, garde le texte lisible et sobre à côté.

### Hierarchy
- **Display** (700, clamp(2.6rem, 6.5vw, 4.75rem), 0.98, capitales) : le titre d'accroche, une fois par page.
- **Headline** (700, clamp(1.75rem, 4vw, 2.5rem), 1.1, capitales) : titres de section.
- **Monogram** (700, 3.4rem, contour citron) : affiche des jeux sans capture.
- **Title** (700, 1.4rem, 1.15, capitales) : nom de chaque jeu.
- **Lead** (400, 1.15rem, 1.6) : paragraphe d'accroche, mesure 46 caractères.
- **Body** (400, 1.0625rem, 1.6) : texte courant et intertitres de la méthode.
- **Label** (600, 0.95rem, 1.4) : boutons, genres, légendes, notions, notes.

### Named Rules
**The Seven Steps Rule.** Sept tailles, une par rôle. Une nouvelle taille exige un nouveau rôle documenté ici.

**The Capitals For Display Rule.** Les capitales sont réservées à Chakra Petch (titres, boutons). Le texte Barlow reste en casse normale.

## Layout

Un conteneur de 1180 px au plus, centré, avec 24 px de marge. Le premier écran est en deux colonnes (accroche à gauche, portail à droite) ; sous 900 px, le portail passe au-dessus du texte. Les jeux défilent horizontalement avec aimantation, une carte de 560 px au plus par position, 86 % de la largeur sur mobile. La galerie suit une grille de 12 colonnes à rangées de hauteur fixe (7 + 5, puis 5 + 7), une seule colonne sur mobile. Échelle d'espacement de base 4 : 8, 12, 16, 24, 32, 48, 64, 96.

## Elevation & Depth

La page est surtout plate : les cartes se détachent du fond par la surface et le filet, pas par l'ombre. Deux ombres seulement, toujours décalées et floues : la lueur portée sous le bouton principal, et l'ombre de l'image avant-plan dans la section « Apprendre en agissant ». L'en-tête fixe est légèrement translucide avec un flou d'arrière-plan.

### Named Rules
**The Earned Shadow Rule.** Une ombre n'existe que sous l'action principale ou pour séparer deux images superposées. Jamais de halo sans décalage.

## Shapes

Deux rayons : 8 px pour les images et les vignettes, 12 px pour les cartes et le bandeau final. Les boutons sont rectangulaires, sans arrondi, comme des touches de borne. Le portail et la marque sont des cercles exacts.

## Components

### Buttons
- **Shape:** rectangle sans arrondi, hauteur 48 px (40 px pour la version compacte de l'en-tête).
- **Primary:** fond citron, texte encre citron, Chakra Petch 700 en capitales, padding horizontal 24 px, lueur portée décalée.
- **Hover / Focus:** citron vif et léger soulèvement (1 px) ; au clavier, anneau citron de 2 px.
- **Outline:** contour citron de 2 px, texte citron ; au survol, se remplit en citron.
- **Dark:** fond encre citron, texte citron, réservé au bandeau citron.

### Cards / Containers
- **Corner Style:** 12 px.
- **Background:** surface (#10160f), filet de 1 px.
- **Shadow Strategy:** aucune.
- **Internal Padding:** 16 px ; visuel de 220 px à gauche, texte à droite ; empilés sur mobile.

### Navigation
- En-tête fixe de 68 px : marque (anneau et cœur citron, nom en capitales) à gauche, trois liens au centre droit, bouton « Jouer » en contour. Sur mobile, les liens disparaissent, le bouton reste.

### Sélecteur de langue
- Deux liens côte à côte (FR, EN) dans l'en-tête, séparés par un filet de 1 px (#243024) ; Chakra Petch 700 en 0.95rem, texte effacé (#86907f) ; le lien de la langue courante en citron (#c6f135) avec `aria-current`. Cible de 40 px de haut. Sur mobile, il reste visible quand la navigation se replie.

### Portail (composant signature)
Un shader WebGL dans un canvas carré (520 px au plus) : vortex animé, anneau citron net, couronne segmentée qui tourne en sens inverse, fine couronne extérieure. Il se met en pause hors écran et onglet caché, montre une image fixe si l'utilisateur préfère moins d'animations, et disparaît sans casser la page si WebGL manque.

### Affiche typographique
Pour un jeu sans capture : la surface relevée, un filet, et le monogramme du jeu (2 à 4 lettres) en contour citron.

## Do's and Don'ts

### Do:
- **Do** présenter chaque jeu au même rang : même carte, même taille, même place dans le défilement.
- **Do** n'utiliser que de vraies captures des jeux, recadrées avec un point de cadrage explicite.
- **Do** réserver le citron (#c6f135) à l'action, à la marque et à la lumière.
- **Do** garder le portail lumineux dans le premier écran, sur ordinateur comme sur mobile.

### Don't:
- **Don't** utiliser d'emoji, de glyphe en guise d'icône, d'illustration générée ou empruntée.
- **Don't** afficher de formulaire d'inscription ou de lettre d'information tant que le serveur n'existe pas.
- **Don't** ajouter une seconde couleur vive ni de texte en dégradé.
- **Don't** mettre de capitales dans le texte Barlow ni de nouvelle taille hors des sept rôles.
- **Don't** appliquer ce système à l'intérieur des jeux : chaque jeu garde son propre univers.
