<script setup lang="ts">
import { MoreHorizontal } from 'lucide-vue-next'

useHead({ title: 'Inboxes — parsedmarc' })

definePageMeta({ layout: 'default' })
const { data: inboxes, refresh, status, error } = await useFetch('/api/inboxes')

const deletingId = ref<string | null>(null)

// ── Scan log drawer ──────────────────────────────────────────────────────────
const drawerOpen = ref(false)
const drawerInboxId = ref('')
const drawerInboxLabel = ref('')

function openScanDrawer(id: string, label: string) {
  drawerInboxId.value = id
  drawerInboxLabel.value = label
  drawerOpen.value = true
}

function onScanDone() {
  refresh()
}

// ── Delete ───────────────────────────────────────────────────────────────────
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

// ── Formatters ───────────────────────────────────────────────────────────────
function relativeTime(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const then = new Date(d).getTime()
  const diffSec = Math.round((Date.now() - then) / 1000)
  if (diffSec < 45) return 'just now'
  if (diffSec < 90) return '1 min ago'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hr ago`
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`
  const diffMo = Math.round(diffDay / 30)
  if (diffMo < 12) return `${diffMo} mo ago`
  return `${Math.round(diffMo / 12)} yr ago`
}

function absoluteTime(d: string | Date | null | undefined): string {
  if (!d) return ''
  return new Date(d).toLocaleString('en-US')
}

function successRateClass(rate: number | null): string {
  if (rate === null) return 'text-muted-foreground'
  if (rate >= 0.95) return 'text-emerald-600 dark:text-emerald-400'
  if (rate >= 0.8) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function dotClass(ok: boolean | null): string {
  if (ok === null) return 'bg-muted-foreground/40'
  return ok ? 'bg-emerald-500' : 'bg-red-500'
}
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 p-6">
    <PageHeader title="Inboxes">
      <template #right>
        <Button variant="outline" size="sm" as-child>
          <NuxtLink to="/inboxes/new">+ Add Inbox</NuxtLink>
        </Button>
      </template>
    </PageHeader>

    <Card v-if="status === 'error'">
      <CardContent class="pt-6 text-destructive p-12 text-center text-sm">
        Failed to load inboxes: {{ error?.message }}
      </CardContent>
    </Card>
    <div v-else-if="status === 'success' && inboxes?.length === 0" class="py-12 text-center">
      <p class="text-muted-foreground text-sm">No inboxes configured yet.</p>
      <Button variant="outline" size="sm" class="mt-4" as-child>
        <NuxtLink to="/inboxes/new">Add your first inbox</NuxtLink>
      </Button>
    </div>

    <Table v-else-if="status === 'success' && inboxes?.length">
      <TableHeader>
        <TableRow>
          <TableHead>Label</TableHead>
          <TableHead>Host</TableHead>
          <TableHead>Status</TableHead>
          <TableHead class="text-right">Messages</TableHead>
          <TableHead>Last Run</TableHead>
          <TableHead class="text-right">Success Rate</TableHead>
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
          <TableCell class="text-right tabular-nums">
            {{ (inbox.messagesSeen ?? 0).toLocaleString('en-US') }}
          </TableCell>
          <TableCell>
            <div class="flex items-center gap-2">
              <span
                class="inline-block size-2 rounded-full"
                :class="dotClass(inbox.lastRunOk)"
                aria-hidden="true"
              />
              <span class="text-sm" :title="absoluteTime(inbox.lastRunAt)">
                {{ relativeTime(inbox.lastRunAt) }}
              </span>
            </div>
          </TableCell>
          <TableCell class="text-right tabular-nums" :class="successRateClass(inbox.successRate)">
            <template v-if="inbox.successRate === null">—</template>
            <template v-else>{{ Math.round(inbox.successRate * 100) }}%</template>
          </TableCell>
          <TableCell class="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="icon" aria-label="Actions">
                  <MoreHorizontal class="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem as-child>
                  <NuxtLink :to="`/inboxes/${inbox.id}/edit`">Edit</NuxtLink>
                </DropdownMenuItem>
                <DropdownMenuItem as-child>
                  <NuxtLink :to="`/inboxes/${inbox.id}/runs`">Runs</NuxtLink>
                </DropdownMenuItem>
                <DropdownMenuItem @select="openScanDrawer(inbox.id, inbox.label)">
                  Scan Now
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  :disabled="deletingId === inbox.id"
                  @select="deleteInbox(inbox.id, inbox.label)"
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
    <div v-if="status === 'success' && inboxes?.length" class="mt-3 text-center">
      <NuxtLink to="/inboxes/new" class="text-xs text-muted-foreground hover:text-foreground">+ Add another inbox</NuxtLink>
    </div>
  </div>

  <!-- ClientOnly: EventSource and Teleport are browser-only -->
  <ClientOnly>
    <ScanLogDrawer
      :open="drawerOpen"
      :inbox-id="drawerInboxId"
      :inbox-label="drawerInboxLabel"
      @close="drawerOpen = false"
      @done="onScanDone"
    />
  </ClientOnly>
</template>
