<script setup lang="ts">
definePageMeta({ layout: false })

// Guard: redirect to /setup on a fresh install where no users exist yet.
// Symmetric with setup.vue's guard that redirects the other way.
const { data: status } = await useAsyncData('setup-status-for-login', () =>
  $fetch<{ exists: boolean }>('/api/auth/setup-status'),
)
if (!status.value?.exists) {
  await navigateTo('/setup', { redirectCode: 302 })
}

const form = reactive({ email: '', password: '' })
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: form })
    await navigateTo('/')
  }
  catch (e: unknown) {
    const err = e as { statusCode?: number; data?: { statusMessage?: string } }
    if (err.statusCode === 429) {
      error.value = err.data?.statusMessage ?? 'Too many attempts'
    }
    else {
      error.value = 'Invalid email or password'
    }
  }
  finally {
    loading.value = false
  }
}

const isDev = import.meta.dev
const devLoading = ref(false)
async function devLogin() {
  devLoading.value = true
  try {
    await $fetch('/api/auth/dev-login', { method: 'POST' })
    await navigateTo('/')
  }
  catch {
    error.value = 'Dev login failed — no users exist yet'
  }
  finally {
    devLoading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen flex-col md:flex-row">
    <!-- Left panel: brand identity -->
    <div
      class="flex flex-col items-center justify-center bg-[oklch(0.25_0.15_240)] px-8 py-10 text-white md:w-1/2 md:min-h-screen md:items-start md:px-16 md:py-0"
    >
      <!-- Decorative shape -->
      <div class="mb-8 hidden md:block">
        <div class="flex items-end gap-2">
          <div class="h-12 w-3 rounded-sm bg-white/20" />
          <div class="h-20 w-3 rounded-sm bg-white/40" />
          <div class="h-14 w-3 rounded-sm bg-white/30" />
          <div class="h-8 w-3 rounded-sm bg-white/15" />
          <div class="h-24 w-3 rounded-sm bg-white/50" />
          <div class="h-10 w-3 rounded-sm bg-white/20" />
          <div class="h-16 w-3 rounded-sm bg-white/35" />
        </div>
      </div>

      <h1 class="text-3xl font-bold tracking-tight md:text-4xl">
        parsedmarc
      </h1>
      <p class="mt-2 text-sm font-medium tracking-widest text-white/60 uppercase">
        DMARC reporting &amp; monitoring
      </p>
    </div>

    <!-- Right panel: login form -->
    <div class="flex flex-1 items-center justify-center bg-background px-8 py-12">
      <div class="w-full max-w-sm space-y-6">
        <div>
          <h2 class="text-xl font-semibold tracking-tight">
            Sign in to your account
          </h2>
          <p class="text-muted-foreground mt-1 text-sm">
            Enter your credentials below to continue.
          </p>
        </div>

        <form class="space-y-4" @submit.prevent="submit">
          <div class="space-y-1.5">
            <Label for="login-email">Email</Label>
            <Input
              id="login-email"
              v-model="form.email"
              type="email"
              required
              autocomplete="email"
            />
          </div>
          <div class="space-y-1.5">
            <Label for="login-password">Password</Label>
            <Input
              id="login-password"
              v-model="form.password"
              type="password"
              required
              autocomplete="current-password"
            />
          </div>
          <p v-if="error" class="text-destructive text-sm">{{ error }}</p>
          <Button type="submit" class="w-full" :disabled="loading">
            {{ loading ? 'Signing in…' : 'Sign in' }}
          </Button>
          <Button
            v-if="isDev"
            type="button"
            variant="outline"
            class="w-full"
            :disabled="devLoading"
            @click="devLogin"
          >
            {{ devLoading ? 'Signing in…' : 'Dev login (first user)' }}
          </Button>
        </form>
      </div>
    </div>
  </div>
</template>
