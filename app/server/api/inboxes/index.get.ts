import prisma from '~~/lib/prisma'

const INBOX_SELECT = {
  id: true,
  label: true,
  host: true,
  port: true,
  tls: true,
  username: true,
  processedFolder: true,
  enabled: true,
  pollCron: true,
} as const

export default defineEventHandler(async () => {
  return prisma.inbox.findMany({
    select: INBOX_SELECT,
    orderBy: { label: 'asc' },
  })
})
