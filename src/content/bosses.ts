import type { ScenarioStep } from "./types";

/**
 * Une phase de boss = une épreuve pratique sous pression : une seule vraie commande,
 * à déduire de la sortie de terminal affichée quand le boss est exposé.
 */
export interface BossPhase extends ScenarioStep {
  /** Sortie de terminal affichée quand le boss est exposé (ex. ps aux avec son PID) : il faut la lire pour trouver la bonne commande. */
  context: string[];
  /** Indice affiché après la première erreur. */
  hint: string;
}

export interface BossDefinition {
  moduleId: string;
  name: string;
  /** Sous-titre court (ex. « Le processus qui refuse de mourir »). */
  title: string;
  /** 2 phrases : ce que le boss représente en DevOps, raconté simplement. */
  intro: string;
  /** Couleur du boss (0xRRGGBB). */
  color: number;
  phases: [BossPhase, BossPhase, BossPhase];
  /** Ce qu'il faut retenir, affiché à la victoire. */
  defeat: string;
}

/**
 * Un boss par module, qui ne se bat qu'avec les commandes vues dans ce module (leçons, défis,
 * intervention ou gadget) : c'est un examen pratique, pas une découverte.
 * Les 3 phases racontent un incident complet (diagnostic → action → coup final) et chaque objectif
 * oblige à lire la sortie affichée : un PID, un nom de conteneur ou de pod, une IP, un fichier…
 * Les motifs s'appliquent à la commande normalisée (sans « sudo », guillemets uniformisés en ").
 */
