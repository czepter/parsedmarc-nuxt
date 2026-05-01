<script setup lang="ts">
definePageMeta({ layout: 'default' })

interface ForensicDetailResponse {
  id: string
  domainName: string
  arrivalDate: string
  sourceIp: string
  subject: string
  rawEml: string
}

const route = useRoute()
const id = route.params.id as string

const { data, status, error } = await useFetch<ForensicDetailResponse>(
  `/api/forensics/${id}`,
)
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6 p-6">
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
      {{ error?.message ?? 'Failed to load forensic report.' }}
    </div>

    <!-- Loading -->
    <div v-else-if="status === 'pending'" class="space-y-4">
      <div class="h-8 w-96 animate-pulse rounded bg-muted" />
      <div class="h-48 animate-pulse rounded-lg bg-muted" />
    </div>

    <!-- Success -->
    <template v-else-if="status === 'success' && data">
      <!-- Header + PII badge -->
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-xl font-semibold">
            {{ data.subject || '(no subject)' }}
          </h1>
          <p class="text-muted-foreground mt-1 text-sm">
            Forensic report
            <span class="mx-1">·</span>
            {{ new Date(data.arrivalDate).toLocaleString() }}
          </p>
        </div>

        <!-- PII indicator — always shown -->
        <div
          class="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
          role="alert"
          aria-label="This report contains personal data"
        >
          <span aria-hidden="true">⚠</span>
          Contains Personal Data
        </div>
      </div>

      <!-- Metadata card -->
      <Card>
        <CardContent class="pt-4">
          <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt class="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Domain
              </dt>
              <dd class="mt-0.5">
                <Button variant="link" size="sm" class="h-auto p-0 font-mono text-sm" as-child>
                  <NuxtLink :to="`/domains/${encodeURIComponent(data.domainName)}`">
                    {{ data.domainName }}
                  </NuxtLink>
                </Button>
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Source IP
              </dt>
              <dd class="mt-0.5">
                <Button variant="link" size="sm" class="h-auto p-0 font-mono text-sm" as-child>
                  <NuxtLink :to="`/ips/${encodeURIComponent(data.sourceIp)}`">{{ data.sourceIp }}</NuxtLink>
                </Button>
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Arrival Date
              </dt>
              <dd class="mt-0.5 font-mono text-sm">
                {{ new Date(data.arrivalDate).toISOString() }}
              </dd>
            </div>
            <div class="col-span-2 sm:col-span-3">
              <dt class="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Subject
              </dt>
              <dd class="mt-0.5 text-sm">{{ data.subject || '(no subject)' }}</dd>
            </div>
            <div class="col-span-2 sm:col-span-3">
              <dt class="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Report ID
              </dt>
              <dd class="mt-0.5 font-mono text-xs text-muted-foreground">{{ data.id }}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <!-- Raw EML toggle — native <details>, no JS needed -->
      <details class="rounded-md border">
        <summary
          class="cursor-pointer select-none px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          Raw EML
          <span class="text-muted-foreground ml-2 text-xs font-normal">
            (click to expand — contains personal data)
          </span>
        </summary>
        <div class="border-t p-4">
          <pre
            class="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted p-4 font-mono text-xs leading-relaxed"
          >{{ data.rawEml }}</pre>
        </div>
      </details>
    </template>
  </div>
</template>
