<script setup lang="ts">
definePageMeta({ layout: 'default' })

interface DispositionBreakdown {
  disposition: string
  count: number
  pct: number
}

interface DomainSummary {
  name: string
  messageCount: number
}

interface RecentRecord {
  id: string
  reportId: string
  domainName: string
  dateBegin: string
  count: number
  disposition: string
  dkim: string
  spf: string
  headerFrom: string
  dkimAuthResult: string | null
  spfAuthResult: string | null
  dmarcCompliant: boolean
}

interface GeoData {
  country: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
}

interface IpDetailResponse {
  ip: string
  geo: GeoData | null
  totalMessages: number
  dispositions: DispositionBreakdown[]
  domains: DomainSummary[]
  recentRecords: RecentRecord[]
}

const route = useRoute()
// route.params.ip is already decoded by Vue Router — re-encode for the API URL
const ip = route.params.ip as string

const { data, status, error } = await useFetch<IpDetailResponse>(`/api/ips/${encodeURIComponent(ip)}`)

const DISPOSITION_COLORS: Record<string, string> = {
  none: 'text-green-800 dark:text-green-300 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800',
  quarantine: 'text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800',
  reject: 'text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800',
}

function dispositionClass(d: string): string {
  return DISPOSITION_COLORS[d] ?? 'text-muted-foreground bg-muted border-border'
}

function resultClass(result: string | null): string {
  return result === 'pass' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
}

type DmarcStatus = 'pass' | 'misconfigured' | 'spoofed'

function dmarcStatus(r: RecentRecord): DmarcStatus {
  if (r.dmarcCompliant) return 'pass'
  const anyAuthPassed = r.dkimAuthResult === 'pass' || r.spfAuthResult === 'pass'
  return anyAuthPassed ? 'misconfigured' : 'spoofed'
}

const STATUS_LABEL: Record<DmarcStatus, string> = {
  pass: 'Pass',
  misconfigured: 'Misconfigured',
  spoofed: 'Spoofed',
}

const STATUS_BADGE_CLASS: Record<DmarcStatus, string> = {
  pass: 'bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800',
  misconfigured: 'bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  spoofed: 'bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800',
}

