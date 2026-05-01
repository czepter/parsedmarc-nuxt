// Prisma 7 with a schema that omits `url` in the datasource requires a driver
// adapter to supply the database path at runtime. We use @prisma/adapter-better-sqlite3
// which wraps better-sqlite3 (already in deps for its performance).
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

declare const globalThis: {
  prismaGlobal?: PrismaClient
} & typeof global

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL ?? 'file:./data/parsedmarc.db'
  // PrismaBetterSqlite3 takes { url } and strips the "file:" prefix internally.
  const adapter = new PrismaBetterSqlite3({ url })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PrismaClient({ adapter } as any)
}

const prisma = globalThis.prismaGlobal ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma
}

export default prisma
