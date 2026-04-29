// Stub for @prisma/client used by @prisma/nuxt v0.3.0 server utils.
// The project uses Prisma 7 with a custom output path (app/generated/prisma).
// This stub prevents the legacy @prisma/client from crashing at module load time.
// The actual Prisma client is imported directly from app/generated/prisma/client.ts
// in server handlers that need it.

export class PrismaClient {
  constructor() {
    // No-op: @prisma/nuxt v0.3.0 instantiates this at module load;
    // actual DB access uses the Prisma 7 client from app/generated/prisma.
  }
  async $disconnect() {}
  async $connect() {}
}

export const Prisma = {}
export default { PrismaClient, Prisma }
