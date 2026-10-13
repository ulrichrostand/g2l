# Translation guide (French → English)

English is **American English** (color, behavior, organize). Audience: complete beginners. Voice: second person ("you"), direct, friendly, no jargon that is not explained. Short sentences. Same tone as the French.

## Never translate
- Shell commands, file names, code, flags, URLs, product names (`kubectl`, `docker run`, `git commit`, Terraform…).
- Proper names of the fiction: **ENTROPIA**, **Helix Corp**, **Spectre** (the player's codename), **Shadow Ops**.
- The `id` of modules and bosses, and anything used as a key in code.

## Fixed vocabulary
| French | English |
|---|---|
| Cellule Écho | Echo Cell |
| secteur | sector |
| module | module |
| Opération X | Operation X |
| sentinelle | sentinel |
| dossier (ramassé, jaune) | intel file / yellow file |
| terminal / pirater un terminal | terminal / hack a terminal |
| neutraliser | take down (a sentinel) |
| suspendue (sentinelle, SIGSTOP) | suspended |
| réplica | replica |
| boss | boss |
| armure du boss | armor |
| gadget / commande-arme | gadget / command weapon |
| infiltration | infiltration |
| à terre (joueur) | down |
| Examen / Examen général | Exam / General exam |
| Mes compétences | My skills |
| À consolider / Acquis / Maîtrisé / À faire | Needs work / Solid / Mastered / To do |
| Personnaliser l'agent | Customize your agent |
| Mission suivante / Rejouer / Reprendre | Next mission / Replay / Resume |
| Passer le tutoriel | Skip the tutorial |
| Pause / Quitter la mission | Pause / Quit mission |
| Qualité / Graphismes (Haute, Moyenne, Basse) | Graphics (High, Medium, Low) |
| Son : activé / coupé | Sound: on / off |
| Tous les parcours | All games |
| Carte des opérations | Operations map |
| Fiche agent | Agent file |

## Rules for strings that depend on text
Some data is *evaluated* (accepted commands, regex patterns, expected outputs). When the English wording changes what the player must type (for example the task says to display "Bonjour"), change the accepted answers and patterns accordingly, and keep the **logic** identical: same number of accepted answers where possible, same regex structure. The tests in `tests/contentLanguages.test.ts` check this.

Terminal outputs that were French because of a localized tool (for example `date`) become the usual English output.

## Forbidden
- Emojis. French accented letters in English strings (the tests reject them).
- Changing counts: lessons, challenges, options, `correctIndex`, steps, phases stay identical to French.
