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

export default defineEventHandler(async (event) => {
  const { id } = getRouterParams(event)
  const inbox = await prisma.inbox.findUnique({ where: { id }, select: INBOX_SELECT })
  if (!inbox) throw createError({ statusCode: 404, statusMessage: 'Inbox not found' })
  return inbox
})
