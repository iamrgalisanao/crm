# Deploying to a VPS (crm.abbadev.com)

The whole stack — Postgres, Redis, the NestJS API, the Next.js web app, and a
Caddy reverse proxy with automatic HTTPS — runs on one server via Docker Compose.
Everything is served on a single domain: `/api/*` → API, everything else → web
(so auth cookies are first-party and there's no CORS to configure).

Both images are verified to build and run (`apps/api/Dockerfile`, `apps/web/Dockerfile`).

## Prerequisites
- A VPS with **Docker** + **Docker Compose v2** (`docker compose version`).
- **DNS**: an `A` record for `crm.abbadev.com` → your server's public IP.
- Ports **80** and **443** open in the firewall.

## First deploy
```bash
# 1. Get the code onto the server
git clone <your-repo> crmsales && cd crmsales   # or scp/rsync the folder

# 2. Create the production env and fill it in
cp .env.prod.example .env.prod
#   - set CRM_DOMAIN=crm.abbadev.com and PUBLIC_URL=https://crm.abbadev.com
#   - set a strong POSTGRES_PASSWORD
#   - generate the two JWT secrets:
openssl rand -hex 32   # → JWT_ACCESS_SECRET
openssl rand -hex 32   # → JWT_REFRESH_SECRET
#   - set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (the demo login)

# 3. Build and start everything (Caddy gets a Let's Encrypt cert automatically)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# 4. Seed the org + roles + super admin + demo catalog (ONE TIME)
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api npm run db:seed
```
Open **https://crm.abbadev.com** and log in with the seeded admin. Done.

> Migrations run automatically on every API start (`prisma migrate deploy`).
> Seeding is a one-off — don't repeat it on updates.

## Updating
```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

## Featuring it on abbadev.com
- **Live demo:** add a "Live demo" button on abbadev.com linking to
  `https://crm.abbadev.com`, with the demo credentials shown on the page.
- **Showcase / case study:** pair the demo link with screenshots and a short
  screen-recording walkthrough (dashboard, pipeline, quote → order → invoice →
  payment, the AI briefing, automation).

## Before you make the demo public — hardening checklist
- [x] **Next.js bumped** to a patched 14.2.x (14.2.35) — the earlier 14.2.15 advisory is fixed.
- [x] **HTTPS** via Caddy (automatic).
- [x] **Secrets** set in `.env.prod` (never commit it); DB port is **not** exposed publicly.
- [x] **Rate limiting** — built into the API (`@nestjs/throttler`): 120 req/min/IP globally,
      **8 login + 20 refresh attempts/min/IP** to blunt brute force (returns `429`). The API
      trusts the first proxy, so limits key on the real client IP behind Caddy.
- [x] **Backups** — use the included script and schedule it in cron:
      ```bash
      chmod +x scripts/backup.sh
      # daily at 02:30 → gzipped dump in ./backups, 14-day retention
      crontab -e
      30 2 * * *  cd /path/to/crmsales && ./scripts/backup.sh >> ./backups/backup.log 2>&1
      ```
      Restore instructions are in the script header.
- [ ] **Demo reset (optional)** — to keep a public demo tidy, take a dump right after seeding and
      restore it nightly (same commands as the backup script's restore note).
- [ ] **Change the seeded admin password** after first login if it's a real (non-demo) deployment.

## When it graduates to a real client product
- Turn on the **Claude AI provider** by setting `ANTHROPIC_API_KEY` in `.env.prod`.
- Add automated tests + a CI pipeline (build the two images, run `tsc`/lint on PRs).
- Consider per-client multi-tenancy (the schema already carries `organization_id` everywhere) and
  a managed Postgres with point-in-time recovery.

## Faster deploys: pull prebuilt images from GHCR (optional)
Instead of building on the server, let GitHub Actions build the images and pull them:
1. Push the repo to GitHub. The workflow `.github/workflows/images.yml` builds
   `crm-api` and `crm-web` and pushes them to **GHCR** on every push to `main`.
2. In the GitHub repo, add an Actions **variable** `PUBLIC_URL = https://crm.abbadev.com`
   (the web image inlines this at build time).
3. If the packages are private, make them public (Package settings) or `docker login ghcr.io`
   on the server with a read token.
4. On the server, set `GHCR_OWNER` in `.env.prod`, then deploy with the registry compose:
   ```bash
   docker compose -f docker-compose.registry.yml --env-file .env.prod pull
   docker compose -f docker-compose.registry.yml --env-file .env.prod up -d
   # first time only:
   docker compose -f docker-compose.registry.yml --env-file .env.prod exec api npm run db:seed
   ```
Updating then becomes just `pull` + `up -d` (no build step on the server).

## Notes / troubleshooting
- **Cert not issued?** Check DNS points at the server and ports 80/443 are reachable; watch
  `docker compose -f docker-compose.prod.yml logs caddy`.
- **`dev` vs `prod`:** the local `docker-compose.yml` (Postgres on host port 55432) is for development
  only; production uses `docker-compose.prod.yml` (internal network, nothing but Caddy exposed).
