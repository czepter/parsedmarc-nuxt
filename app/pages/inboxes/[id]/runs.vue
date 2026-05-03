<script setup lang="ts">
definePageMeta({ layout: 'default' })
const route = useRoute()
const id = route.params.id as string

const { data: inbox } = await useFetch<{ label: string }>(`/api/inboxes/${id}`)
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
    <PageHeader title="Scan Runs" :subtitle="inbox?.label ? `${inbox.label} inbox` : undefined" />

    <Card v-if="status === 'error'">
      <CardContent class="pt-6 text-destructive p-12 text-center text-sm">
        Failed to load runs: {{ error?.message }}
      </CardContent>
    </Card>
    <Card v-else-if="status === 'pending'">
      <CardContent class="pt-6 text-muted-foreground p-12 text-center text-sm">
        Loading…
      </CardContent>
    </Card>
    <Card v-else-if="status === 'success' && !runs?.length">
      <CardContent class="pt-6 text-muted-foreground p-12 text-center text-sm">
        No scan runs recorded yet.
      </CardContent>
    </Card>

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
          <TableCell :class="[run.errorMessage ? 'text-destructive' : 'text-muted-foreground', 'max-w-xs truncate text-sm']">
            {{ run.errorMessage ?? '—' }}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>
