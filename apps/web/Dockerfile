# --- Web image (Next.js standalone). Build context = repo root. ---
FROM node:20-bookworm-slim AS build
WORKDIR /app
# NEXT_PUBLIC_* is inlined at build time, so it must be present here.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_DEMO_EMAIL
ARG NEXT_PUBLIC_DEMO_PASSWORD
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_DEMO_EMAIL=$NEXT_PUBLIC_DEMO_EMAIL \
    NEXT_PUBLIC_DEMO_PASSWORD=$NEXT_PUBLIC_DEMO_PASSWORD
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build --workspace @crm/shared \
 && npm run build --workspace @crm/web

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Next standalone output bundles a minimal server + traced node_modules.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
