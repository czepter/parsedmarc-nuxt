<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  entries: Array<{ date: string; dow: number; total: number }>
  from: number  // unix seconds — start of selected window
  to: number    // unix seconds — end of selected window
  loading?: boolean
}>()

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Fixed SVG coordinate width — cell width adapts so all weeks fill exactly SVG_W
const SVG_W = 500
const LABEL_W = 32
const LABEL_H = 20
const CELL_H = 14
const GAP = 2
const SVG_H = LABEL_H + 7 * (CELL_H + GAP) - GAP

// date string → message total
const dateMap = computed(() => {
  const m = new Map<string, number>()
  for (const e of props.entries) m.set(e.date, e.total)
  return m
})

interface GridDay {
  dateStr: string
  inRange: boolean
  value: number
}

interface GridWeek {
  weekStart: Date
  days: GridDay[]  // index 0=Mon … 6=Sun
}

/**
 * Build a calendar grid aligned to Monday boundaries.
 * Each column = one ISO week; each row = one weekday (Mon–Sun).
 * Cells outside [from, to] are marked inRange=false and rendered transparent.
 */
const grid = computed<GridWeek[]>(() => {
  const fromDate = new Date(props.from * 1000)
  fromDate.setHours(0, 0, 0, 0)
  const toDate = new Date(props.to * 1000)
  toDate.setHours(23, 59, 59, 999)

  // Roll back to the Monday on-or-before fromDate
  const startDow = fromDate.getDay()   // 0=Sun … 6=Sat
  const daysToMon = (startDow + 6) % 7
  const cur = new Date(fromDate)
  cur.setDate(cur.getDate() - daysToMon)

  const weeks: GridWeek[] = []
  while (cur <= toDate) {
    const weekStart = new Date(cur)
    const days: GridDay[] = []
    for (let dow = 0; dow < 7; dow++) {
      const dateStr = cur.toISOString().slice(0, 10)
      const inRange = cur >= fromDate && cur <= toDate
      days.push({ dateStr, inRange, value: inRange ? (dateMap.value.get(dateStr) ?? 0) : 0 })
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push({ weekStart, days })
  }
  return weeks
})

const numWeeks = computed(() => grid.value.length)

// Cell width in SVG units — always fills SVG_W regardless of week count
const cellW = computed(() =>
  numWeeks.value > 0
    ? (SVG_W - LABEL_W + GAP) / numWeeks.value - GAP
    : 18,
)

function colX(weekIdx: number): number {
  return LABEL_W + weekIdx * (cellW.value + GAP)
}

function rowY(dow: number): number {
  return LABEL_H + dow * (CELL_H + GAP)
}

const maxVal = computed(() =>
  props.entries.reduce((m, e) => Math.max(m, e.total), 0),
)

function cellFill(value: number, inRange: boolean): string {
  if (!inRange) return 'transparent'
  const t = maxVal.value > 0 ? value / maxVal.value : 0
  const l = 0.97 - t * (0.97 - 0.55)
  const c = 0.02 + t * (0.18 - 0.02)
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} 250)`
}

// Hover tooltip
interface HoverCell { dateStr: string; dow: number; value: number }
const hoverCell = ref<HoverCell | null>(null)

function onCellEnter(day: GridDay, dow: number) {
  if (day.inRange) hoverCell.value = { dateStr: day.dateStr, dow, value: day.value }
}

const tooltipText = computed(() => {
  if (!hoverCell.value) return ''
  const { dateStr, dow, value } = hoverCell.value
  const [y, mo, d] = dateStr.split('-').map(Number)
  const label = new Date(y!, mo! - 1, d!).toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  })
  return `${label} — ${value === 0 ? 'no data' : value.toLocaleString() + ' messages'}`
})

// Show a date label above every Nth week so at most ~5 labels appear
const labeledWeekIdxs = computed(() => {
  const n = numWeeks.value
  if (n === 0) return []
  const step = Math.max(1, Math.ceil(n / 5))
  const result: number[] = []
  for (let i = 0; i < n; i += step) result.push(i)
  return result
})

function weekLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="w-full" role="img" aria-label="Activity heatmap by day and weekday">
    <!-- Loading skeleton -->
    <Skeleton v-if="loading" class="h-[130px] w-full rounded-md" />

    <!-- Empty state (no weeks in range) -->
    <div
      v-else-if="numWeeks === 0"
      class="text-muted-foreground flex h-[130px] items-center justify-center text-sm"
    >
      No data for this window
    </div>

    <!-- Calendar heatmap -->
    <TooltipProvider v-else :delay-duration="0">
      <Tooltip :open="!!hoverCell">
        <TooltipTrigger as-child>
          <svg
            :width="SVG_W"
            :height="SVG_H"
            :viewBox="`0 0 ${SVG_W} ${SVG_H}`"
            class="w-full overflow-visible"
            @mouseleave="hoverCell = null"
          >
            <!-- Column labels: abbreviated date above selected weeks -->
            <text
              v-for="wIdx in labeledWeekIdxs"
              :key="`wlabel-${wIdx}`"
              :x="colX(wIdx) + cellW / 2"
              :y="LABEL_H - 4"
              text-anchor="middle"
              font-size="9"
              fill="var(--color-muted-foreground)"
            >{{ weekLabel(grid[wIdx]!.weekStart) }}</text>

            <!-- Row labels: Mon – Sun -->
            <text
              v-for="(day, dow) in DAYS"
              :key="`dlabel-${dow}`"
              :x="LABEL_W - 4"
              :y="rowY(dow) + CELL_H / 2 + 3"
              text-anchor="end"
              font-size="9"
              fill="var(--color-muted-foreground)"
            >{{ day }}</text>

            <!-- Cells: 7 rows × numWeeks columns -->
            <template v-for="(week, wIdx) in grid" :key="`week-${wIdx}`">
              <rect
                v-for="(day, dow) in week.days"
                :key="`cell-${wIdx}-${dow}`"
                :x="colX(wIdx)"
                :y="rowY(dow)"
                :width="cellW"
                :height="CELL_H"
                rx="3"
                :fill="cellFill(day.value, day.inRange)"
                :style="{ cursor: 'default', pointerEvents: day.inRange ? 'auto' : 'none' }"
                @mouseenter="onCellEnter(day, dow)"
              />
            </template>
          </svg>
        </TooltipTrigger>
        <TooltipContent side="top">
          {{ tooltipText }}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </div>
</template>
