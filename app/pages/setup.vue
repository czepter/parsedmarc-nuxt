<script setup lang="ts">
// Guard: if a user already exists, this deployment is already set up.
const { data: status } = await useAsyncData('setup-status', () =>
  $fetch<{ exists: boolean }>('/api/auth/setup-status'),
)
if (status.value?.exists) {
  await navigateTo('/login', { redirectCode: 302 })
}

const form = reactive({ email: '', password: '' })
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await $fetch('/api/auth/setup', { method: 'POST', body: form })
    await navigateTo('/')
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } }
    error.value = err.data?.statusMessage ?? 'Something went wrong'
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
        <CardTitle>Create operator account</CardTitle>
        <CardDescription>
          Set up your parsedmarc-nuxt instance. This page disappears after first use.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit.prevent="submit">
          <div class="space-y-1.5">
            <Label for="setup-email">Email</Label>
            <Input
              id="setup-email"
              v-model="form.email"
              type="email"
              required
              autocomplete="email"
              placeholder="admin@example.com"
            />
          </div>
          <div class="space-y-1.5">
            <Label for="setup-password">
              Password
              <span class="text-muted-foreground text-xs font-normal">(min 12 characters)</span>
            </Label>
            <Input
              id="setup-password"
              v-model="form.password"
              type="password"
              minlength="12"
              required
              autocomplete="new-password"
            />
          </div>
          <p v-if="error" class="text-destructive text-sm">{{ error }}</p>
          <Button type="submit" class="w-full" :disabled="loading">
            {{ loading ? 'Creating…' : 'Create account' }}
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
