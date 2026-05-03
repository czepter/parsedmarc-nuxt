import prisma from '~~/lib/prisma'
import { parsePreferences } from '~~/app/server/utils/preferences'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.userId as number },
    select: { preferences: true },
  })
  return parsePreferences(user.preferences)
})
