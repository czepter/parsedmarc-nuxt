import prisma from '~~/lib/prisma'

// Dev-only convenience endpoint: signs in as the first user in the DB so
// developers don't have to type the operator password on every reload.
//
// Mirrors the guard pattern in app/server/api/test/reset.delete.ts — returns
// 404 in production (not 403) so the route appears non-existent rather than
// "forbidden but real". Defense-in-depth alongside the client-side
// `import.meta.dev` check on the login page button.
export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404 })
  }

  // `findFirst` with an explicit order makes the chosen user deterministic
  // across runs (lowest id = first user created, typically the operator).
  const user = await prisma.user.findFirst({ orderBy: { id: 'asc' } })
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'No users exist yet' })
  }

  await setUserSession(event, { userId: user.id, email: user.email })
  return { ok: true, email: user.email }
})
