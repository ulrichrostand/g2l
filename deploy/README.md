# Déployer sur un VPS

Ce guide met en ligne le site **et** l'API sur ton VPS, avec HTTPS automatique. Il suppose un VPS Linux (Ubuntu ou Debian) et un **nom de domaine** que tu contrôles. Sans domaine, ne mets pas les comptes en ligne : les cookies de session sécurisés exigent HTTPS.

## 0. Avant de commencer

1. Un nom de domaine (ex. `g2l.example`) dont l'enregistrement **A** pointe vers l'adresse IP du VPS (chez ton registrar, section DNS). Attends quelques minutes la propagation.
2. Accès SSH au VPS avec un utilisateur qui peut utiliser `sudo`.

## 1. Préparer le serveur (une seule fois)

```sh
# Pare-feu : on n'ouvre que SSH, HTTP et HTTPS. La base et l'API ne sont jamais exposées.
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443/tcp && sudo ufw allow 443/udp && sudo ufw enable

# Docker (voir docs.docker.com/engine/install pour ta distribution)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"      # puis déconnecte-toi et reconnecte-toi
```

Conseils : désactive la connexion SSH par mot de passe (clé uniquement) et active les mises à jour de sécurité automatiques (`sudo apt install unattended-upgrades`).

## 2. Récupérer le code et configurer

```sh
git clone https://github.com/ulrichrostand/rostand.git g2l && cd g2l/deploy
cp .env.example .env
nano .env        # SITE_DOMAIN=g2l.example ; POSTGRES_PASSWORD=$(openssl rand -hex 24)
chmod 600 .env
```

## 3. Construire le site (dossier `dist/`)

Le site doit être construit pour la racine du domaine (`APP_BASE=/`) avec l'adresse publique pour les aperçus de partage :

```sh
cd ..                               # racine du dépôt
npm ci
SITE_ORIGIN=https://g2l.example APP_BASE=/ npm run build
```

(Tu peux aussi construire sur ton ordinateur et envoyer `dist/` avec `rsync`.)

## 4. Démarrer

```sh
cd deploy
docker compose up -d --build
docker compose ps                    # les 3 services doivent être « running » (db « healthy »)
docker compose logs -f api           # « Migrations appliquées » puis « Server listening »
```

Ouvre `https://g2l.example` : Caddy obtient le certificat tout seul au premier accès (quelques secondes). Teste `https://g2l.example/api/health` (réponse `{"status":"ok"}`).

## 5. Mettre à jour

```sh
cd g2l && git pull
npm ci && SITE_ORIGIN=https://g2l.example APP_BASE=/ npm run build     # si le site a changé
cd deploy && docker compose up -d --build                               # si l'API a changé
```

Les migrations de base de données s'appliquent toutes seules au démarrage de l'API.

## 6. Sauvegardes (indispensable)

```sh
cd g2l/deploy && ./backup.sh          # écrit backups/g2l-AAAA-MM-JJ.sql.gz, garde 14 jours
crontab -e                            # puis ajoute la ligne suivante pour une sauvegarde chaque nuit à 3 h :
# 0 3 * * * /home/TON_UTILISATEUR/g2l/deploy/backup.sh >> /home/TON_UTILISATEUR/g2l/deploy/backups/cron.log 2>&1
```

**Copie régulièrement les sauvegardes hors du VPS** (autre machine, stockage objet) : une sauvegarde sur le même disque ne protège pas de la perte du serveur.

Restaurer (sur une base vide) :

```sh
gunzip -c backups/g2l-2026-10-14.sql.gz | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

## 7. Avant d'ouvrir les comptes au public

- **Mentions légales et confidentialité** : les pages actuelles disent « aucune donnée personnelle ». Dès que les comptes sont ouverts, elles doivent décrire le traitement (e-mail, mot de passe haché, progression, durée de conservation, droits d'accès, d'export et de suppression via l'API) et indiquer **un contact** pour exercer ces droits. Voir `PRODUCT.md`.
- **Statut de l'éditeur** : l'anonymat vis-à-vis du public n'est possible qu'à titre non professionnel (identité confiée à l'hébergeur). Avec des affiches payantes ou une micro-entreprise, il faudra ton identité complète.
- **Mot de passe oublié** : non géré en v1 (voir `server/README.md`).

## Dépannage

| Symptôme | Piste |
|---|---|
| Pas de HTTPS, erreur de certificat | Le domaine ne pointe pas encore vers le VPS, ou les ports 80/443 sont fermés (`sudo ufw status`). `docker compose logs web` |
| `api` redémarre en boucle | `docker compose logs api` : un message « Configuration invalide » dit quelle variable corriger |
| Connexion impossible depuis le site | `SITE_DOMAIN` doit être exactement le domaine utilisé dans le navigateur (en https) |
