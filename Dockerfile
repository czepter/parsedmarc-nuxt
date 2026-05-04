# syntax=docker/dockerfile:1

# =============================================================================
# Stage 1: build
# Installs all deps (dev + prod), generates Prisma client, builds Nuxt,
# then prunes to production-only node_modules for the runtime stage to copy.
# =============================================================================
FROM node:24-slim AS build

# node:24-slim is Debian-based (glibc). Do NOT switch to alpine: better-sqlite3
# and @node-rs/bcrypt-linux-x64-gnu are native addons compiled against glibc;
# alpine's musl would require a from-source rebuild and a full toolchain.

WORKDIR /app

# Pin pnpm to match the local version that generated pnpm-lock.yaml.
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

# Manifests first so the install layer caches independently of source changes.
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

RUN pnpm install --frozen-lockfile

# Copy the rest. .dockerignore keeps node_modules, .output, .nuxt, data/, .git
# etc. out of the build context.
COPY . .

# Redundant with postinstall but explicit so failures surface clearly here
# rather than buried in install logs.
RUN pnpm prisma generate

# 4096 MB heap required: Nuxt + Vite + Nitro + vue-tsc together exceed
# Node's default ~1.7 GB and silently OOM-kill the build (exit 255).
RUN NODE_OPTIONS="--max-old-space-size=4096" pnpm build

# Prune to production-only deps for the runtime image. This keeps:
#   - @prisma/client + @prisma/adapter-better-sqlite3 + better-sqlite3
#     (externalized from the Nitro bundle — must be in node_modules at runtime)
#   - prisma CLI (moved to `dependencies` for this exact reason — needed by
#     `prisma migrate deploy` in start.sh)
#   - all other runtime deps (nuxt-auth-utils, croner, imapflow, etc.)
# Drops: nuxt build toolchain, vitest, playwright, typescript, etc.
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# =============================================================================
# Stage 2: runtime
# =============================================================================
FROM node:24-slim AS runtime

WORKDIR /app

# libssl3 for @prisma/engines (used by `prisma migrate deploy`).
# ca-certificates for outbound HTTPS (MaxMind, IMAP TLS).
RUN apt-get update -qq \
    && apt-get install -y --no-install-recommends libssl3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Enable corepack so `pnpm prisma migrate deploy` works in start.sh.
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

ENV NODE_ENV=production

# Built Nuxt server (Nitro node-server preset, self-contained for bundled deps).
COPY --from=build /app/.output ./.output

# Production node_modules for externalized packages (Prisma, better-sqlite3)
# and the prisma CLI used by start.sh.
COPY --from=build /app/node_modules ./node_modules

# Prisma client output lives at app/generated/prisma/ (non-standard path
# set in schema.prisma generator block). lib/prisma.ts imports from this path.
COPY --from=build /app/app/generated ./app/generated

# Schema + migrations needed by `prisma migrate deploy` at boot.
COPY --from=build /app/prisma ./prisma

# prisma.config.ts is read by the Prisma CLI to resolve the datasource URL
# from the DATABASE_URL env var (Prisma 7 moved url out of schema files).
COPY --from=build /app/prisma.config.ts ./prisma.config.ts

# package.json so pnpm can resolve scripts/bins.
COPY --from=build /app/package.json ./package.json

# Entrypoint.
COPY start.sh ./start.sh
RUN chmod +x start.sh

# SQLite database directory — must be a volume so it survives container
# restarts. DATABASE_URL defaults to file:./data/parsedmarc.db (relative to /app).
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000

CMD ["sh", "start.sh"]
