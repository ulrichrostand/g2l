---
name: Portail Cellule Écho
description: Un catalogue sobre qui se lit comme un sommaire : graphite chaud, texte crème, une seule famille serif, un seul accent bleu acier.
colors:
  graphite: "#17191d"
  cream: "#ece8df"
  cream-soft: "#b3afa6"
  cream-faint: "#918e86"
  rule: "#2d3036"
  rule-strong: "#4a4d54"
  steel-blue: "#9db4d6"
typography:
  display:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "clamp(2.25rem, 5.4vw, 3.5rem)"
    fontWeight: 560
    lineHeight: 1.08
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "0.005em"
  label:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: "2px"
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
  play-link:
    backgroundColor: "transparent"
    textColor: "{colors.steel-blue}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "12px 24px"
  play-link-hover:
    backgroundColor: "{colors.steel-blue}"
    textColor: "{colors.graphite}"
  nav-link:
    textColor: "{colors.cream-soft}"
    typography: "{typography.body}"
    padding: "12px 0"
  nav-link-hover:
    textColor: "{colors.cream}"
---

# Design System: Portail Cellule Écho

## Overview

**Creative North Star: "Le sommaire"**

Le portail se lit comme la table des matières d'un livre sérieux : des filets fins, un titre par parcours, du texte posé sur un fond graphite chaud. La hiérarchie vient de la taille, du poids et de l'espace, jamais d'un effet. Rien ne brille, rien ne flotte, aucune surface n'est mise en boîte : un parcours est une ligne, pas une carte.

La densité est calme : une colonne de lecture de 62 caractères au plus, de larges respirations entre les sections, et le premier parcours jouable avec son bouton visible dès le premier écran. L'accent bleu acier est rare, réservé à l'action (Jouer) et aux liens. Le texte clair sur fond sombre est compensé par un interligne et un léger espacement des lettres un peu plus généreux.

Rejets confirmés : emojis, halos lumineux, dégradés, cartes interchangeables, pastilles, étiquettes en majuscules espacées, numéros de section décoratifs, vert et blanc vif comme couleurs de marque.

**Key Characteristics:**
- Une seule famille typographique (Newsreader, auto-hébergée, axe optique inclus), serif éditorial.
- Fond graphite chaud, texte crème, un seul accent bleu acier.
- Structure par filets horizontaux, pas par cadres ni par ombres.
- Action visible au premier écran, sur ordinateur comme sur mobile.

## Colors

Une palette quasi monochrome de neutres chauds, avec un unique accent froid pour l'action.

