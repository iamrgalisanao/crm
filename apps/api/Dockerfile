# --- API image (NestJS + Prisma). Build context = repo root. ---
FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

FROM base AS build
# Build toolchain for native deps (argon2) + prisma engine download
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm install
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace @crm/shared \
 && npm run prisma:generate --workspace @crm/api \
 && npm run build --workspace @crm/api

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
WORKDIR /app/apps/api
EXPOSE 4000
# Apply migrations, then start. (Seed is a one-off — see docs/DEPLOY.md.)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
