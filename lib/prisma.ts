import { PrismaClient } from '~~/app/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

declare const globalThis: {
  prismaGlobal?: PrismaClient
} & typeof global

function getClient(): PrismaClient {
  if (!globalThis.prismaGlobal) {
    const dbUrl = process.env.DATABASE_URL ?? 'file:./data/parsedmarc.db'
    // PrismaBetterSqlite3 expects a file URL or :memory:
    const url = dbUrl.startsWith('file:') ? dbUrl.replace('file:', '') : dbUrl
    const adapter = new PrismaBetterSqlite3({ url })
    globalThis.prismaGlobal = new PrismaClient({ adapter } as Parameters<typeof PrismaClient>[0])
  }
  return globalThis.prismaGlobal
}

export default new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getClient() as Record<string | symbol, unknown>)[prop]
  },
})