### Primary
- **Bleu acier** (#9db4d6 / oklch(77% 0.05 255)) : bouton Jouer, liens de texte, sélection de texte, anneau de focus. Jamais en fond large.

### Neutral
- **Graphite chaud** (#17191d) : fond de page et de l'en-tête.
- **Crème** (#ece8df) : texte principal, titres, texte survolé.
- **Crème adoucie** (#b3afa6) : texte secondaire (introduction, notions, navigation au repos).
- **Crème effacée** (#918e86) : métadonnées, genre du parcours, mention « Bientôt », pied de page. Reste au-dessus de 4,5:1 sur le fond.
- **Filet discret** (#2d3036) : séparation entre les lignes de parcours et dans le pied de page.
- **Filet appuyé** (#4a4d54) : sous les titres de section.

### Named Rules
**The One Voice Rule.** Le bleu acier ne sert qu'à l'action et au lien. S'il apparaît pour décorer, c'est une faute.

**The Warm Neutral Rule.** Aucun gris pur : chaque neutre est teinté chaud (crème) ou froid léger (graphite), jamais #000 ni #fff.

## Typography

**Display Font:** Newsreader (variable, avec axe optique), repli Georgia puis Times New Roman
**Body Font:** la même famille
**Label/Mono Font:** aucune

**Character:** une serif éditoriale, posée et lisible, qui donne au catalogue un ton de publication plutôt que d'application. Une seule famille : le contraste vient de la taille et du poids.

### Hierarchy
- **Display** (560, clamp(2.25rem, 5.4vw, 3.5rem), 1.08) : le titre d'accroche, une fois par page, jusqu'à 18 caractères par ligne.
- **Headline** (600, 1.5rem, 1.2) : titres de section et noms de parcours.
- **Title** (600, 1.25rem, 1.3) : titres de la méthode, nom du site.
- **Body** (400, 1.125rem, 1.65) : texte courant, mesure maximale 62 caractères.
- **Label** (400, 1rem, 1.6) : genre, notions, métadonnées, liens secondaires.

### Named Rules
**The One Family Rule.** Une seule famille sur tout le portail. Ajouter une seconde famille exige un rôle qu'elle est seule à remplir.

**The No Faux Italic Rule.** Seul le romain est chargé : aucun italique, aucun gras synthétisé par le navigateur.

## Layout

Un conteneur de 1040 px au plus, centré, avec 24 px de marge de chaque côté. Les sections sont séparées par 48 à 96 px selon la largeur ; au sein d'une section, 8 à 32 px. Un parcours est une grille de trois zones (titre et genre, détail, action) avec l'action à droite ; la méthode reprend la même grammaire (titre à gauche, texte à droite). En dessous de 760 px, tout passe sur une colonne et l'ordre devient titre, action, détail : le bouton reste visible sans longue lecture. Échelle d'espacement de base 4 : 8, 12, 16, 24, 32, 48, 64, 96.

## Elevation & Depth

Aucune ombre, aucune superposition. La profondeur est nulle : tout est à plat sur le fond, séparé par des filets (1 px). Seul l'en-tête est fixe en haut, détaché par un filet.

### Named Rules
**The Flat Rule.** Aucune ombre, aucun halo, aucun flou. Un filet sépare, la taille hiérarchise.

## Shapes

Presque rectiligne : un seul rayon de 2 px sur le bouton Jouer et l'anneau de focus. Aucune pastille, aucun cercle, aucune capsule. Les filets sont horizontaux, jamais verticaux.

## Components

### Buttons
- **Shape:** rectangle à coins quasi vifs (2 px).
- **Primary (Jouer):** contour bleu acier de 1 px, fond transparent, texte bleu acier en 600, padding 12 px 24 px.
- **Hover / Focus:** le fond se remplit en bleu acier et le texte passe en graphite (transition 0,18 s, ease-out) ; au clavier, un anneau de 2 px bleu acier à 3 px de distance.
- **Indisponible:** pas de bouton ; le mot « Bientôt » en crème effacée.

### Navigation
- **Style:** en-tête fixe de 60 px, nom du site en 600 à gauche, deux liens à droite en crème adoucie ; survol : crème et souligné. Aucun menu replié (deux liens tiennent sur mobile).

### Course row (composant signature)
Une ligne de l'index des parcours : titre en Headline avec le genre en Label dessous, scénario, notions séparées par des points médians, métier et durée, puis l'action. Séparée de la suivante par un filet discret. Les parcours indisponibles passent en crème adoucie.

## Do's and Don'ts

### Do:
- **Do** montrer l'action principale (Jouer) dans le premier écran, sur ordinateur et sur mobile.
- **Do** séparer par des filets de 1 px (#2d3036) et de l'espace, pas par des cadres.
- **Do** garder le texte courant à 62 caractères de mesure au plus et à 4,5:1 de contraste au moins.
- **Do** utiliser l'échelle d'espacement de base 4 et poser plus d'espace au-dessus d'un titre qu'en dessous.

### Don't:
- **Don't** employer d'emoji, de dégradé, d'ombre ou de halo lumineux.
- **Don't** mettre les parcours dans des cartes, ni des pastilles ou capsules sur les notions.
- **Don't** numéroter les sections ou les parcours (ils ne forment pas une séquence).
- **Don't** utiliser de vert ni de blanc vif comme couleur de marque, ni de #000 ni #fff.
- **Don't** ajouter une seconde famille de caractères ni d'italique synthétique.
- **Don't** appliquer ce système au jeu : le jeu DevOps garde son univers visuel propre (HUD sombre à accent vert) tant qu'il n'est pas documenté séparément.
