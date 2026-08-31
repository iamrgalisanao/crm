#!/usr/bin/env bash
# Timestamped, gzipped Postgres backup of the production stack.
# Usage:  ./scripts/backup.sh        (run from the repo root or anywhere)
# Env:    BACKUP_DIR (default ./backups)   KEEP_DAYS (default 14)
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%F-%H%M%S)"
FILE="$BACKUP_DIR/crm-$STAMP.sql.gz"

echo "Backing up database → $FILE"
$COMPOSE exec -T postgres pg_dump -U crm crm | gzip > "$FILE"
echo "Done ($(du -h "$FILE" | cut -f1))."

# Prune backups older than KEEP_DAYS.
find "$BACKUP_DIR" -name 'crm-*.sql.gz' -type f -mtime +"$KEEP_DAYS" -delete
echo "Pruned backups older than ${KEEP_DAYS} days."

# Restore (manual):
#   gunzip -c backups/crm-YYYY-MM-DD-HHMMSS.sql.gz | \
#     docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres psql -U crm -d crm