const STATUS_TOOLTIP: Record<DmarcStatus, string> = {
  pass: 'DMARC passed — SPF or DKIM alignment verified',
  misconfigured: 'Misconfigured — authentication passed but alignment failed (wrong domain, relay, or forwarding)',
  spoofed: 'Spoofed — no authentication passed; message likely forged',
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-8 p-6">
    <!-- Back nav -->
    <div class="flex items-center gap-4">
      <Button variant="ghost" size="sm" as-child>
        <NuxtLink to="/">← Dashboard</NuxtLink>
      </Button>
    </div>

    <!-- Error -->
    <div
      v-if="status === 'error'"
      class="text-destructive rounded-md border p-12 text-center text-sm"
    >
      {{ error?.message ?? 'Failed to load IP data.' }}
    </div>

    <!-- Loading -->
    <div v-else-if="status === 'pending'" class="space-y-4">
      <div class="h-8 w-48 animate-pulse rounded bg-muted" />
      <div class="grid grid-cols-3 gap-4">
        <div v-for="i in 3" :key="i" class="h-24 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>

    <!-- Success -->
    <template v-else-if="status === 'success' && data">
      <!-- Header -->
      <div>
        <h1 class="text-2xl font-semibold font-mono">{{ data.ip }}</h1>
        <p class="text-muted-foreground mt-1 text-sm">
          IP address detail
          <span v-if="data.geo?.country"> · {{ data.geo.country }}</span>
          <span v-if="data.geo?.city">, {{ data.geo.city }}</span>
        </p>
      </div>

      <!-- GeoIP + message count tiles -->
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card class="p-4">
          <CardContent class="p-0 space-y-1">
            <p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Total Messages
            </p>
            <p class="text-2xl font-bold">{{ data.totalMessages.toLocaleString() }}</p>
          </CardContent>
        </Card>
        <Card class="p-4">
          <CardContent class="p-0 space-y-1">
            <p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Country
            </p>
            <p class="text-2xl font-bold">{{ data.geo?.country ?? '—' }}</p>
          </CardContent>
        </Card>
        <Card class="p-4">
          <CardContent class="p-0 space-y-1">
            <p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              City
            </p>
            <p class="text-2xl font-bold">{{ data.geo?.city ?? '—' }}</p>
          </CardContent>
        </Card>
        <Card class="p-4">
          <CardContent class="p-0 space-y-1">
            <p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Domains Targeted
            </p>
            <p class="text-2xl font-bold">{{ data.domains.length }}</p>
          </CardContent>
        </Card>
      </div>

      <!-- Disposition breakdown -->
      <div class="space-y-2">
        <h2 class="text-base font-semibold">Disposition Breakdown</h2>
        <div class="flex flex-wrap gap-3">
          <div
            v-for="d in data.dispositions"
            :key="d.disposition"
            :class="[
              'flex flex-col items-center rounded-lg border px-5 py-3 text-center',
              dispositionClass(d.disposition),
            ]"
          >
            <span class="text-xs font-medium uppercase tracking-wide">{{ d.disposition }}</span>
            <span class="text-2xl font-bold">{{ d.pct.toFixed(1) }}%</span>
            <span class="text-xs">{{ d.count.toLocaleString() }} msgs</span>
          </div>
        </div>
      </div>

      <!-- Domains seen from this IP -->
      <div v-if="data.domains.length > 0" class="space-y-2">
        <h2 class="text-base font-semibold">Domains</h2>
        <div class="flex flex-wrap gap-2">
          <Button
            v-for="domain in data.domains"
            :key="domain.name"
            variant="outline"
            size="sm"
            as-child
          >
            <NuxtLink :to="`/domains/${encodeURIComponent(domain.name)}`">
              {{ domain.name }}
              <span class="text-muted-foreground ml-1.5 text-xs">
                {{ domain.messageCount.toLocaleString() }}
              </span>
            </NuxtLink>
          </Button>
        </div>
      </div>

      <!-- Recent records -->
      <div class="space-y-2">
        <h2 class="text-base font-semibold">Recent Records</h2>
        <div class="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Header From</TableHead>
                <TableHead class="text-right">Count</TableHead>
                <TableHead>Disposition</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>DKIM</TableHead>
                <TableHead>SPF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="rec in data.recentRecords" :key="rec.id">
                <TableCell class="text-sm">
                  {{ new Date(rec.dateBegin).toLocaleDateString() }}
                </TableCell>
                <TableCell>
                  <Button variant="link" size="sm" class="h-auto p-0 font-mono text-xs" as-child>
                    <NuxtLink :to="`/domains/${encodeURIComponent(rec.domainName)}`">
                      {{ rec.domainName }}
                    </NuxtLink>
                  </Button>
                </TableCell>
                <TableCell class="font-mono text-xs">{{ rec.headerFrom }}</TableCell>
                <TableCell class="text-right text-sm">{{ rec.count.toLocaleString() }}</TableCell>
                <TableCell>
                  <span
                    :class="[
                      'inline-block rounded-full border px-2 py-0.5 text-xs font-medium',
                      dispositionClass(rec.disposition),
                    ]"
                  >
                    {{ rec.disposition }}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    :class="STATUS_BADGE_CLASS[dmarcStatus(rec)]"
                    :title="STATUS_TOOLTIP[dmarcStatus(rec)]"
                  >
                    {{ STATUS_LABEL[dmarcStatus(rec)] }}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span :class="['text-xs font-medium', resultClass(rec.dkim)]">
                    {{ rec.dkim }}
                  </span>
                </TableCell>
                <TableCell>
                  <span :class="['text-xs font-medium', resultClass(rec.spf)]">
                    {{ rec.spf }}
                  </span>
                </TableCell>
              </TableRow>
              <TableRow v-if="data.recentRecords.length === 0">
                <TableCell colspan="8" class="text-muted-foreground py-8 text-center text-sm">
                  No records found for this IP.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </template>
  </div>
</template>
