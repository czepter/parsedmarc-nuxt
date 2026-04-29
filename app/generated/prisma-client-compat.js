// Compatibility shim: maps @prisma/client imports → Prisma 7 generated client
// Used by @prisma/nuxt v0.3.0 which imports from the legacy @prisma/client path
export { PrismaClient } from './prisma/client.ts'
export * from './prisma/client.ts'
