# Personnages 3D

## agent.glb — agent du joueur

Humain riggé (65 os, squelette « Universal » de Quaternius), environ 25 700 triangles, 6 textures WebP
de 1024 px au plus, 12 animations. Taille : ~2 Mo.

### Sources (toutes CC0 1.0, créateur : Quaternius)

| Pack (édition Standard gratuite) | Pièces utilisées |
|---|---|
| Universal Base Characters | tête, cou, yeux et sourcils extraits de `Superhero_Male_FullBody` ; cheveux `Hair_Buzzed` |
| Modular Character Outfits – Fantasy | manches et pantalon de `Male_Peasant`, gilet sanglé `Male_Ranger_Body`, bottes `Male_Ranger_Feet_Boots` |
| Universal Animation Library | `Idle_Loop`, `Walk_Loop`, `Jog_Fwd_Loop`, `Sprint_Loop`, `Crouch_Idle_Loop`, `Crouch_Fwd_Loop`, `Pistol_Idle_Loop`, `Pistol_Aim_Neutral`, `Pistol_Shoot`, `Hit_Chest`, `Death01`, `Interact` |

Les textes de licence fournis avec les packs sont dans `licenses/`. CC0 : aucune attribution exigée,
redistribution autorisée ; Quaternius est crédité quand même.

### Provenance

Les sites officiels (quaternius.com, itch.io) n'étaient pas joignables depuis l'environnement de
construction. Les fichiers sources ont été pris dans une copie publique des éditions Standard, qui
conserve les fichiers de licence d'origine et un manifeste SHA-256 :

- dépôt `OpenAgentsInc/openagents`, dossier `assets/verse/characters/quaternius/`, commit `cd51f246ad3c0ea26faaa846572e3fd6cc4547a7` ;
- les empreintes des fichiers utilisés correspondent à ce manifeste (vérifié), par exemple
  `outfits/Male_Peasant.bin` → `e46bde795f7b69b3…`, `gaits.glb` → `69591853d817488e…` ;
- `gaits.glb` est l'Universal Animation Library Standard (sans root motion) telle que distribuée.

Pour repartir des archives officielles, télécharger les éditions Standard sur
https://quaternius.com/packs/universalbasecharacters.html,
https://quaternius.com/packs/modularcharacteroutfitsfantasy.html et
https://quaternius.itch.io/universal-animation-library, puis exporter les mêmes fichiers glTF.

### Traitements (scripts/build-agent-glb.mjs)

1. Tenue `Male_Peasant` sans son torse ni ses chaussures, plus le gilet et les bottes `Ranger`, rattachés au même squelette (noms d'os vérifiés identiques).
2. Tête : seuls les triangles du corps complet portés à 50 % ou plus par les os `Head` et `neck_01` (le pack gratuit n'a pas de tête séparée).
3. Animations : rotations de tous les os, translation du bassin recalée sur la pose de repos de l'agent ; le mannequin de la bibliothèque est retiré.
4. Cartes normales, rugosité/métal et occlusion retirées (invisibles vues de dessus), textures de vêtements et de cheveux passées en niveaux de gris pour être teintées en jeu, compression WebP.

Reconstruire :

```sh
npm i --no-save @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 sharp
node scripts/build-agent-glb.mjs <dossier des sources Quaternius> public/models/characters/agent.glb
```

`tests/humanCharacter.test.ts` vérifie le fichier produit (glTF 2.0 valide, animations et pièces
attendues, images intégrées, taille).
