import { hash } from '@node-rs/bcrypt'
import prisma from '~~/lib/prisma'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string; password?: string }>(event)

  if (!body.email || !body.email.includes('@')) {
    throw createError({ statusCode: 400, statusMessage: 'Valid email is required' })
  }
  if (!body.password || body.password.length < 12) {
    throw createError({ statusCode: 400, statusMessage: 'Password must be at least 12 characters' })
  }

  const existing = await prisma.user.findFirst()
  if (existing) {
    throw createError({ statusCode: 403, statusMessage: 'Setup already complete' })
  }

  const passwordHash = await hash(body.password, 10)
  const user = await prisma.user.create({
    data: { email: body.email, passwordHash },
  })

  await setUserSession(event, { userId: user.id, email: user.email })
  return { ok: true }
})
