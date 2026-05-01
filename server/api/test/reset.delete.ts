import prisma from '~~/lib/prisma'

export default defineEventHandler(async () => {
  // Only allow this in non-production environments.
  // In production NODE_ENV=production; this returns 404.
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404 })
  }
  await prisma.user.deleteMany()
  return { ok: true }
})
