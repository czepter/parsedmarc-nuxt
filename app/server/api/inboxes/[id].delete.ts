import prisma from '~~/lib/prisma'

export default defineEventHandler(async (event) => {
  const { id } = getRouterParams(event)
  const inbox = await prisma.inbox.findUnique({ where: { id } })
  if (!inbox) throw createError({ statusCode: 404, statusMessage: 'Inbox not found' })

  await prisma.inbox.delete({ where: { id } })
  return { ok: true }
})
