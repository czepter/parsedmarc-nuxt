<script setup lang="ts">
definePageMeta({ layout: 'default' })

interface TopIp {
  sourceIp: string
  country: string | null
  totalCount: number
  passCount: number
  passRate: number
}

interface RecentReport {
  id: string
  reportId: string
  orgName: string
  dateBegin: string
  dateEnd: string
  recordCount: number
}

interface DomainDetailResponse {
  name: string
  totalMessages: number
  distinctIps: number
  forensicCount: number
  topIps: TopIp[]
  recentReports: RecentReport[]
}

const route = useRoute()
// route.params.name is already decoded by Vue Router — re-encode for the API URL
const domainName = route.params.name as string

const { data, status, error } = await useFetch<DomainDetailResponse>(
  `/api/domains/${encodeURIComponent(domainName)}`,
)

function passRateClass(rate: number): string {
  if (rate >= 90) return 'text-green-700 dark:text-green-400'
  if (rate >= 50) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-8 p-6">

    <!-- Error state -->
    <div
      v-if="status === 'error'"
      class="text-destructive rounded-md border p-12 text-center text-sm"
    >
      {{ error?.message ?? 'Failed to load domain data.' }}
    </div>

    <!-- Loading state -->
    <div
      v-else-if="status === 'pending'"
      class="space-y-4"
    >
      <div class="h-8 w-64 animate-pulse rounded bg-muted" />
      <div class="grid grid-cols-3 gap-4">
        <div v-for="i in 3" :key="i" class="h-24 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>

    <!-- Success state -->
    <template v-else-if="status === 'success' && data">
      <!-- Header -->
      <PageHeader :title="data.name" subtitle="Domain detail" />

      <!-- Summary tiles -->
      <div class="grid grid-cols-3 gap-4">
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
              Distinct source IPs
            </p>
            <p class="text-2xl font-bold">{{ data.distinctIps.toLocaleString() }}</p>
          </CardContent>
        </Card>
        <Card class="p-4">
          <CardContent class="p-0 space-y-1">
            <p class="text-muted-foreground text-xs font-medium tracking-wide">
              Forensic reports
            </p>
            <p class="text-2xl font-bold">{{ data.forensicCount.toLocaleString() }}</p>
          </CardContent>
        </Card>
      </div>

      <!-- Drift callout (hidden when aligned) -->
      <DriftDetail :domain="data.name" />

      <!-- Email auth (DMARC / SPF / DKIM / MX) -->
      <EmailAuthCard :domain="data.name" />

      <!-- Top IPs table -->
      <div class="space-y-2">
        <h2 class="text-base font-semibold">Top Source IPs</h2>
        <Card>
          <CardContent class="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source IP</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead class="text-right">Messages</TableHead>
                  <TableHead class="text-right">Pass Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="ip in data.topIps"
                  :key="ip.sourceIp"
                >
                  <TableCell>
                    <Button variant="link" size="sm" class="h-auto p-0 font-mono text-xs" as-child>
                      <NuxtLink :to="`/ips/${encodeURIComponent(ip.sourceIp)}`">{{ ip.sourceIp }}</NuxtLink>
                    </Button>
                  </TableCell>
                  <TableCell class="text-sm">{{ ip.country ?? '—' }}</TableCell>
                  <TableCell class="text-right text-sm">{{ ip.totalCount.toLocaleString() }}</TableCell>
                  <TableCell class="text-right">
                    <span :class="['text-sm font-medium', passRateClass(ip.passRate)]">
                      {{ ip.passRate.toFixed(1) }}%
                    </span>
                  </TableCell>
                </TableRow>
                <TableRow v-if="data.topIps.length === 0">
                  <TableCell colspan="4" class="text-muted-foreground py-8 text-center text-sm">
                    No source IPs found.
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <!-- Recent aggregate reports -->
      <div class="space-y-2">
        <h2 class="text-base font-semibold">Recent Aggregate Reports</h2>
        <Card>
          <CardContent class="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Report ID</TableHead>
                  <TableHead>Sender Org</TableHead>
                  <TableHead>Period Start</TableHead>
                  <TableHead>Period End</TableHead>
                  <TableHead class="text-right">Records</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="report in data.recentReports"
                  :key="report.id"
                >
                  <TableCell class="font-mono text-xs max-w-xs truncate">
                    {{ report.reportId }}
                  </TableCell>
                  <TableCell class="text-sm">{{ report.orgName }}</TableCell>
                  <TableCell class="text-sm">
                    {{ new Date(report.dateBegin).toLocaleDateString() }}
                  </TableCell>
                  <TableCell class="text-sm">
                    {{ new Date(report.dateEnd).toLocaleDateString() }}
                  </TableCell>
                  <TableCell class="text-right text-sm">{{ report.recordCount }}</TableCell>
                </TableRow>
                <TableRow v-if="data.recentReports.length === 0">
                  <TableCell colspan="5" class="text-muted-foreground py-8 text-center text-sm">
                    No reports found.
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
