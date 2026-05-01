<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  matrix: number[][]  // matrix[dow][hour], dow 0=Mon…6=Sun, hour 0–23
  loading?: boolean
}>()

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const HOUR_LABELS = [0, 3, 6, 9, 12, 15, 18, 21]

const CELL_W = 20
const CELL_H = 14
const GAP = 2
const LABEL_W = 30
const LABEL_H = 18
const SVG_W = LABEL_W + 24 * (CELL_W + GAP) - GAP
const SVG_H = LABEL_H + 7 * (CELL_H + GAP) - GAP

interface HoverCell {
  dow: number
  hour: number
  value: number
}

const hoverCell = ref<HoverCell | null>(null)

const maxVal = computed(() => {
  let max = 0
  for (const row of props.matrix) {
    for (const v of row) {
      if (v > max) max = v
    }
  }
  return max
})

const isEmpty = computed(() => maxVal.value === 0)

function cellFill(value: number): string {
  if (isEmpty.value) return 'oklch(0.93 0.01 250)'
  const t = maxVal.value > 0 ? value / maxVal.value : 0
  // Interpolate between near-transparent (t=0) and deep blue (t=1)
  const l = 0.97 - t * (0.97 - 0.55)
  const c = 0.02 + t * (0.18 - 0.02)
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} 250)`
}

const tooltipText = computed(() => {
  if (!hoverCell.value) return ''
  const { dow, hour, value } = hoverCell.value
  const dayName = DAYS[dow]
  const hourStr = `${String(hour).padStart(2, '0')}:00`
  return `${dayName} ${hourStr} — ${value.toLocaleString()} messages`
})

function cellX(hour: number): number {
  return LABEL_W + hour * (CELL_W + GAP)
}

function cellY(dow: number): number {
  return LABEL_H + dow * (CELL_H + GAP)
}
</script>

<template>
  <div class="w-full" role="img" aria-label="Activity heatmap by weekday and hour">
    <!-- Loading skeleton -->
    <Skeleton v-if="loading" class="h-[140px] w-full rounded-md" />

    <!-- Empty state -->
    <div
      v-else-if="isEmpty && !loading"
      class="text-muted-foreground flex h-[140px] items-center justify-center text-sm"
    >
      No data for this window
    </div>

    <!-- Heatmap -->
    <TooltipProvider v-else :delay-duration="0">
      <Tooltip :open="!!hoverCell">
        <TooltipTrigger as-child>
          <svg
            :width="SVG_W"
            :height="SVG_H"
            class="w-full overflow-visible"
            :viewBox="`0 0 ${SVG_W} ${SVG_H}`"
            @mouseleave="hoverCell = null"
          >
            <!-- Column labels (hours) -->
            <text
              v-for="h in HOUR_LABELS"
              :key="`hlabel-${h}`"
              :x="cellX(h) + CELL_W / 2"
              :y="LABEL_H - 4"
              text-anchor="middle"
              class="fill-muted-foreground text-[9px]"
              font-size="9"
              fill="var(--color-muted-foreground)"
            >{{ h }}</text>

            <!-- Row labels (days) -->
            <text
              v-for="(day, dow) in DAYS"
              :key="`dlabel-${dow}`"
              :x="LABEL_W - 4"
              :y="cellY(dow) + CELL_H / 2 + 3"
              text-anchor="end"
              font-size="9"
              fill="var(--color-muted-foreground)"
            >{{ day }}</text>

            <!-- Cells (7×24 = 168) -->
            <template v-for="dow in 7" :key="`row-${dow}`">
              <rect
                v-for="hour in HOURS"
                :key="`cell-${dow - 1}-${hour}`"
                :x="cellX(hour)"
                :y="cellY(dow - 1)"
                :width="CELL_W"
                :height="CELL_H"
                rx="3"
                :fill="cellFill(matrix[dow - 1]?.[hour] ?? 0)"
                style="cursor: default"
                @mouseenter="hoverCell = { dow: dow - 1, hour, value: matrix[dow - 1]?.[hour] ?? 0 }"
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
