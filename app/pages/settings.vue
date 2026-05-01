<script setup lang="ts">
definePageMeta({ layout: 'default' })

interface GeoipStatus {
  clientActive: boolean
}

interface SettingsStatusResponse {
  geoip: GeoipStatus
  user: { email: string }
  licenseKeyConfigured: boolean
}

const { data, status, error } = await useFetch<SettingsStatusResponse>(
  '/api/settings/status',
)

// ── Password change ────────────────────────────────────────────────────────
const pwForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})
const pwLoading = ref(false)
const pwError = ref('')
const pwSuccess = ref(false)

async function changePassword() {
  pwError.value = ''
  pwSuccess.value = false
  pwLoading.value = true
  try {
    await $fetch('/api/settings/password', { method: 'POST', body: pwForm })
    pwSuccess.value = true
    pwForm.currentPassword = ''
    pwForm.newPassword = ''
    pwForm.confirmPassword = ''
  }
  catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; message?: string }
    pwError.value = e?.data?.statusMessage ?? e?.message ?? 'Password change failed'
  }
  finally {
    pwLoading.value = false
  }
}

// ── Backup ─────────────────────────────────────────────────────────────────
function downloadBackup() {
  // import.meta.client is Nuxt 4's SSR-safe guard; the server bundle never
  // reaches this branch, so window is always defined when the code runs.
  if (import.meta.client) {
    window.location.href = '/api/settings/backup'
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-8 p-6">
    <div>
      <h1 class="text-2xl font-semibold">Settings</h1>
      <p class="text-muted-foreground mt-1 text-sm">Account and maintenance options</p>
    </div>

    <!-- Status loading / error -->
    <div v-if="status === 'pending'" class="space-y-4">
      <div v-for="i in 3" :key="i" class="h-32 animate-pulse rounded-lg bg-muted" />
    </div>
    <div
      v-else-if="status === 'error'"
      class="text-destructive rounded-md border p-6 text-sm"
    >
      {{ error?.message ?? 'Failed to load settings.' }}
    </div>

    <template v-else-if="status === 'success' && data">
      <!-- ── GeoIP card ────────────────────────────────────────── -->
      <Card>
        <CardContent class="pt-6 space-y-4">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="text-base font-semibold">GeoIP</h2>
              <p class="text-muted-foreground mt-0.5 text-sm">
                MaxMind GeoLite2 web service — enriches source IPs with country and city at ingestion time.
              </p>
            </div>

            <!-- Status badge -->
            <div class="shrink-0">
              <span
                :class="[
                  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                  data.geoip.clientActive
                    ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400'
                    : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400',
                ]"
              >
                {{ data.geoip.clientActive ? 'Active' : 'Inactive' }}
              </span>
            </div>
          </div>

          <dl class="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Credentials</dt>
              <dd class="mt-0.5 font-medium">
                <span v-if="data.licenseKeyConfigured" class="text-green-700 dark:text-green-400">Configured</span>
                <span v-else class="text-red-600 dark:text-red-400">Not set</span>
              </dd>
            </div>
          </dl>

          <p v-if="!data.licenseKeyConfigured" class="text-muted-foreground text-xs">
            Set <code class="font-mono">NUXT_MAXMIND_ACCOUNT_ID</code> and
            <code class="font-mono">NUXT_MAXMIND_LICENSE_KEY</code> to enable GeoIP enrichment.
          </p>
        </CardContent>
      </Card>

      <!-- ── Password card ─────────────────────────────────────── -->
      <Card>
        <CardContent class="pt-6 space-y-4">
          <div>
            <h2 class="text-base font-semibold">Change Password</h2>
            <p class="text-muted-foreground mt-0.5 text-sm">
              Account: <span class="font-mono text-foreground">{{ data.user.email }}</span>
            </p>
          </div>

          <form class="space-y-3" @submit.prevent="changePassword">
            <div class="space-y-1.5">
              <Label for="current-password">Current password</Label>
              <Input
                id="current-password"
                v-model="pwForm.currentPassword"
                type="password"
                autocomplete="current-password"
                required
              />
            </div>
            <div class="space-y-1.5">
              <Label for="new-password">New password</Label>
              <Input
                id="new-password"
                v-model="pwForm.newPassword"
                type="password"
                autocomplete="new-password"
                required
                minlength="12"
              />
            </div>
            <div class="space-y-1.5">
              <Label for="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                v-model="pwForm.confirmPassword"
                type="password"
                autocomplete="new-password"
                required
              />
            </div>
            <p v-if="pwError" class="text-destructive text-sm">{{ pwError }}</p>
            <p v-if="pwSuccess" class="text-sm text-green-700 dark:text-green-400">
              Password changed successfully.
            </p>
            <Button type="submit" :disabled="pwLoading" size="sm">
              {{ pwLoading ? 'Saving…' : 'Change password' }}
            </Button>
          </form>
        </CardContent>
      </Card>

      <!-- ── Backup card ───────────────────────────────────────── -->
      <Card>
        <CardContent class="pt-6 space-y-4">
          <div>
            <h2 class="text-base font-semibold">Database Backup</h2>
            <p class="text-muted-foreground mt-0.5 text-sm">
              Download a clean SQLite snapshot using <code class="font-mono text-xs">VACUUM INTO</code>.
              The file is named <code class="font-mono text-xs">parsedmarc-YYYY-MM-DD.db</code>.
            </p>
          </div>
          <Button variant="outline" size="sm" @click="downloadBackup">
            Download SQLite snapshot
          </Button>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
