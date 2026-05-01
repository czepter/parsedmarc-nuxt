import { compare } from '@node-rs/bcrypt'
import prisma from '~~/lib/prisma'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string; password?: string }>(event)

  if (!body.email || !body.password) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })
  }

  const user = await prisma.user.findUnique({ where: { email: body.email } })
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })
  }

  const valid = await compare(body.password, user.passwordHash)
  if (!valid) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })
  }

  await setUserSession(event, { userId: user.id, email: user.email })
  return { ok: true }
})
