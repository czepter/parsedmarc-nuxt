import prisma from '~~/lib/prisma'

export default defineEventHandler(async () => {
  const count = await prisma.user.count()
  return { exists: count > 0 }
})
