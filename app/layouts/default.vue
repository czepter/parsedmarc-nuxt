<script setup lang="ts">
const route = useRoute()

function isActive(path: string): boolean {
  return route.path === path || route.path.startsWith(path + '/')
}

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <!-- Top nav -->
    <header class="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div class="mx-auto flex h-12 max-w-7xl items-center gap-6 px-6">
        <!-- Brand -->
        <NuxtLink to="/" class="text-sm font-semibold tracking-tight">
          parsedmarc
        </NuxtLink>

        <!-- Nav links -->
        <nav class="flex items-center gap-4 text-sm">
          <NuxtLink
            to="/"
            :class="[
              'transition-colors',
              isActive('/') && route.path === '/'
                ? 'text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground',
            ]"
          >
            Dashboard
          </NuxtLink>
          <NuxtLink
            to="/inboxes"
            :class="[
              'transition-colors',
              isActive('/inboxes')
                ? 'text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground',
            ]"
          >
            Inboxes
          </NuxtLink>
        </nav>

        <!-- Spacer -->
        <div class="flex-1" />

        <!-- Search trigger (GlobalSearch component injected here in Task 3) -->
        <GlobalSearch />

        <!-- Logout -->
        <button
          class="text-muted-foreground hover:text-foreground text-xs transition-colors"
          @click="logout"
        >
          Sign out
        </button>
      </div>
    </header>

    <!-- Page content -->
    <main>
      <slot />
    </main>
  </div>
</template>
