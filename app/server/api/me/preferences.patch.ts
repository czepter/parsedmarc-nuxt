import { z } from 'zod'
import prisma from '~~/lib/prisma'
import { parsePreferences } from '~~/app/server/utils/preferences'

const Schema = z.object({
  window: z.enum(['24h', '7d', '30d', '90d']).optional(),
})

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const body = await readValidatedBody(event, (raw) => Schema.parse(raw))
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.userId as number },
    select: { preferences: true },
  })
  const next = { ...parsePreferences(user.preferences), ...body }
  await prisma.user.update({
    where: { id: session.userId as number },
    data: { preferences: JSON.stringify(next) },
  })
  return next
})
