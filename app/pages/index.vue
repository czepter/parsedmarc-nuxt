<script setup lang="ts">
const { user } = useUserSession()
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-background">
    <div class="w-full max-w-sm space-y-6 text-center">
      <h1 class="text-2xl font-semibold">Dashboard</h1>
      <p class="text-muted-foreground text-sm">
        Signed in as <span class="font-medium text-foreground">{{ user?.email }}</span>
      </p>
      <form method="POST" action="/api/auth/logout">
        <Button type="submit" variant="outline" class="w-full">Sign out</Button>
      </form>
    </div>
  </div>
</template>
