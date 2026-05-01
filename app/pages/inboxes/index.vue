<script setup lang="ts">
const { data: inboxes, refresh } = await useFetch('/api/inboxes')

const scanningId = ref<string | null>(null)
const deletingId = ref<string | null>(null)

async function scanNow(id: string) {
  if (scanningId.value) return
  scanningId.value = id
  try {
    await $fetch(`/api/inboxes/${id}/scan`, { method: 'POST' })
    await refresh()
  }
  catch (e: unknown) {
    alert(`Scan failed: ${(e as { statusMessage?: string }).statusMessage ?? 'Unknown error'}`)
  }
  finally {
    scanningId.value = null
  }
}

async function deleteInbox(id: string, label: string) {
  if (!confirm(`Delete inbox "${label}"? This removes all its reports and scan history.`)) return
  deletingId.value = id
  try {
    await $fetch(`/api/inboxes/${id}`, { method: 'DELETE' })
    await refresh()
  }
  finally {
    deletingId.value = null
  }
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold">Inboxes</h1>
      <NuxtLink to="/inboxes/new">
        <Button>+ Add Inbox</Button>
      </NuxtLink>
    </div>

    <div v-if="!inboxes?.length" class="text-muted-foreground rounded-md border p-12 text-center text-sm">
      No inboxes configured yet.
      <NuxtLink to="/inboxes/new" class="text-foreground underline">Add your first inbox.</NuxtLink>
    </div>

    <Table v-else>
      <TableHeader>
        <TableRow>
          <TableHead>Label</TableHead>
          <TableHead>Host</TableHead>
          <TableHead>Status</TableHead>
          <TableHead class="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="inbox in inboxes" :key="inbox.id">
          <TableCell class="font-medium">{{ inbox.label }}</TableCell>
          <TableCell class="text-muted-foreground text-sm">
            {{ inbox.host }}:{{ inbox.port }}
            <span v-if="inbox.tls" class="ml-1 text-xs">TLS</span>
          </TableCell>
          <TableCell>
            <Badge :variant="inbox.enabled ? 'default' : 'secondary'">
              {{ inbox.enabled ? 'Active' : 'Disabled' }}
            </Badge>
          </TableCell>
          <TableCell class="space-x-2 text-right">
            <NuxtLink :to="`/inboxes/${inbox.id}/edit`">
              <Button variant="outline" size="sm">Edit</Button>
            </NuxtLink>
            <NuxtLink :to="`/inboxes/${inbox.id}/runs`">
              <Button variant="outline" size="sm">Runs</Button>
            </NuxtLink>
            <Button
              variant="outline"
              size="sm"
              :disabled="scanningId === inbox.id"
              @click="scanNow(inbox.id)"
            >
              {{ scanningId === inbox.id ? 'Scanning…' : 'Scan Now' }}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              :disabled="deletingId === inbox.id"
              @click="deleteInbox(inbox.id, inbox.label)"
            >
              Delete
            </Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>
