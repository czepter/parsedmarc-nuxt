import { z } from 'zod'
import { compare, hash } from '@node-rs/bcrypt'
import prisma from '~~/lib/prisma'

const schema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(12, 'New password must be at least 12 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your new password'),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: 'New passwords do not match',
  path: ['confirmPassword'],
})

export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const session = await getUserSession(event)
  const body = await readValidatedBody(event, raw => schema.parse(raw))

  const user = await prisma.user.findUnique({
    where: { id: session.userId as number },
    select: { id: true, passwordHash: true },
  })
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const valid = await compare(body.currentPassword, user.passwordHash)
  if (!valid) {
    throw createError({ statusCode: 422, statusMessage: 'Current password is incorrect' })
  }

  const passwordHash = await hash(body.newPassword, 12)
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  })

  return { ok: true }
})
