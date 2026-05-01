<script setup lang="ts">
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
        </form>
      </CardContent>
    </Card>
  </div>
</template>
