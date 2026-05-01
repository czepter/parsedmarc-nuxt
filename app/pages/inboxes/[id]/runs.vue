<script setup lang="ts">
const route = useRoute()
const id = route.params.id as string

const { data: runs, status, error } = await useFetch(`/api/inboxes/${id}/runs`)

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString()
}

function duration(start: string, end: string | null | undefined): string {
  if (!end) return '—'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-6">
    <div class="flex items-center gap-4">
      <Button variant="ghost" size="sm" as-child>
        <NuxtLink to="/inboxes">← Back</NuxtLink>
      </Button>
      <h1 class="text-2xl font-semibold">Scan Runs</h1>
    </div>

    <div v-if="status === 'error'" class="text-destructive rounded-md border p-12 text-center text-sm">
      Failed to load runs: {{ error?.message }}
    </div>
    <div v-else-if="status === 'pending'" class="text-muted-foreground rounded-md border p-12 text-center text-sm">
      Loading…
    </div>
    <div v-else-if="status === 'success' && !runs?.length" class="text-muted-foreground rounded-md border p-12 text-center text-sm">
      No scan runs recorded yet.
    </div>

    <Table v-else-if="status === 'success' && runs?.length">
      <TableHeader>
        <TableRow>
          <TableHead>Started</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Messages</TableHead>
          <TableHead>Reports</TableHead>
          <TableHead>Error</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="run in runs" :key="run.id">
          <TableCell class="text-sm">{{ formatDate(run.startedAt) }}</TableCell>
          <TableCell class="text-sm">{{ duration(run.startedAt, run.finishedAt) }}</TableCell>
          <TableCell>{{ run.messagesSeen }}</TableCell>
          <TableCell>{{ run.reportsParsed }}</TableCell>
          <TableCell class="text-destructive max-w-xs truncate text-sm">
            {{ run.errorMessage ?? '—' }}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>
