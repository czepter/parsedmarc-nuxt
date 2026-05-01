import prisma from '~~/lib/prisma'

export default defineEventHandler(async () => {
  // Guard: never available in production. In dev/test mode it is always
  // accessible (Nuxt dev server normalises NODE_ENV to 'development', so
  // checking for 'test' specifically would always block).
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404 })
  }
  await prisma.user.deleteMany()
  return { ok: true }
})
