<script setup lang="ts">
definePageMeta({ layout: 'default' })
const route = useRoute()
const id = route.params.id as string

const { data: inbox } = await useFetch(`/api/inboxes/${id}`)
if (!inbox.value) {
  await navigateTo('/inboxes')
}

const form = reactive({
  label: inbox.value?.label ?? '',
  host: inbox.value?.host ?? '',
  port: inbox.value?.port ?? 993,
  tls: inbox.value?.tls ?? true,
  username: inbox.value?.username ?? '',
  password: '', // blank = keep existing
  processedFolder: inbox.value?.processedFolder ?? '',
  enabled: inbox.value?.enabled ?? true,
  pollCron: inbox.value?.pollCron ?? '*/15 * * * *',
})
const error = ref('')
const loading = ref(false)

type TestStatus = 'idle' | 'loading' | 'success' | 'error'
const testStatus = ref<TestStatus>('idle')
const testError = ref('')

watch(() => [form.host, form.port, form.tls, form.username, form.password], () => {
  testStatus.value = 'idle'
  testError.value = ''
})

async function testConnection() {
  testStatus.value = 'loading'
  testError.value = ''
  error.value = ''
  try {
    if (form.password) {
      // New password typed — use stateless endpoint with full credentials from form
      await $fetch('/api/inboxes/test', {
        method: 'POST',
        body: {
          host: form.host,
          port: Number(form.port),
          tls: form.tls,
          username: form.username,
          password: form.password,
        },
      })
    }
    else {
      // No new password — use stateful endpoint that decrypts the stored password,
      // forwarding any unsaved host/port/tls/username changes from the form.
      await $fetch(`/api/inboxes/${id}/test`, {
        method: 'POST',
        body: {
          host: form.host,
          port: Number(form.port),
          tls: form.tls,
          username: form.username,
        },
      })
    }
    testStatus.value = 'success'
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } }
    testError.value = err.data?.statusMessage ?? 'Connection test failed'
    testStatus.value = 'error'
  }
}

async function submit() {
  error.value = ''
  testStatus.value = 'idle'
  testError.value = ''
  loading.value = true
  try {
    await $fetch(`/api/inboxes/${id}`, {
      method: 'PUT',
      body: {
        ...form,
        port: Number(form.port),
        processedFolder: form.processedFolder || null,
        // Only send password if user typed a new one
        password: form.password || undefined,
      },
    })
    await navigateTo('/inboxes')
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } }
    error.value = err.data?.statusMessage ?? 'Failed to update inbox'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg space-y-6 p-6">
    <div class="flex items-center gap-4">
      <Button variant="ghost" size="sm" as-child>
        <NuxtLink to="/inboxes">← Back</NuxtLink>
      </Button>
      <h1 class="text-2xl font-semibold">Edit Inbox</h1>
    </div>

    <Card>
      <CardContent class="pt-6">
        <form class="space-y-4" @submit.prevent="submit">
          <div class="space-y-1.5">
            <Label for="label">Label</Label>
            <Input id="label" v-model="form.label" required />
          </div>
          <div class="grid grid-cols-3 gap-4">
            <div class="col-span-2 space-y-1.5">
              <Label for="host">Host</Label>
              <Input id="host" v-model="form.host" required />
            </div>
            <div class="space-y-1.5">
              <Label for="port">Port</Label>
              <Input id="port" v-model.number="form.port" type="number" min="1" max="65535" required />
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox id="tls" :checked="form.tls" @update:checked="form.tls = $event" />
            <Label for="tls">Use TLS</Label>
          </div>
          <div class="space-y-1.5">
            <Label for="username">Username</Label>
            <Input id="username" v-model="form.username" type="email" required />
          </div>
          <div class="space-y-1.5">
            <Label for="password">Password</Label>
            <Input
              id="password"
              v-model="form.password"
              type="password"
              placeholder="Leave blank to keep current password"
              autocomplete="new-password"
            />
          </div>
          <div class="space-y-1.5">
            <Label for="folder">Processed folder <span class="text-muted-foreground text-xs">(optional)</span></Label>
            <Input id="folder" v-model="form.processedFolder" placeholder="DMARC" />
          </div>
          <div class="space-y-1.5">
            <Label for="cron">Poll schedule</Label>
            <Input id="cron" v-model="form.pollCron" />
          </div>
          <div class="flex items-center gap-2">
            <Checkbox id="enabled" :checked="form.enabled" @update:checked="form.enabled = $event" />
            <Label for="enabled">Enable this inbox</Label>
          </div>
          <p v-if="testStatus === 'success'" class="text-sm text-green-600 dark:text-green-400">✓ Connection successful</p>
          <p v-if="testStatus === 'error'" class="text-destructive text-sm">{{ testError }}</p>
          <p v-if="error" class="text-destructive text-sm">{{ error }}</p>
          <div class="flex gap-2">
            <Button
              type="button"
              variant="outline"
              class="flex-1"
              :disabled="testStatus === 'loading' || loading"
              @click="testConnection"
            >
              {{ testStatus === 'loading' ? 'Testing…' : 'Test Connection' }}
            </Button>
            <Button type="submit" class="flex-1" :disabled="loading || testStatus === 'loading'">
              {{ loading ? 'Saving…' : 'Save changes' }}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
