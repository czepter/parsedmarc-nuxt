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
  <div class="flex min-h-screen items-center justify-center bg-background">
    <Card class="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  </div>
</template>
