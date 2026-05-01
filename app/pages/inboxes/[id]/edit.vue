<script setup lang="ts">
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

async function submit() {
  error.value = ''
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
          <p v-if="error" class="text-destructive text-sm">{{ error }}</p>
          <Button type="submit" class="w-full" :disabled="loading">
            {{ loading ? 'Saving…' : 'Save changes' }}
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
