import { createTranslator } from "../translator";

export const t = createTranslator("combat", {
  fr: {
    sentinelName: "sentinelle-{number}",
    firewallLabel: "pare-feu",
    killObjective: "La sentinelle est suspendue : repère le PID de son processus et termine-le avant qu'il ne reprenne.",
    killHint: "kill suivi du PID (le numéro de la colonne PID sur la ligne de la sentinelle, celle en état T).",
    killNote:
      "Ta balle IEM a envoyé le signal SIGSTOP : le processus est suspendu (STAT = T), mais il reprendra tout seul. `kill` le termine pour de bon. Ne te trompe pas de ligne : arrêter sshd couperait ton propre accès !",
    dockerObjective: "La sentinelle tourne dans un conteneur, gelé par ta balle : arrête-le par son nom.",
    dockerHint: "docker stop suivi du nom du conteneur (colonne NAMES).",
    dockerNote:
      "Ta balle a gelé le conteneur comme le ferait `docker pause` (statut Paused). `docker stop` l'arrête pour de bon. On peut viser un conteneur par son nom ou son identifiant.",
    kubectlObjective: "La sentinelle est un pod Kubernetes, sonné par ta balle : supprime-le.",
    kubectlHint: "kubectl delete pod suivi du nom complet du pod (colonne NAME).",
    kubectlNote: "Le pod ne répond plus (READY 0/1). Il n'est géré par aucun Deployment : une fois supprimé, Kubernetes ne le recréera pas.",
    firewallObjective: "Ta balle n'a brouillé la caméra que quelques secondes. Coupe son flux pour de bon : bloque son adresse IP dans le pare-feu.",
    firewallHint: "sudo ufw deny from suivi de l'adresse IP de la caméra (après « IP » dans la sortie).",
    firewallNote: "Tu es sur le serveur de la salle de contrôle : refuser tout ce qui vient de l'IP de la caméra coupe son flux, définitivement.",
    rtspStream: "RTSP flux vidéo {name}",
  },
  en: {
    sentinelName: "sentinel-{number}",
    firewallLabel: "firewall",
    killObjective: "The sentinel is suspended: find the PID of its process and kill it before it wakes back up.",
    killHint: "kill followed by the PID (the number in the PID column, on the sentinel's line, the one in state T).",
    killNote:
      "Your EMP round sent the SIGSTOP signal: the process is suspended (STAT = T), but it will resume on its own. `kill` ends it for good. Don't pick the wrong line: stopping sshd would cut off your own access!",
    dockerObjective: "The sentinel runs in a container, frozen by your round: stop it by its name.",
    dockerHint: "docker stop followed by the container name (NAMES column).",
    dockerNote:
      "Your round froze the container the way `docker pause` would (Paused status). `docker stop` stops it for good. You can target a container by its name or its ID.",
    kubectlObjective: "The sentinel is a Kubernetes pod, stunned by your round: delete it.",
    kubectlHint: "kubectl delete pod followed by the full pod name (NAME column).",
    kubectlNote: "The pod no longer responds (READY 0/1). No Deployment manages it: once deleted, Kubernetes won't recreate it.",
    firewallObjective: "Your round only jammed the camera for a few seconds. Cut its feed for good: block its IP address in the firewall.",
    firewallHint: "sudo ufw deny from followed by the camera's IP address (after \"IP\" in the output).",
    firewallNote: "You are on the control room server: denying everything that comes from the camera's IP cuts its feed, permanently.",
    rtspStream: "RTSP video stream {name}",
  },
});
