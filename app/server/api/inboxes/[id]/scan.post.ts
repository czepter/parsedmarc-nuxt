import prisma from '~~/lib/prisma'

export default defineEventHandler(async (event) => {
  const { id } = getRouterParams(event)
  const inbox = await prisma.inbox.findUnique({ where: { id } })
  if (!inbox) throw createError({ statusCode: 404, statusMessage: 'Inbox not found' })

  // M5 will replace this stub with actual IMAP ingestion.
  // For now, record a scan run that immediately completes with zero messages.
  const run = await prisma.scanRun.create({
    data: {
      inboxId: id,
      finishedAt: new Date(),
      messagesSeen: 0,
      reportsParsed: 0,
    },
  })
  return run
})
