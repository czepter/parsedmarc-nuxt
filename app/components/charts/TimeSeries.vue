<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import type UplotInstance from 'uplot'

type Granularity = 'hour' | 'day' | 'week' | 'month'

interface Props {
  timestamps: number[]   // unix seconds
  none: number[]
  quarantine: number[]
  reject: number[]
  granularity?: Granularity
  height?: number
}

const props = withDefaults(defineProps<Props>(), { height: 300, granularity: 'day' })

function formatTick(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000)
  switch (props.granularity) {
    case 'hour':
      return `${String(d.getHours()).padStart(2, '0')}:00`
    case 'month':
      return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
    case 'week':
    case 'day':
    default:
      return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  }
}

const containerRef = ref<HTMLDivElement | null>(null)
let chart: UplotInstance | null = null
let ro: ResizeObserver | null = null

const COLOR_PASS = '#22c55e'
const COLOR_QUARANTINE = '#f59e0b'
const COLOR_REJECT = '#ef4444'

// Stacked bars: pass each series the cumulative TOP of its segment.
// Series are drawn in array order, so larger cumulatives go first; smaller
// cumulatives overdraw the bottom portion, leaving each segment's color visible.
function buildData(): import('uplot').AlignedData {
  const n = props.timestamps.length
  const cumReject = new Float64Array(n)      // pass + qua + rej (full stack)
  const cumQuarantine = new Float64Array(n)  // pass + qua
  const cumPass = new Float64Array(n)        // pass
  for (let i = 0; i < n; i++) {
    const p = props.none[i] ?? 0
    const q = props.quarantine[i] ?? 0
    const r = props.reject[i] ?? 0
    cumPass[i] = p
    cumQuarantine[i] = p + q
    cumReject[i] = p + q + r
  }
  return [new Float64Array(props.timestamps), cumReject, cumQuarantine, cumPass]
}

// Look up the original (non-cumulative) value for legend display.
function originalValue(sIdx: number, idx: number): number {
  if (sIdx === 1) return props.reject[idx] ?? 0
  if (sIdx === 2) return props.quarantine[idx] ?? 0
  if (sIdx === 3) return props.none[idx] ?? 0
  return 0
}

// Draw value labels inside each stacked segment, skipping segments that are
// too short to hold readable text or whose value is zero.
function drawValueLabels(u: UplotInstance) {
  const ctx = u.ctx
  // ctx is in canvas-pixel space (uPlot never scales it); DPR-multiply font
  // size and pixel thresholds so labels render at their intended CSS size.
  const dpr = window.devicePixelRatio || 1
  const fontPx = Math.round(11 * dpr)
  const minSegmentPx = 16 * dpr

  ctx.save()
  ctx.font = `600 ${fontPx}px ui-sans-serif, system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'

  const xs = props.timestamps

  for (let i = 0; i < xs.length; i++) {
    // canvasPixels=true is required: ctx draws in canvas-pixel space (uPlot
    // never calls ctx.scale), and bbox.left/width are stored as DPR-multiplied
    // canvas pixels — only valToPos(..., true) returns matching coordinates.
    const xPos = u.valToPos(xs[i]!, 'x', true)
    const passVal = props.none[i] ?? 0
    const quaVal = props.quarantine[i] ?? 0
    const rejVal = props.reject[i] ?? 0

    const yBase = u.valToPos(0, 'y', true)
    const yPass = u.valToPos(passVal, 'y', true)
    const yQua = u.valToPos(passVal + quaVal, 'y', true)
    const yRej = u.valToPos(passVal + quaVal + rejVal, 'y', true)

    if (passVal > 0 && yBase - yPass >= minSegmentPx) {
      ctx.fillText(String(passVal), xPos, (yBase + yPass) / 2)
    }
    if (quaVal > 0 && yPass - yQua >= minSegmentPx) {
      ctx.fillText(String(quaVal), xPos, (yPass + yQua) / 2)
    }
    if (rejVal > 0 && yQua - yRej >= minSegmentPx) {
      ctx.fillText(String(rejVal), xPos, (yQua + yRej) / 2)
    }
  }
  ctx.restore()
}

function buildOpts(uPlot: typeof UplotInstance, width: number): import('uplot').Options {
  const bars = uPlot.paths.bars!({ size: [0.6, 100] })

  const segmentValue = (
    _u: UplotInstance,
    _v: number | null,
    sIdx: number,
    idx: number | null,
  ) => (idx == null ? '—' : String(originalValue(sIdx, idx)))

  return {
    width,
    height: props.height,
    series: [
      {
        value: (_u, v) =>
          v == null
            ? '—'
            : new Date(v * 1000).toLocaleString(undefined, { dateStyle: 'medium' }),
      },
      {
        label: 'Reject',
        stroke: COLOR_REJECT,
        fill: COLOR_REJECT,
        paths: bars,
        points: { show: false },
        value: segmentValue,
      },
      {
        label: 'Quarantine',
        stroke: COLOR_QUARANTINE,
        fill: COLOR_QUARANTINE,
        paths: bars,
        points: { show: false },
        value: segmentValue,
      },
      {
        label: 'Pass (none)',
        stroke: COLOR_PASS,
        fill: COLOR_PASS,
        paths: bars,
        points: { show: false },
        value: segmentValue,
      },
    ],
    axes: [
      {
        stroke: '#000000',
        // One tick per bar — uPlot's auto tick generation produces sub-bucket
        // ticks (hourly when buckets are daily), which we don't want.
        splits: () => props.timestamps,
        // Format depends on bucket granularity (hour → HH:00, month → "Mai 26",
        // day/week → "5. Mai"). Locale follows the browser.
        values: (_u, splits) => splits.map(formatTick),
      },
      {
        label: 'Messages',
        stroke: 'var(--color-muted-foreground)',
        grid: { stroke: 'var(--color-border)', width: 1 },
        ticks: { stroke: 'var(--color-border)' },
      },
    ],
    scales: {
      x: { time: true },
      // Bars must originate from zero, not the data minimum.
      y: { range: (_u, _min, max) => [0, Math.max(max, 1)] },
    },
    cursor: {
      drag: { x: false, y: false },
      points: { show: false },
    },
    legend: { show: true },
    hooks: {
      draw: [drawValueLabels],
    },
  }
}

async function initChart() {
  if (!import.meta.client) return
  if (!containerRef.value) return

  const uPlot = (await import('uplot')).default
  await import('uplot/dist/uPlot.min.css')

  if (chart) {
    chart.destroy()
    chart = null
  }

  const width = containerRef.value.clientWidth || 600
  chart = new uPlot(buildOpts(uPlot, width), buildData(), containerRef.value)
}

function destroyChart() {
  if (chart) {
    chart.destroy()
    chart = null
  }
}

onMounted(async () => {
  await initChart()
  if (containerRef.value) {
    ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 600
      if (chart) chart.setSize({ width, height: props.height })
    })
    ro.observe(containerRef.value)
  }
})

onUnmounted(() => {
  destroyChart()
  if (ro) {
    ro.disconnect()
    ro = null
  }
})

watch(
  () => [
    props.timestamps,
    props.none,
    props.quarantine,
    props.reject,
    props.granularity,
    props.height,
  ],
  async () => {
    if (!import.meta.client) return
    if (chart && props.timestamps.length > 0) {
      chart.setData(buildData())
    }
    else if (!chart) {
      await initChart()
    }
  },
  { deep: false },
)
</script>

<template>
  <div
    ref="containerRef"
    class="w-full"
    role="img"
    aria-label="Message volume over time, stacked bar chart by DMARC disposition"
  />
</template>
