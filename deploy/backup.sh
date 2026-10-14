#!/bin/sh
# Sauvegarde quotidienne de la base, compressée, avec 14 jours d'historique.
# À lancer depuis le dossier deploy/ (voir README.md, section « Sauvegardes »).
set -eu

cd "$(dirname "$0")"
umask 077
mkdir -p backups
file="backups/g2l-$(date +%F).sql.gz"

# Les identifiants viennent du conteneur : rien n'est écrit en clair dans ce script.
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > "$file.tmp"
mv "$file.tmp" "$file"
find backups -name 'g2l-*.sql.gz' -mtime +14 -delete
echo "Sauvegarde écrite : $file"
