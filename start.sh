#!/bin/sh
set -e

# Bind to all interfaces. Nitro node-server defaults to 0.0.0.0:3000 already,
# but making it explicit guards against future Nitro default changes that
# would silently make the container unreachable.
export HOST="${HOST:-0.0.0.0}"

# Default DATABASE_URL to the SQLite file inside the volume mount.
# lib/prisma.ts has its own fallback for the runtime client, but
# prisma.config.ts (used by `prisma migrate deploy` below) does NOT default —
# it would pass undefined to the migration engine and fail.
export DATABASE_URL="${DATABASE_URL:-file:./data/parsedmarc.db}"

# Apply pending migrations against the live SQLite volume.
# Must run at boot (not build) because data/parsedmarc.db lives on a mounted
# volume that doesn't exist during the image build. `migrate deploy` is
# idempotent and safe to run on every container start.
echo "[start] Running prisma migrate deploy..."
pnpm prisma migrate deploy

# exec replaces the shell with Node so SIGTERM/SIGINT propagate directly
# (graceful shutdown of in-process cron jobs and IMAP connections).
echo "[start] Starting Nuxt server..."
exec node .output/server/index.mjs
