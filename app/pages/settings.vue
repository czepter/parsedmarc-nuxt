<script setup lang="ts">
definePageMeta({ layout: 'default' })

interface MmdbStatus {
  exists: boolean
  ageDays: number | null
  readerActive: boolean
}

interface SettingsStatusResponse {
  mmdb: MmdbStatus
  user: { email: string }
  licenseKeyConfigured: boolean
}

const { data, status, error, refresh } = await useFetch<SettingsStatusResponse>(
  '/api/settings/status',
)

// ── GeoIP refresh ──────────────────────────────────────────────────────────
const refreshing = ref(false)
const refreshError = ref('')
const refreshSuccess = ref(false)

async function refreshMmdb() {
  refreshing.value = true
  refreshError.value = ''
  refreshSuccess.value = false
  try {
    await $fetch('/api/settings/mmdb-refresh', { method: 'POST' })
    refreshSuccess.value = true
    await refresh()
  }
  catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; message?: string }
    refreshError.value = e?.data?.statusMessage ?? e?.message ?? 'Refresh failed'
  }
  finally {
    refreshing.value = false
  }
}

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
  window.location.href = '/api/settings/backup'
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
              <h2 class="text-base font-semibold">GeoIP Database</h2>
              <p class="text-muted-foreground mt-0.5 text-sm">
                MaxMind GeoLite2-City — used to enrich source IPs with country and city.
              </p>
            </div>

            <!-- Status badge -->
            <div class="shrink-0">
              <span
                v-if="data.mmdb.exists"
                :class="[
                  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                  data.mmdb.readerActive
                    ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400'
                    : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400',
                ]"
              >
                {{ data.mmdb.readerActive ? 'Active' : 'File present, reader inactive' }}
              </span>
              <span
                v-else
                class="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
              >
                Not downloaded
              </span>
            </div>
          </div>

          <!-- Age info -->
          <dl class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div v-if="data.mmdb.exists">
              <dt class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Age</dt>
              <dd class="mt-0.5 font-medium">
                {{ data.mmdb.ageDays }} day{{ data.mmdb.ageDays === 1 ? '' : 's' }}
                <span
                  v-if="data.mmdb.ageDays !== null && data.mmdb.ageDays > 35"
                  class="text-amber-600 dark:text-amber-400"
                >
                  (stale)
                </span>
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground text-xs font-medium uppercase tracking-wide">License key</dt>
              <dd class="mt-0.5 font-medium">
                <span v-if="data.licenseKeyConfigured" class="text-green-700 dark:text-green-400">Configured</span>
                <span v-else class="text-red-600 dark:text-red-400">Not set</span>
              </dd>
            </div>
          </dl>

          <!-- Refresh button + feedback -->
          <div class="space-y-2">
            <Button
              :disabled="refreshing || !data.licenseKeyConfigured"
              size="sm"
              @click="refreshMmdb"
            >
              {{ refreshing ? 'Downloading…' : 'Refresh GeoIP now' }}
            </Button>
            <p v-if="!data.licenseKeyConfigured" class="text-muted-foreground text-xs">
              Set <code class="font-mono">NUXT_MAXMIND_LICENSE_KEY</code> to enable GeoIP refresh.
            </p>
            <p v-if="refreshError" class="text-destructive text-sm">{{ refreshError }}</p>
            <p v-if="refreshSuccess" class="text-sm text-green-700 dark:text-green-400">
              GeoIP database refreshed successfully.
            </p>
          </div>
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
