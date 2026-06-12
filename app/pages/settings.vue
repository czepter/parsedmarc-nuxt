<script setup lang="ts">
import AlertDialog from '~/components/ui/alert-dialog/AlertDialog.vue'
import AlertDialogTrigger from '~/components/ui/alert-dialog/AlertDialogTrigger.vue'
import AlertDialogContent from '~/components/ui/alert-dialog/AlertDialogContent.vue'
import AlertDialogHeader from '~/components/ui/alert-dialog/AlertDialogHeader.vue'
import AlertDialogFooter from '~/components/ui/alert-dialog/AlertDialogFooter.vue'
import AlertDialogTitle from '~/components/ui/alert-dialog/AlertDialogTitle.vue'
import AlertDialogDescription from '~/components/ui/alert-dialog/AlertDialogDescription.vue'
import AlertDialogAction from '~/components/ui/alert-dialog/AlertDialogAction.vue'
import AlertDialogCancel from '~/components/ui/alert-dialog/AlertDialogCancel.vue'

useHead({ title: 'Settings — parsedmarc' })

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
    const e = err as { data?: { message?: string; statusMessage?: string }; message?: string }
    pwError.value = e?.data?.message ?? e?.data?.statusMessage ?? e?.message ?? 'Password change failed'
  }
  finally {
    pwLoading.value = false
  }
}

// ── Reset + Rescan ─────────────────────────────────────────────────────────
type ResetPhase = 'idle' | 'resetting' | 'rescanning' | 'done' | 'error'
const resetPhase = ref<ResetPhase>('idle')
const resetLogs = ref<Array<{ level: string; message: string; ts: string }>>([])
const resetSummary = ref<{ totalMessages: number; totalReports: number; totalDuplicates: number } | null>(null)
const resetError = ref('')

function startReset() {
  resetPhase.value = 'resetting'
  resetLogs.value = []
  resetSummary.value = null
  resetError.value = ''

  if (!import.meta.client) return
  const es = new EventSource('/api/settings/reset-and-rescan-stream')

  es.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.type === 'reset-done') {
      resetPhase.value = 'rescanning'
    }
    else if (msg.type === 'log') {
      resetLogs.value.push({ level: msg.level, message: msg.message, ts: msg.ts })
    }
    else if (msg.type === 'done') {
      resetSummary.value = { totalMessages: msg.totalMessages, totalReports: msg.totalReports, totalDuplicates: msg.totalDuplicates ?? 0 }
      resetPhase.value = 'done'
      es.close()
    }
    else if (msg.type === 'error') {
      resetError.value = msg.message
      resetPhase.value = 'error'
      es.close()
    }
  }

  es.onerror = () => {
    resetError.value = 'Connection lost — check server logs.'
    resetPhase.value = 'error'
    es.close()
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
    <PageHeader title="Settings" subtitle="Account and maintenance options" />

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
      <Card class="shadow-sm">
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
      <Card class="shadow-sm">
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
      <Card class="shadow-sm">
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

      <!-- ── Reset + Rescan card ──────────────────────────────── -->
      <Card class="border-destructive/40">
        <CardContent class="pt-6 space-y-4">
          <div>
            <h2 class="text-base font-semibold text-destructive">Reset Database</h2>
            <p class="text-muted-foreground mt-0.5 text-sm">
              Wipes all DMARC report data (aggregate, forensic, domains, geo) then re-imports every
              message from all enabled inboxes. Inbox configs and your account are preserved.
            </p>
          </div>

          <AlertDialog>
            <AlertDialogTrigger as-child>
              <Button
                variant="destructive"
                size="sm"
                :disabled="resetPhase !== 'idle' && resetPhase !== 'done' && resetPhase !== 'error'"
              >
                Reset &amp; Re-import
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset all DMARC data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes all aggregate reports, forensic reports, domains, and geo
                  data, then re-imports every message from your enabled inboxes. This cannot be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction @click="startReset">
                  Yes, reset &amp; re-import
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <!-- Progress panel (browser-only — EventSource) -->
          <ClientOnly>
            <div v-if="resetPhase !== 'idle'" class="space-y-3">
              <!-- Phase label -->
              <p class="text-sm font-medium">
                <span v-if="resetPhase === 'resetting'">Resetting database…</span>
                <span v-else-if="resetPhase === 'rescanning'">Re-importing messages…</span>
                <span v-else-if="resetPhase === 'done'" class="text-green-700 dark:text-green-400">
                  ✓ Done —
                  {{ resetSummary?.totalMessages }} message(s) seen,
                  {{ resetSummary?.totalReports }} report(s) imported
                  <template v-if="resetSummary && resetSummary.totalDuplicates > 0">
                    , {{ resetSummary.totalDuplicates }} duplicate(s) skipped
                  </template>
                </span>
                <span v-else-if="resetPhase === 'error'" class="text-destructive">
                  Error: {{ resetError }}
                </span>
              </p>

              <!-- Log lines -->
              <div
                v-if="resetLogs.length > 0"
                class="rounded-md border bg-muted/40 p-3 max-h-64 overflow-y-auto font-mono text-xs space-y-0.5"
              >
                <div
                  v-for="(entry, i) in resetLogs"
                  :key="i"
                  :class="{
                    'text-muted-foreground': entry.level === 'info',
                    'text-green-700 dark:text-green-400': entry.level === 'success',
                    'text-yellow-600 dark:text-yellow-400': entry.level === 'warn',
                    'text-destructive': entry.level === 'error',
                  }"
                >
                  {{ entry.message }}
                </div>
              </div>
            </div>
          </ClientOnly>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
