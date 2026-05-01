export default defineEventHandler(async (event) => {
  await clearUserSession(event)
  // Redirect to login after clearing the session so native <form method="POST"> works.
  return sendRedirect(event, '/login', 302)
})
