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

function resultClass(result: string | null): string {
  return result === 'pass' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
}

type DmarcStatus = 'pass' | 'misconfigured' | 'spoofed'

function dmarcStatus(r: RecentRecord): DmarcStatus {
  if (r.dmarcCompliant) return 'pass'
  const anyAuthPassed = r.dkimAuthResult === 'pass' || r.spfAuthResult === 'pass'
  return anyAuthPassed ? 'misconfigured' : 'spoofed'
}

const STATUS_TOOLTIP: Record<DmarcStatus, string> = {
  pass: 'DMARC passed — SPF or DKIM alignment verified',
  misconfigured: 'Misconfigured — authentication passed but alignment failed (wrong domain, relay, or forwarding)',
  spoofed: 'Spoofed — no authentication passed; message likely forged',
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-8 p-6">

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
      <PageHeader
        :title="data.ip"
        :subtitle="['IP address detail', data.geo?.country, data.geo?.city].filter(Boolean).join(' · ')"
      />

      <!-- GeoIP + message count tiles -->
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card class="p-4">
          <CardContent class="p-0 space-y-1">
            <p class="text-muted-foreground text-xs font-medium tracking-wide">
              Total messages
            </p>
            <p class="text-2xl font-bold">{{ data.totalMessages.toLocaleString() }}</p>
          </CardContent>
        </Card>
        <Card class="p-4">
          <CardContent class="p-0 space-y-1">
            <p class="text-muted-foreground text-xs font-medium tracking-wide">
              Country
            </p>
            <p class="text-2xl font-bold">{{ data.geo?.country ?? '—' }}</p>
          </CardContent>
        </Card>
        <Card class="p-4">
          <CardContent class="p-0 space-y-1">
            <p class="text-muted-foreground text-xs font-medium tracking-wide">
              City
            </p>
            <p class="text-2xl font-bold">{{ data.geo?.city ?? '—' }}</p>
          </CardContent>
        </Card>
        <Card class="p-4">
          <CardContent class="p-0 space-y-1">
            <p class="text-muted-foreground text-xs font-medium tracking-wide">
              Domains targeted
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
            class="flex flex-col items-center rounded-lg border px-5 py-3 text-center"
          >
            <DispositionBadge :kind="(d.disposition as 'none' | 'quarantine' | 'reject')" />
            <span class="text-2xl font-bold mt-1">{{ d.pct.toFixed(1) }}%</span>
            <span class="text-xs text-muted-foreground">{{ d.count.toLocaleString() }} {{ d.count === 1 ? 'msg' : 'msgs' }}</span>
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
        <Card>
          <CardContent class="p-0">
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
                    <DispositionBadge :kind="(rec.disposition as 'none' | 'quarantine' | 'reject')" size="sm" />
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      :kind="dmarcStatus(rec)"
                      :title="STATUS_TOOLTIP[dmarcStatus(rec)]"
                    />
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
          </CardContent>
        </Card>
      </div>
    </template>
  </div>
</template>