export const BOSSES: Record<string, BossDefinition> = {
  genesis: {
    moduleId: "genesis",
    name: "L'Écran Noir",
    title: "Le terminal qui fait peur",
    intro:
      "L'Écran Noir, c'est la peur du terminal : une fenêtre noire, sans bouton, qui semble ne rien comprendre. Il se dissipe dès qu'on ose lui parler avec des commandes simples.",
    color: 0x6c7bff,
    phases: [
      {
        context: ["████████ ÉCRAN NOIR ████████", "> Connexion entrante détectée.", "> Aucun badge, aucun nom.", "> QUI ES-TU ?"],
        goal: "L'Écran Noir exige ton identité. Fais afficher par le serveur le nom d'utilisateur avec lequel tu es connecté.",
        hint: "La commande se dit « qui suis-je » en anglais, tout attaché : `whoami`.",
        accepted: ["whoami"],
        output: ["spectre"],
      },
      {
        context: ["> spectre… Ce nom ne me dit rien.", "> Mon horloge s'est arrêtée le 1er janvier 1970.", "> PROUVE-MOI QUE LE TEMPS PASSE ENCORE."],
        goal: "Son horloge est bloquée en 1970. Montre-lui la date et l'heure actuelles du serveur.",
        hint: "Le mot anglais pour « date » est… `date`. Une seule commande, rien derrière.",
        accepted: ["date"],
        output: ["lun. 12 oct. 2026 23:47:12 UTC"],
      },
      {
        context: [
          "> 2026 ?! J'ai dormi trop longtemps…",
          "> Dernière épreuve : seul un humain sait écrire le mot de code.",
          "> Mot de code : LUMIERE",
          "> Fais-le apparaître à l'écran, en majuscules.",
        ],
        goal: "Fais afficher le mot de code (lis-le dans la sortie) avec la commande qui répète le texte qu'on lui donne.",
        hint: "`echo` affiche le texte qu'on lui donne : tape echo, une espace, puis le mot de code en majuscules.",
        accepted: ["echo LUMIERE", 'echo "LUMIERE"'],
        patterns: ['echo "?LUMI[EÈ]RE"?'],
        output: ["LUMIERE", "> …la lumière revient. L'Écran Noir se dissipe."],
      },
    ],
    defeat: "Le terminal n'est pas un ennemi : on lui parle avec des mots précis. `whoami` dit qui tu es, `date` donne l'heure, `echo` affiche un texte.",
  },

  kernel: {
    moduleId: "kernel",
    name: "Processus Zombie",
    title: "Le processus qui refuse de mourir",
    intro:
      "Sous Linux, chaque programme qui tourne est un processus, avec son numéro : le PID. Ce boss est un processus parent qui ignore les ordres d'arrêt et laisse derrière lui des « zombies » : des processus déjà morts mais toujours inscrits dans la liste.",
    color: 0x7dff4a,
    phases: [
      {
        context: [
          "ALERTE  la machine rame : load average 12.40, 11.87, 9.02",
          "ALERTE  la liste des processus déborde",
          "# Quelque chose se multiplie dans le système. Il faut voir TOUS les processus.",
        ],
        goal: "Liste tous les processus de la machine, ceux de tous les utilisateurs, avec l'outil `ps` (comme ton gadget kill).",
        hint: "`ps` tout seul ne montre que les processus de ton propre terminal. Ajoute les lettres `aux` : a = tous les utilisateurs, u = détails, x = même ceux sans terminal.",
        accepted: ["ps aux", "ps -aux", "ps ax", "ps auxf", "ps -ef", "ps -eF", "ps -e", "ps -A"],
        output: [
          "USER       PID %CPU STAT COMMAND",
          "root         1  0.0 Ss   /sbin/init",
          "root       812  0.0 Ss   /usr/sbin/sshd -D",
          "entropia  6666 97.3 S    zombie-lord --spawn",
          "entropia  6671  0.0 Z    [worker] <defunct>",
          "entropia  6672  0.0 Z    [worker] <defunct>",
          "entropia  6673  0.0 Z    [worker] <defunct>",
        ],
      },
      {
        context: [
          "USER       PID %CPU STAT COMMAND",
          "root         1  0.0 Ss   /sbin/init",
          "root       812  0.0 Ss   /usr/sbin/sshd -D",
          "entropia  6666 97.3 S    zombie-lord --spawn",
          "entropia  6671  0.0 Z    [worker] <defunct>",
          "entropia  6672  0.0 Z    [worker] <defunct>",
          "# STAT Z = zombie : déjà mort, on ne peut plus le tuer.",
          "# Son parent, lui, est bien vivant… et il en fabrique d'autres.",
        ],
        goal: "Inutile de viser les zombies (état Z) : ils sont déjà morts. Termine leur parent, zombie-lord, avec `kill` et son PID.",
        hint: "Sur la ligne zombie-lord, le PID est le nombre de la 2e colonne. Tape kill, une espace, puis ce nombre.",
        accepted: ["kill 6666", "kill -15 6666", "kill -TERM 6666", "kill -SIGTERM 6666", "kill -9 6666", "kill -KILL 6666", "kill -SIGKILL 6666"],
        output: [],
      },
      {
        context: [
          "$ ps aux | grep zombie",
          "entropia  7013 98.1 S    zombie-lord --backup --trap SIGTERM",
          "# Les zombies ont disparu : leur parent mort, le système les a nettoyés.",
          "# Mais une copie de secours a démarré, et elle intercepte l'arrêt poli (SIGTERM).",
        ],
        goal: "La copie de secours a un nouveau PID et ignore l'arrêt poli. Envoie-lui le signal 9 (SIGKILL), le seul qu'aucun processus ne peut intercepter : on le choisit avec l'option `-9` de kill.",
        hint: "kill, puis l'option -9, puis le PID. Prends bien le NOUVEAU PID, sur la ligne --backup.",
        accepted: ["kill -9 7013", "kill -KILL 7013", "kill -SIGKILL 7013", "kill -s KILL 7013", "kill -s 9 7013", "kill -s SIGKILL 7013"],
        output: [],
      },
    ],
    defeat:
      "`ps aux` liste tous les processus, `kill PID` demande poliment l'arrêt, `kill -9 PID` le force. Un zombie (état Z) est déjà mort : on vise son parent.",
  },

  shell: {
    moduleId: "shell",
    name: "Fork Bomb",
    title: "Le script qui se clone à l'infini",
    intro:
      "Une fork bomb est un script qui se recopie sans arrêt jusqu'à étouffer la machine. Pour la désamorcer, on remonte les journaux jusqu'au script d'origine, puis on lui retire le droit de s'exécuter.",
    color: 0xff7a1a,
    phases: [
      {
        context: [
          "ALERTE  31 337 copies de bomb.sh en 10 secondes",
          "$ pwd",
          "/var/log",
          "$ tail -3 forkbomb.log",
          "03:14:07 CLONE #31335",
          "03:14:07 CLONE #31336",
          "03:14:07 CLONE #31337",
          "# Des milliers de lignes CLONE… et une seule ligne START, qui dit d'où tout est parti.",
        ],
        goal: "Retrouve la ligne START perdue dans forkbomb.log : n'affiche que les lignes qui contiennent ce mot, avec `grep`.",
        hint: "grep MOT fichier : d'abord le mot cherché, puis le nom du fichier (tu es déjà dans /var/log).",
        accepted: ["grep START forkbomb.log", 'grep "START" forkbomb.log', "grep START /var/log/forkbomb.log"],
        patterns: ['grep (-n )?"?START"? (/var/log/)?forkbomb\\.log'],
        output: ["03:00:00 START bomb.sh lancé depuis /opt/entropia/bomb.sh"],
      },
      {
        context: [
          "03:00:00 START bomb.sh lancé depuis /opt/entropia/bomb.sh",
          "$ ls -l /opt/entropia/bomb.sh",
          "-rwxr-xr-x 1 entropia entropia 42 oct. 12 03:00 /opt/entropia/bomb.sh",
          "# Chaque clone relance ce fichier. Les x de -rwxr-xr-x : tout le monde a le droit de l'exécuter.",
        ],
        goal: "Désamorce la bombe : retire au script son droit d'exécution avec `chmod`. Tu connais `+x`, qui ajoute ce droit ; le signe moins fait l'inverse : `-x` le retire. Sans ce droit, plus aucun clone ne pourra le relancer.",
        hint: "chmod -x, puis le chemin complet du script, tel qu'il apparaît dans la sortie (il commence par /opt).",
        accepted: [
          "chmod -x /opt/entropia/bomb.sh",
          "chmod a-x /opt/entropia/bomb.sh",
          "chmod ugo-x /opt/entropia/bomb.sh",
          "chmod 644 /opt/entropia/bomb.sh",
          "chmod 640 /opt/entropia/bomb.sh",
          "chmod 600 /opt/entropia/bomb.sh",
          "chmod 444 /opt/entropia/bomb.sh",
          "chmod 400 /opt/entropia/bomb.sh",
        ],
        output: [],
      },
      {
        context: [
          "$ tail -2 forkbomb.log",
          "03:14:09 CLONE #31337",
          "03:14:09 ERROR /opt/entropia/bomb.sh: Permission denied",
          "# Avant ton intervention, on comptait 31337 lignes CLONE.",
        ],
        goal: "Vérifie que la bombe est morte : compte les lignes de forkbomb.log qui contiennent CLONE. Si le total n'a pas bougé, plus aucun clone ne naît.",
        hint: "L'option -c de grep (c comme count, compter) affiche un nombre au lieu des lignes : grep -c MOT fichier.",
        accepted: ["grep -c CLONE forkbomb.log", 'grep -c "CLONE" forkbomb.log', "grep -c CLONE /var/log/forkbomb.log"],
        patterns: ['grep -c "?CLONE"? (/var/log/)?forkbomb\\.log'],
        output: ["31337"],
      },
    ],
    defeat: "`grep` retrouve une ligne dans un océan de journaux, `grep -c` compte, et `chmod` règle les droits : `+x` autorise l'exécution, `-x` la retire.",
  },

  branch: {
    moduleId: "branch",
    name: "Merge Conflict",
    title: "Deux versions, un seul fichier",
    intro:
      "Quand deux personnes modifient la même ligne d'un fichier, Git ne sait pas laquelle garder : c'est un conflit de fusion. Ce boss se nourrit de la panique ; on le bat en lisant ce que dit Git, puis en enregistrant la bonne version.",
    color: 0xf05133,
    phases: [
      {
        context: [
          "$ git pull",
          "Fusion automatique de deploy.yml",
          "CONFLIT (contenu) : Conflit de fusion dans deploy.yml",
          "La fusion automatique a échoué ; réglez les conflits et validez le résultat.",
        ],
        goal: "Pas de panique : demande d'abord à Git l'état du dépôt, pour savoir sur quelle branche tu es et quels fichiers sont en conflit.",
        hint: "git suivi du mot anglais pour « état » : `status`.",
        accepted: ["git status"],
        output: ["Sur la branche main", "Vous avez des chemins non fusionnés.", "Chemins non fusionnés :", "        modifié des deux côtés :  deploy.yml"],
      },
      {
        context: [
          "# Tu as ouvert le fichier en conflit, gardé replicas: 3 et effacé les marqueurs <<<<<<< ======= >>>>>>>",
          "$ cat deploy.yml",
          "replicas: 3",
          "image: helix/api:2.4",
          "$ git status",
          "Chemins non fusionnés :",
          "        modifié des deux côtés :  deploy.yml",
        ],
        goal: "Le fichier est réparé à la main. Dis à Git qu'il est prêt à entrer dans la prochaine version (le prochain commit).",
        hint: "C'est `git add` suivi du nom du fichier réparé (lis-le dans la sortie).",
        accepted: ["git add deploy.yml", "git add .", "git add -A", "git add --all"],
        output: [],
      },
      {
        context: [
          "$ git status",
          "Sur la branche main",
          "Tous les conflits sont réglés mais la fusion n'est pas terminée.",
          "Modifications qui seront validées :",
          "        modifié :         deploy.yml",
        ],
        goal: "Coup final : termine la fusion en enregistrant une version, avec un message entre guillemets qui explique ce que tu as fait.",
        hint: 'git commit -m suivi de ton message entre guillemets, par exemple "répare le conflit".',
        accepted: ['git commit -m "résout le conflit de deploy.yml"'],
        patterns: ['git commit -m ".+"'],
        output: ["[main 7c3d2e1] résout le conflit de deploy.yml"],
      },
    ],
    defeat:
      "Face à un conflit : `git status` pour voir, réparer le fichier à la main, `git add` pour le marquer comme résolu, `git commit -m` pour terminer la fusion.",
  },

  packet: {
    moduleId: "packet",
    name: "DDoS",
    title: "La marée de paquets",
    intro:
      "Une attaque DDoS, ce sont des milliers de machines piratées qui inondent un serveur de requêtes jusqu'à ce qu'il ne réponde plus à personne. Pour reprendre la main, on vérifie chaque couche du réseau, puis on se connecte au serveur pour activer ses défenses.",
    color: 0x2ec4ff,
    phases: [
      {
        context: [
          "ALERTE  trafic entrant : 2 400 000 requêtes/s (normal : 300)",
          "ALERTE  cible : helix.local",
          "ALERTE  sources : 40 000 adresses IP différentes",
        ],
        goal: "Le serveur visé (son nom est dans l'alerte) répond-il encore ? Envoie-lui 3 paquets de test avec `ping`.",
        hint: "ping -c 3 suivi du nom de la machine : -c (count) fixe le nombre de paquets.",
        accepted: ["ping -c 3 helix.local", "ping helix.local"],
        patterns: ["ping -c \\d+ helix\\.local"],
        output: [
          "PING helix.local (10.0.0.5) 56(84) bytes of data.",
          "64 bytes from 10.0.0.5: icmp_seq=1 ttl=64 time=812 ms",
          "--- helix.local ping statistics ---",
          "3 packets transmitted, 1 received, 66.6667% packet loss, time 2031ms",
        ],
      },
      {
        context: [
          "3 packets transmitted, 1 received, 66.6667% packet loss, time 2031ms",
          "# La machine répond à peine : 2 paquets sur 3 sont perdus.",
          "# Et le site web http://helix.local, que répond-il aux visiteurs ?",
        ],
        goal: "Interroge le site web (adresse dans la sortie) avec `curl`, en ne demandant que les en-têtes HTTP, pour lire son code de réponse.",
        hint: "L'option -I (i majuscule) de curl ne demande que les en-têtes : curl -I suivi de l'adresse complète.",
        accepted: ["curl -I http://helix.local", "curl -I helix.local", "curl --head http://helix.local", "curl --head helix.local"],
        output: ["HTTP/1.1 503 Service Unavailable", "Server: nginx/1.24.0", "Retry-After: 120"],
      },
      {
        context: [
          "HTTP/1.1 503 Service Unavailable",
          "# 503 : le serveur est débordé. Il faut agir depuis le serveur lui-même.",
          "# Fiche d'urgence  →  adresse : 10.0.0.5   compte : deploy",
          "# Le bouclier anti-DDoS s'active à la connexion du compte deploy.",
        ],
        goal: "Ouvre un terminal sécurisé sur le serveur, avec l'adresse et le compte de la fiche d'urgence, pour activer le bouclier.",
        hint: "`ssh utilisateur@adresse` : le compte, puis @, puis l'adresse IP, sans espace.",
        accepted: ["ssh deploy@10.0.0.5", "ssh -l deploy 10.0.0.5"],
        output: ["Welcome to Ubuntu 24.04.1 LTS", "[bouclier] Filtrage d'urgence activé : 39 998 adresses zombies bloquées.", "deploy@helix:~$"],
      },
    ],
    defeat:
      "Face à une panne réseau, on descend couche par couche : `ping` (la machine répond ?), `curl -I` (le site répond ?), puis `ssh` pour intervenir sur le serveur lui-même.",
  },

  gateway: {
    moduleId: "gateway",
    name: "502 Bad Gateway",
    title: "La passerelle qui ne mène nulle part",
    intro:
      "Une erreur 502 veut dire que le reverse proxy (nginx) tourne, mais n'arrive plus à joindre l'application derrière lui. Ce boss a branché la passerelle sur un port où rien n'écoute, piégé sa configuration pour bloquer la réparation, et la bombarde depuis une seule adresse.",
    color: 0xff3355,
    phases: [
      {
        // Un nginx qui répond 502 tourne forcément avec une configuration valide : la faute de frappe ne cause
        // pas le 502, elle empêche seulement de recharger la correction (nginx refuse et garde l'ancienne).
        context: [
          "$ curl -I https://helix.local",
          "HTTP/2 502",
          "server: nginx/1.24.0",
          "# ENTROPIA a branché nginx sur le port 9999, où l'application n'écoute pas : d'où le 502.",
          "# Tu as remis le bon port dans la configuration… mais le rechargement échoue :",
          "Job for nginx.service failed because the control process exited with error code.",
        ],
        goal: "nginx refuse ta nouvelle configuration. Avant de réessayer, fais-lui vérifier qu'elle est valide, sans l'appliquer, pour savoir ce qui cloche.",
        hint: "nginx suivi de l'option -t (t comme test).",
        accepted: ["nginx -t"],
        output: [
          'nginx: [emerg] unknown directive "proxy_passs" in /etc/nginx/sites-enabled/helix:14',
          "nginx: configuration file /etc/nginx/nginx.conf test failed",
        ],
      },
      {
        context: [
          'nginx: [emerg] unknown directive "proxy_passs" in /etc/nginx/sites-enabled/helix:14',
          "# Le piège d'ENTROPIA : une faute de frappe. Tant qu'elle est là, nginx refuse toute nouvelle",
          "# configuration et garde l'ancienne, celle du port mort. Tu l'as corrigée à la ligne 14.",
          "$ sudo nginx -t",
          "nginx: the configuration file /etc/nginx/nginx.conf syntax is ok",
          "nginx: configuration file /etc/nginx/nginx.conf test is successful",
        ],
        goal: "La configuration est valide. Applique-la avec `systemctl` sans couper les visiteurs déjà connectés : on recharge, on ne redémarre pas.",
        hint: "sudo systemctl reload suivi du nom du service, nginx. « reload » relit la configuration sans couper les connexions.",
        accepted: ["systemctl reload nginx", "systemctl reload nginx.service", "nginx -s reload"],
        output: [],
      },
      {
        context: [
          "# Rechargé : le 502 a disparu, nginx joint de nouveau l'application. Mais son journal s'affole :",
          "$ sudo tail -4 /var/log/nginx/access.log",
          '203.0.113.66 - - "GET /admin HTTP/1.1" 403',
          '203.0.113.66 - - "GET /admin HTTP/1.1" 403',
          '198.51.100.7 - - "GET / HTTP/1.1" 200',
          '203.0.113.66 - - "GET /admin HTTP/1.1" 403',
          "# Une seule adresse martèle /admin des milliers de fois par seconde.",
        ],
        goal: "Une adresse IP bombarde la passerelle (lis le journal). Bloque tout ce qui vient d'elle dans le pare-feu `ufw`, comme ton gadget contre les caméras.",
        hint: "sudo ufw deny from suivi de l'adresse IP qui revient sans cesse dans le journal.",
        accepted: ["ufw deny from 203.0.113.66", "ufw deny from 203.0.113.66 to any", "ufw insert 1 deny from 203.0.113.66"],
        output: ["Rule added"],
      },
    ],
    defeat:
      "Un 502, c'est nginx qui tourne mais ne joint plus l'application. nginx refuse toute configuration invalide et garde l'ancienne : on teste (`nginx -t`) avant de recharger (`systemctl reload nginx`), puis on ferme le pare-feu à l'adresse hostile (`ufw deny from IP`).",
  },

  container: {
    moduleId: "container",
    name: "OOMKiller",
    title: "Le conteneur qui dévore la mémoire",
    intro:
      "Quand la mémoire est pleine, Linux déclenche son « OOM killer », qui abat des programmes pour survivre. Ce boss est un conteneur glouton qui provoque ces exécutions en série, jusqu'à faire tomber la base de données.",
    color: 0x1d9bf0,
    phases: [
      {
        context: [
          "ALERTE  mémoire de l'hôte : 15,8 Go / 16 Go",
          "kernel: Out of memory: Killed process 2211 (postgres)",
          "kernel: Out of memory: Killed process 2240 (nginx)",
          "# Un conteneur gonfle sans arrêt. Lequel ?",
        ],
        goal: "Liste les conteneurs Docker en cours d'exécution pour repérer l'intrus.",
        hint: "docker suivi de deux lettres, comme la commande Linux qui liste les processus.",
        accepted: ["docker ps", "docker container ls", "docker container ps", "docker ps -a"],
        output: [
          "CONTAINER ID   IMAGE                    STATUS                           NAMES",
          "3f2a1c9e8b7d   nginx:1.27               Restarting (137) 4 seconds ago   web",
          "9b1e77aa0c42   postgres:16              Restarting (137) 9 seconds ago   db",
          "e1d0c0ffee42   entropia/hydra:latest    Up 6 minutes                     hydra",
        ],
      },
      {
        context: [
          "CONTAINER ID   IMAGE                    STATUS                           NAMES",
          "3f2a1c9e8b7d   nginx:1.27               Restarting (137) 4 seconds ago   web",
          "9b1e77aa0c42   postgres:16              Restarting (137) 9 seconds ago   db",
          "e1d0c0ffee42   entropia/hydra:latest    Up 6 minutes                     hydra",
          "# Code 137 = conteneur tué faute de mémoire. Un seul reste debout…",
        ],
        goal: "Un seul conteneur ne se fait jamais tuer. Lis ses journaux avec Docker pour comprendre ce qu'il fabrique.",
        hint: "docker logs suivi du nom du conteneur (colonne NAMES).",
        accepted: ["docker logs hydra", "docker container logs hydra", "docker logs e1d0c0ffee42"],
        output: [
          "[hydra] réservation de 512 Mo… OK",
          "[hydra] réservation de 512 Mo… OK",
          "[hydra] mémoire réservée : 15,2 Go — je ne rends jamais rien",
          "[hydra] prochaine victime : db",
        ],
      },
      {
        context: [
          "[hydra] réservation de 512 Mo… OK",
          "[hydra] mémoire réservée : 15,2 Go — je ne rends jamais rien",
          "[hydra] prochaine victime : db",
        ],
        goal: "Plus de doute : arrête ce conteneur par son nom avant qu'il n'avale la base de données.",
        hint: "docker stop suivi du nom du conteneur, comme ton gadget contre les sentinelles.",
        accepted: [
          "docker stop hydra",
          "docker kill hydra",
          "docker container stop hydra",
          "docker container kill hydra",
          "docker rm -f hydra",
          "docker stop e1d0c0ffee42",
          "docker kill e1d0c0ffee42",
        ],
        output: ["hydra"],
      },
    ],
    defeat:
      "`docker ps` montre l'état des conteneurs, `docker logs` raconte ce qu'ils font, `docker stop` arrête le fautif. En production, on fixe aussi une limite de mémoire à chaque conteneur.",
  },

  nimbus: {
    moduleId: "nimbus",
    name: "Facture Infinie",
    title: "Le compte cloud qui dépense sans compter",
    intro:
      "Dans le cloud, on paie à l'usage : une ressource oubliée ou une clé volée peut faire grimper la facture sans fin. Ce boss se cache derrière une clé d'accès qui avait bien trop de droits.",
    color: 0xff9900,
    phases: [
      {
        context: [
          "ALERTE BUDGET AWS  dépensé depuis minuit : 48 213,77 $ (budget du mois : 900 $)",
          "Poste principal : S3 (stockage), +2 To par minute",
        ],
        goal: "Le stockage S3 explose. Liste tous les buckets du compte avec l'outil `aws` pour trouver l'intrus.",
        hint: "L'outil aws, le service s3, puis ls pour lister, comme sous Linux.",
        accepted: ["aws s3 ls"],
        output: ["2026-03-12 09:41:02 helix-backups", "2026-05-02 14:03:55 helix-website", "2026-10-12 00:00:07 facture-infinie-7731"],
      },
      {
        context: [
          "2026-03-12 09:41:02 helix-backups",
          "2026-05-02 14:03:55 helix-website",
          "2026-10-12 00:00:07 facture-infinie-7731",
          "# Un bucket a été créé à minuit pile, juste quand la facture s'est emballée.",
        ],
        goal: "Liste le contenu du bucket créé à minuit (lis son nom) pour voir ce qui s'y entasse.",
        hint: "La même commande que pour lister les buckets, suivie de l'adresse du bucket : s3:// puis son nom.",
        accepted: ["aws s3 ls s3://facture-infinie-7731/", "aws s3 ls s3://facture-infinie-7731"],
        output: [
          "2026-10-12 00:00:08 5497558138880 copie-00001.bin",
          "2026-10-12 00:00:09 5497558138880 copie-00002.bin",
          "…",
          "2026-10-12 23:58:41 5497558138880 copie-14102.bin",
        ],
      },
      {
        context: [
          "# 14 102 fichiers de 5 To : voilà la facture infinie.",
          "# Le journal d'audit d'AWS est formel : ce bucket a été créé depuis ce serveur-ci (ci-01),",
          "# avec ses propres clés d'accès. Mais à qui appartiennent-elles ?",
        ],
        goal: "Démasque la clé utilisée : demande à AWS avec quelle identité ce serveur est connecté.",
        hint: "Le service STS répond à la question « qui suis-je ? » : aws sts suivi de get-caller-identity.",
        accepted: ["aws sts get-caller-identity"],
        output: [
          "{",
          '    "UserId": "AIDA7731ENTROPIA",',
          '    "Account": "123456789012",',
          '    "Arn": "arn:aws:iam::123456789012:user/ci-deploy"',
          "}",
        ],
      },
    ],
    defeat:
      "La clé ci-deploy ne servait qu'à déployer, mais elle avait tous les droits : ENTROPIA n'a eu qu'à la voler. Moindre privilège et œil sur la facture : `aws s3 ls` pour voir, `aws sts get-caller-identity` pour savoir qui agit.",
  },

  blueprint: {
    moduleId: "blueprint",
    name: "Dérive d'état",
    title: "Quand la réalité ne ressemble plus au code",
    intro:
      "Avec Terraform, le code décrit l'infrastructure. Ce boss naît chaque fois que quelqu'un modifie un serveur à la main dans la console : la réalité s'éloigne du code, sans que personne ne le sache.",
    color: 0x7b42bc,
    phases: [
      {
        context: [
          "$ git clone git@github.com:helix-corp/infra.git && cd infra",
          "$ ls -a",
          ".  ..  main.tf  variables.tf",
          "# Machine neuve : pas de dossier .terraform, aucun plugin téléchargé.",
        ],
        goal: "Tu reprends l'infrastructure sur une machine neuve. Prépare le projet Terraform (téléchargement des plugins) avant toute autre commande.",
        hint: "La toute première commande d'un projet : terraform suivi de l'abréviation de « initialiser ».",
        accepted: ["terraform init"],
        output: ["Initializing provider plugins...", "- Installing hashicorp/aws v5.70.0...", "Terraform has been successfully initialized!"],
      },
      {
        context: [
          "Terraform has been successfully initialized!",
          "ALERTE  le pare-feu cloud sg-web autorise maintenant le port 22 au monde entier",
          "# Pourtant, personne n'a modifié main.tf…",
        ],
        goal: "Compare le code et la réalité : demande à Terraform ce qu'il changerait, sans rien toucher.",
        hint: "C'est l'aperçu sans risque de Terraform : terraform suivi du mot anglais pour « planifier ».",
        accepted: ["terraform plan", "terraform plan -out=tfplan", "terraform plan -out tfplan"],
        output: [
          "aws_security_group.web: Refreshing state... [id=sg-0a1b2c3d]",
          '  ~ resource "aws_security_group" "web" {',
          '      - ingress { from_port = 22, cidr_blocks = ["0.0.0.0/0"] }   # ajouté à la main',
          "    }",
          "Plan: 0 to add, 1 to change, 0 to destroy.",
        ],
      },
      {
        context: [
          '  ~ resource "aws_security_group" "web" {',
          '      - ingress { from_port = 22, cidr_blocks = ["0.0.0.0/0"] }   # ajouté à la main',
          "    }",
          "Plan: 0 to add, 1 to change, 0 to destroy.",
        ],
        goal: "Le plan retire la règle ajoutée à la main et ne détruit rien. Applique-le pour remettre la réalité en accord avec le code.",
        hint: "Après plan vient… terraform apply.",
        accepted: ["terraform apply", "terraform apply -auto-approve", "terraform apply tfplan"],
        output: [
          "aws_security_group.web: Modifying... [id=sg-0a1b2c3d]",
          "aws_security_group.web: Modifications complete after 2s",
          "Apply complete! Resources: 0 added, 1 changed, 0 destroyed.",
        ],
      },
    ],
    defeat:
      "init → plan → apply. Le plan révèle la dérive (ce qui a été modifié à la main), apply remet la réalité en accord avec le code. Règle d'or : tout changement passe par le code.",
  },

  puppeteer: {
    moduleId: "puppeteer",
    name: "Config Drift",
    title: "Trois serveurs, trois configurations",
    intro:
      "Ce boss modifie les serveurs un par un, à la main, jusqu'à ce qu'aucun ne ressemble plus aux autres. Ansible le combat avec un playbook : une seule description, appliquée partout à l'identique.",
    color: 0xee0000,
    phases: [
      {
        context: ["$ cat inventory.ini", "[web]", "web1", "web2", "web3", "# ENTROPIA s'est connecté en douce sur certains de ces serveurs."],
        goal: "Vérifie qu'Ansible joint bien tous les serveurs de l'inventaire inventory.ini, avec son module ping.",
        hint: "ansible all -i inventaire -m ping : all = tous les serveurs, -i = le fichier d'inventaire, -m = le module.",
        accepted: ["ansible all -i inventory.ini -m ping", "ansible -i inventory.ini all -m ping", "ansible web -i inventory.ini -m ping", "ansible -i inventory.ini web -m ping"],
        output: ['web1 | SUCCESS => {"ping": "pong"}', 'web2 | SUCCESS => {"ping": "pong"}', 'web3 | SUCCESS => {"ping": "pong"}'],
      },
      {
        context: [
          'web1 | SUCCESS => {"ping": "pong"}',
          'web2 | SUCCESS => {"ping": "pong"}',
          'web3 | SUCCESS => {"ping": "pong"}',
          "# Les 3 répondent. Mais lesquels ont été modifiés à la main ?",
        ],
        goal: "Simule le playbook site.yml sur l'inventaire, en mode vérification : il montre ce qu'il changerait, sans rien modifier.",
        hint: "La commande habituelle (ansible-playbook, -i inventory.ini, site.yml), suivie de l'option --check.",
        accepted: [
          "ansible-playbook -i inventory.ini site.yml --check",
          "ansible-playbook site.yml -i inventory.ini --check",
          "ansible-playbook -i inventory.ini site.yml --check --diff",
          "ansible-playbook --check -i inventory.ini site.yml",
        ],
        output: [
          "TASK [Configurer nginx] ok: [web1] changed: [web2] changed: [web3]",
          "PLAY RECAP",
          "web1 : ok=3 changed=0 failed=0",
          "web2 : ok=3 changed=1 failed=0",
          "web3 : ok=3 changed=1 failed=0",
        ],
      },
      {
        context: [
          "PLAY RECAP",
          "web1 : ok=3 changed=0 failed=0",
          "web2 : ok=3 changed=1 failed=0",
          "web3 : ok=3 changed=1 failed=0",
          "# changed=1 : ces serveurs ont dérivé. changed=0 : conforme.",
        ],
        goal: "Deux serveurs ont dérivé. Lance le playbook pour de vrai : chacun reviendra à l'état décrit, et le serveur conforme ne sera pas touché (idempotence).",
        hint: "Exactement la même commande que la simulation, mais sans --check.",
        accepted: ["ansible-playbook -i inventory.ini site.yml", "ansible-playbook site.yml -i inventory.ini"],
        output: [
          "TASK [Configurer nginx] ok: [web1] changed: [web2] changed: [web3]",
          "PLAY RECAP",
          "web1 : ok=3 changed=0 failed=0",
          "web2 : ok=3 changed=1 failed=0",
          "web3 : ok=3 changed=1 failed=0",
        ],
      },
    ],
    defeat:
      "Ansible ramène chaque serveur à l'état décrit dans le playbook. Grâce à l'idempotence, un serveur déjà conforme n'est pas touché : on peut relancer sans crainte, et `--check` permet de regarder avant d'agir.",
  },

  pipeline: {
    moduleId: "pipeline",
    name: "Build Rouge",
    title: "La CI qui refuse de passer au vert",
    intro:
      "Ce boss bloque toute mise en production en gardant la CI au rouge. On ne le contourne jamais : on lit le journal d'échec, on corrige, on prouve que les tests passent, puis on enregistre la correction.",
    color: 0xd73a49,
    phases: [
      {
        context: ["ALERTE  déploiement bloqué depuis 3 h : la CI de la branche hotfix est rouge.", "# Il faut d'abord retrouver l'exécution qui a échoué."],
        goal: "Liste les dernières exécutions du pipeline avec l'outil `gh` de GitHub, pour trouver l'identifiant de celle qui a échoué.",
        hint: "gh run list : run = une exécution du pipeline, list = lister.",
        accepted: ["gh run list"],
        output: [
          "STATUS  TITLE                  WORKFLOW  BRANCH   ID",
          "X       corrige la remise      CI        hotfix   6602",
          "✓       ajoute le panier       CI        main     6588",
        ],
      },
      {
        context: [
          "STATUS  TITLE                  WORKFLOW  BRANCH   ID",
          "X       corrige la remise      CI        hotfix   6602",
          "✓       ajoute le panier       CI        main     6588",
          "# X = échec. Note bien son identifiant (colonne ID).",
        ],
        goal: "Affiche uniquement les journaux en échec de l'exécution rouge (son ID est dans la liste).",
        hint: "gh run view, puis l'ID, puis l'option --log-failed (seulement les journaux en échec).",
        accepted: ["gh run view 6602 --log-failed"],
        patterns: ["gh run view --log-failed 6602"],
        output: ["test  ✕ panier : total avec 10 % de remise", "test    Expected: 90   Received: -10", "test  Tests: 1 failed, 57 passed"],
      },
      {
        context: [
          "test    Expected: 90   Received: -10",
          "# ENTROPIA avait inversé un signe dans panier.js. Tu l'as corrigé.",
          "$ npm test",
          "Tests: 58 passed, 58 total",
        ],
        goal: "Tout est vert en local. Enregistre la correction en une seule commande : tous les fichiers modifiés, avec un message entre guillemets.",
        hint: "git commit avec -a (tous les fichiers modifiés) et -m (le message), collés en -am, puis ton message entre guillemets.",
        accepted: ['git commit -am "fix: signe de la remise"'],
        patterns: ['git commit -am ".+"', 'git commit -a -m ".+"', 'git commit -m ".+" -a'],
        output: ["[hotfix 9d3e5f1] fix: signe de la remise", " 1 file changed, 1 insertion(+), 1 deletion(-)"],
      },
    ],
    defeat:
      "CI rouge : `gh run list` pour trouver l'échec, `gh run view ID --log-failed` pour lire la cause, corriger, prouver avec `npm test`, puis committer et pousser.",
  },

  vault: {
    moduleId: "vault",
    name: "Secret Exposé",
    title: "Le mot de passe qui traîne en clair",
    intro:
      "Un secret écrit dans le code finit dans Git, où il reste pour toujours dans l'historique. Ce boss se nourrit des mots de passe oubliés en clair ; on le bat en les rangeant dans un coffre-fort comme Vault.",
    color: 0xffd814,
    phases: [
      {
        context: ["ALERTE  un robot a trouvé un mot de passe sur GitHub : DB_PASSWORD=hx-pass-2026", "# Dans quel fichier du code se cache-t-il ?"],
        goal: "Cherche le nom de cette variable (DB_PASSWORD) dans tous les fichiers du dossier courant et de ses sous-dossiers, avec `grep`.",
        hint: "L'option -r de grep fouille tous les sous-dossiers : grep -r MOT . (le point = le dossier courant).",
        accepted: ["grep -r DB_PASSWORD .", 'grep -r "DB_PASSWORD" .', "grep -rn DB_PASSWORD .", "grep -r hx-pass-2026 ."],
        patterns: ['grep -(r|R|rn|nr|Rn|nR) "?(DB_PASSWORD|hx-pass-2026)"? \\./?'],
        output: ["./deploy/db.env:DB_PASSWORD=hx-pass-2026"],
      },
      {
        context: [
          "./deploy/db.env:DB_PASSWORD=hx-pass-2026",
          "# L'équipe base de données a révoqué ce mot de passe et en a créé un neuf :",
          "#   nouveau mot de passe : Zq7-ombre-2027",
        ],
        goal: "Range le NOUVEAU mot de passe (lis-le dans la sortie) dans Vault, au chemin secret/db, sous la clé password.",
        hint: "vault kv put, puis le chemin, puis clé=valeur sans espace autour du = : ici secret/db et password=…",
        accepted: ["vault kv put secret/db password=Zq7-ombre-2027"],
        patterns: ['vault kv put secret/db password="?Zq7-ombre-2027"?'],
        output: ["== Secret Path ==", "secret/data/db", "version    1"],
      },
      {
        context: [
          "$ vault kv get secret/db",
          "====== Data ======",
          "Key         Value",
          "password    Zq7-ombre-2027",
          "# Le secret est au coffre. Mais l'ancien fichier traîne encore dans le dépôt :",
          "./deploy/db.env:DB_PASSWORD=hx-pass-2026",
        ],
        goal: "Coup final : supprime du dépôt Git le fichier qui contenait le mot de passe en clair (son chemin est dans la sortie).",
        hint: "git rm suivi du chemin du fichier : tout ce qui précède le premier deux-points (:) de la ligne.",
        accepted: ["git rm deploy/db.env", "git rm ./deploy/db.env"],
        output: ["rm 'deploy/db.env'"],
      },
    ],
    defeat:
      "Secret exposé : le révoquer, ranger le nouveau au coffre (`vault kv put`), puis l'effacer du code (`git rm`). Et ne plus jamais l'écrire en clair.",
  },

  helm: {
    moduleId: "helm",
    name: "CrashLoopBackOff",
    title: "Le pod qui ressuscite pour mourir",
    intro:
      "Kubernetes redémarre automatiquement un conteneur qui plante. Mais s'il plante à chaque démarrage, il tourne en boucle : c'est le CrashLoopBackOff, et ce boss ne meurt jamais tant que la cause n'est pas corrigée.",
    color: 0x326ce5,
    phases: [
      {
        context: ["ALERTE  l'API d'Helix répond 503 depuis 6 minutes", "# Kubernetes la redémarre sans cesse. Quel pod pose problème ?"],
        goal: "Liste les pods du cluster avec `kubectl` pour repérer celui qui plante en boucle.",
        hint: "kubectl get pods : get = afficher, pods = les pods.",
        accepted: ["kubectl get pods", "kubectl get pod", "kubectl get po"],
        output: [
          "NAME                   READY   STATUS             RESTARTS   AGE",
          "api-6f7c9d8b4-r8w2z    0/1     CrashLoopBackOff   9          6m",
          "web-5c8d7f9b4-qm7nz    1/1     Running            0          3h",
        ],
      },
      {
        context: [
          "NAME                   READY   STATUS             RESTARTS   AGE",
          "api-6f7c9d8b4-r8w2z    0/1     CrashLoopBackOff   9          6m",
          "web-5c8d7f9b4-qm7nz    1/1     Running            0          3h",
        ],
        goal: "Lis les journaux du pod en CrashLoopBackOff (recopie son nom complet) pour connaître la cause de ses plantages.",
        hint: "kubectl logs suivi du nom complet du pod, lu dans la colonne NAME.",
        accepted: [
          "kubectl logs api-6f7c9d8b4-r8w2z",
          "kubectl logs api-6f7c9d8b4-r8w2z --previous",
          "kubectl logs --previous api-6f7c9d8b4-r8w2z",
          "kubectl logs -p api-6f7c9d8b4-r8w2z",
          "kubectl logs api-6f7c9d8b4-r8w2z -p",
        ],
        output: ["Démarrage de l'API v2.4…", "Error: impossible de lire /config/api.yaml (fichier absent)", "Arrêt du processus (code 1)"],
      },
      {
        context: [
          "Error: impossible de lire /config/api.yaml (fichier absent)",
          "# ENTROPIA a supprimé la configuration de l'API (un ConfigMap).",
          "# Tu l'as réécrite dans le fichier api-config.yaml.",
        ],
        goal: "Envoie au cluster le fichier que tu viens d'écrire (son nom est dans la sortie) pour recréer la configuration manquante.",
        hint: "kubectl apply -f suivi du nom du fichier : -f = file (fichier).",
        accepted: ["kubectl apply -f api-config.yaml", "kubectl apply -f ./api-config.yaml"],
        output: ["configmap/api-config created"],
      },
    ],
    defeat:
      "CrashLoopBackOff : `kubectl get pods` pour repérer, `kubectl logs` pour la cause, `kubectl apply -f` pour corriger. Supprimer le pod ne suffit pas : il reviendrait avec la même erreur.",
  },

  sync: {
    moduleId: "sync",
    name: "OutOfSync",
    title: "Le cluster qui n'écoute plus Git",
    intro:
      "En GitOps, le cluster doit refléter exactement ce qui est écrit dans Git. Ce boss glisse un commit piégé dans le dépôt de configuration ; on le bat depuis Git, pas en bricolant le cluster.",
    color: 0xef7b4d,
    phases: [
      {
        context: ["ALERTE  le site est tombé à 23:41, juste après une mise à jour du dépôt de configuration", "$ cd ~/helix-config"],
        goal: "Affiche les 3 derniers commits du dépôt, un par ligne, pour trouver le coupable.",
        hint: "git log avec l'option --oneline (une ligne par commit), puis -3 (les 3 derniers).",
        accepted: ["git log --oneline -3", "git log --oneline -n 3", "git log -3 --oneline", "git log -n 3 --oneline", "git log --oneline"],
        output: ["f00dbad (HEAD -> main) mise à l'échelle : replicas: 0", "a1b2c3d passe l'API en v2.1", "9f8e7d6 ajoute un réplica au front"],
      },
      {
        context: [
          "f00dbad (HEAD -> main) mise à l'échelle : replicas: 0",
          "a1b2c3d passe l'API en v2.1",
          "9f8e7d6 ajoute un réplica au front",
          "# replicas: 0 = plus aucun exemplaire de l'API ! Ce commit d'ENTROPIA est le coupable.",
        ],
        goal: "Annule le commit fautif en créant un commit inverse (on ne réécrit jamais l'historique partagé). Vise-le par son identifiant ou par HEAD.",
        hint: "git revert suivi de l'identifiant du commit (les 7 caractères au début de sa ligne), ou HEAD pour le dernier.",
        accepted: ["git revert f00dbad", "git revert HEAD", "git revert --no-edit f00dbad", "git revert --no-edit HEAD"],
        output: ["[main 3c4d5e6] Revert \"mise à l'échelle : replicas: 0\"", " 1 file changed, 1 insertion(+), 1 deletion(-)"],
      },
      {
        context: [
          "$ git push",
          "   f00dbad..3c4d5e6  main -> main",
          "$ argocd app get helix",
          "Sync Status:   OutOfSync from main (3c4d5e6)",
          "Health Status: Degraded",
        ],
        goal: "Git est réparé, mais l'application helix est encore OutOfSync. Demande à ArgoCD de la synchroniser avec Git.",
        hint: "argocd app sync suivi du nom de l'application (celui qui suit argocd app get).",
        accepted: ["argocd app sync helix"],
        output: ["Operation:     Sync", "Sync Status:   Synced to main (3c4d5e6)", "Health Status: Healthy"],
      },
    ],
    defeat: "En GitOps, Git est la source de vérité : `git revert` annule proprement une erreur, `argocd app sync` remet le cluster en accord avec Git.",
  },

  watchtower: {
    moduleId: "watchtower",
    name: "Tempête d'alertes",
    title: "Mille alarmes, une seule cause",
    intro:
      "Trop d'alertes tue l'alerte : noyée sous les notifications, l'équipe ne voit plus l'essentiel. Ce boss déclenche des centaines d'alarmes pour cacher une seule vraie panne.",
    color: 0xe6522c,
    phases: [
      {
        context: [
          "1 247 alertes en 5 minutes :",
          "ALERTE  CPU élevé sur web1",
          "ALERTE  latence élevée sur /api/panier",
          "ALERTE  erreurs 500 en hausse",
          "ALERTE  CPU élevé sur web1",
          "… (1 243 autres)",
          "# Toutes pointent vers la même machine, web1, qui suffoque. Tu y es connecté.",
        ],
        goal: "Affiche en direct le classement des processus de web1 qui consomment le plus de processeur.",
        hint: "La commande s'appelle `top` : le haut du classement, mis à jour en direct.",
        accepted: ["top", "htop"],
        output: [
          "  PID USER      %CPU %MEM COMMAND",
          " 5150 www-data  198.7 31.2 helix-worker",
          " 4242 www-data   12.0  9.1 helix-api",
          "  812 root        0.3  0.1 sshd",
        ],
      },
      {
        context: [
          "  PID USER      %CPU %MEM COMMAND",
          " 5150 www-data  198.7 31.2 helix-worker",
          " 4242 www-data   12.0  9.1 helix-api",
          "  812 root        0.3  0.1 sshd",
          "# Chaque programme de cette machine tourne comme un service systemd du même nom.",
        ],
        goal: "Un processus écrase tous les autres (lis son nom en tête du classement). Lis les journaux de son service avec `journalctl`.",
        hint: "journalctl -u suivi du nom du service (-u = unit, le service systemd).",
        accepted: ["journalctl -u helix-worker", "journalctl -u helix-worker -n 20", "journalctl -u helix-worker.service"],
        patterns: ["journalctl -u helix-worker(\\.service)?( -n \\d+)?", "journalctl -n \\d+ -u helix-worker(\\.service)?"],
        output: [
          "helix-worker[5150]: tâche « relance-paniers » lancée",
          "helix-worker[5150]: WARN la tâche se relance elle-même (boucle infinie)",
          "helix-worker[5150]: ERROR 500 renvoyée à /api/panier (x3912)",
        ],
      },
      {
        context: [
          "helix-worker[5150]: WARN la tâche se relance elle-même (boucle infinie)",
          "helix-worker[5150]: ERROR 500 renvoyée à /api/panier (x3912)",
          "# Une seule cause derrière 1 247 alertes : la boucle de ce service.",
        ],
        goal: "La cause est trouvée. Redémarre proprement le service fautif avec `systemctl` pour casser la boucle.",
        hint: "sudo systemctl restart suivi du nom du service (il apparaît au début de chaque ligne de journal).",
        accepted: ["systemctl restart helix-worker", "systemctl restart helix-worker.service"],
        output: [],
      },
    ],
    defeat:
      "Une bonne enquête va du symptôme à la cause : `top` (qui consomme ?), `journalctl -u` (que dit-il ?), puis une seule action ciblée. Et on alerte sur ce que vivent les utilisateurs, pas sur chaque pic.",
  },

  architect: {
    moduleId: "architect",
    name: "ENTROPIA",
    title: "Le point unique de panne en personne",
    intro:
      "ENTROPIA, c'est le chaos qui attend la moindre faiblesse : un seul serveur, une seule copie, une sauvegarde jamais testée. Pour la vaincre, il faut une infrastructure qui survit à la perte de n'importe quelle pièce.",
    color: 0xff003c,
    phases: [
      {
        context: [
          "ENTROPIA : « Tout Helix repose sur un seul exemplaire de l'API. Il me suffit de l'abattre. »",
          "# Vérifie ce qu'elle affirme dans Kubernetes.",
        ],
        goal: "Affiche le déploiement Kubernetes nommé api pour voir combien d'exemplaires sont prêts.",
        hint: "kubectl get deployment suivi du nom du déploiement.",
        accepted: ["kubectl get deployment api", "kubectl get deploy api", "kubectl get deployments api", "kubectl get deployment/api"],
        output: ["NAME   READY   UP-TO-DATE   AVAILABLE   AGE", "api    1/1     1            1           42d"],
      },
      {
        context: [
          "NAME   READY   UP-TO-DATE   AVAILABLE   AGE",
          "api    1/1     1            1           42d",
          "# READY 1/1 : un seul exemplaire. S'il tombe, tout tombe.",
        ],
        goal: "Supprime ce point unique de panne : passe le déploiement api à 3 exemplaires (réplicas).",
        hint: "kubectl scale deployment api, puis l'option --replicas=3 (sans espace autour du =).",
        accepted: [
          "kubectl scale deployment api --replicas=3",
          "kubectl scale deploy api --replicas=3",
          "kubectl scale deployments api --replicas=3",
          "kubectl scale deployment/api --replicas=3",
          "kubectl scale --replicas=3 deployment api",
          "kubectl scale --replicas=3 deployment/api",
        ],
        output: ["deployment.apps/api scaled"],
      },
      {
        context: [
          "ENTROPIA : « Trois copies ? Alors j'efface la base de données ! »",
          "$ ls /backups",
          "helix-2026-10-11.dump  helix-2026-10-12.dump",
          "# Une sauvegarde jamais restaurée n'est qu'un espoir. La base de secours s'appelle secours.",
        ],
        goal: "Prouve que la sauvegarde la plus récente fonctionne : restaure-la dans la base secours avec `pg_restore` (chemin complet du fichier).",
        hint: "pg_restore -d puis le nom de la base cible, puis le chemin /backups/… du fichier le plus récent (la date la plus grande).",
        accepted: [
          "pg_restore -d secours /backups/helix-2026-10-12.dump",
          "pg_restore --dbname=secours /backups/helix-2026-10-12.dump",
          "pg_restore /backups/helix-2026-10-12.dump -d secours",
        ],
        output: ["pg_restore: connexion à la base « secours »", "pg_restore: 42 tables restaurées, 0 erreur"],
      },
    ],
    defeat:
      "Plus de point unique de panne : trois réplicas (`kubectl scale`) et une sauvegarde prouvée par une vraie restauration (`pg_restore`). Le chaos n'a plus de prise sur une infrastructure conçue pour survivre.",
  },
};

/**
 * Boss d'un module. `Object.hasOwn` plutôt qu'un simple accès : l'identifiant peut venir d'une sauvegarde
 * modifiable, et « toString » ou « __proto__ » ne doivent jamais passer pour un boss.
 */
export function bossFor(moduleId: string): BossDefinition {
  const boss = Object.hasOwn(BOSSES, moduleId) ? BOSSES[moduleId] : undefined;
  if (!boss) throw new RangeError(`Aucun boss pour le module « ${moduleId} »`);
  return boss;
}
