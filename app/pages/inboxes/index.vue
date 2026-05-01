<script setup lang="ts">
const { data: inboxes, refresh, status, error } = await useFetch('/api/inboxes')

const scanningIds = ref(new Set<string>())
const deletingId = ref<string | null>(null)

async function scanNow(id: string) {
  if (scanningIds.value.has(id)) return
  scanningIds.value.add(id)
  try {
    await $fetch(`/api/inboxes/${id}/scan`, { method: 'POST' })
    await refresh()
  }
  catch (e: unknown) {
    alert(`Scan failed: ${(e as { statusMessage?: string }).statusMessage ?? 'Unknown error'}`)
  }
  finally {
    scanningIds.value.delete(id)
  }
}

async function deleteInbox(id: string, label: string) {
  if (!confirm(`Delete inbox "${label}"? This removes all its reports and scan history.`)) return
  deletingId.value = id
  try {
    await $fetch(`/api/inboxes/${id}`, { method: 'DELETE' })
    await refresh()
  }
  catch (e: unknown) {
    alert(`Delete failed: ${(e as { statusMessage?: string }).statusMessage ?? 'Unknown error'}`)
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
      <Button variant="outline" size="sm" as-child>
        <NuxtLink to="/inboxes/new">+ Add Inbox</NuxtLink>
      </Button>
    </div>

    <div v-if="status === 'error'" class="text-destructive rounded-md border p-12 text-center text-sm">
      Failed to load inboxes: {{ error?.message }}
    </div>
    <div v-else-if="status === 'success' && !inboxes?.length" class="text-muted-foreground rounded-md border p-12 text-center text-sm">
      No inboxes configured yet.
      <NuxtLink to="/inboxes/new" class="text-foreground underline">Add your first inbox.</NuxtLink>
    </div>

    <Table v-else-if="status === 'success' && inboxes?.length">
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
            <Button variant="outline" size="sm" as-child>
              <NuxtLink :to="`/inboxes/${inbox.id}/edit`">Edit</NuxtLink>
            </Button>
            <Button variant="outline" size="sm" as-child>
              <NuxtLink :to="`/inboxes/${inbox.id}/runs`">Runs</NuxtLink>
            </Button>
            <Button
              variant="outline"
              size="sm"
              :disabled="scanningIds.has(inbox.id)"
              @click="scanNow(inbox.id)"
            >
              {{ scanningIds.has(inbox.id) ? 'Scanning…' : 'Scan Now' }}
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
