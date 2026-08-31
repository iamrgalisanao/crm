#!/usr/bin/env bash
# Nightly demo reset: wipes the DB and reloads the rich demo dataset so the
# public demo stays pristine no matter what visitors do. Schedule in cron:
#   crontab -e
#   30 3 * * *  cd /opt/crmsales && ./scripts/demo-reset.sh >> ./demo-reset.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."

# TS_NODE_COMPILER_OPTIONS keeps this working even on an image built before the
# tsconfig fix; it's harmless once you've rebuilt.
docker compose -f docker-compose.server.yml --env-file .env.prod exec -T \
  -e TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' \
  api npm run db:seed:demo

echo "Demo reset complete: $(date -u +%FT%TZ)"
