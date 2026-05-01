<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

interface Props {
  timestamps: number[]   // unix seconds
  none: number[]
  quarantine: number[]
  reject: number[]
  height?: number
}

const props = withDefaults(defineProps<Props>(), { height: 300 })

const containerRef = ref<HTMLDivElement | null>(null)
let chart: import('uplot').default | null = null
let ro: ResizeObserver | null = null

function buildData(): import('uplot').AlignedData {
  return [
    new Float64Array(props.timestamps),
    new Float64Array(props.none),
    new Float64Array(props.quarantine),
    new Float64Array(props.reject),
  ]
}

function buildOpts(width: number): import('uplot').Options {
  return {
    width,
    height: props.height,
    series: [
      {},
      {
        label: 'Pass (none)',
        stroke: '#22c55e',
        fill: '#22c55e26',
        width: 2,
      },
      {
        label: 'Quarantine',
        stroke: '#f59e0b',
        fill: '#f59e0b26',
        width: 2,
      },
      {
        label: 'Reject',
        stroke: '#ef4444',
        fill: '#ef444426',
        width: 2,
      },
    ],
    axes: [
      { stroke: 'var(--color-muted-foreground)' },
      {
        label: 'Messages',
        stroke: 'var(--color-muted-foreground)',
        grid: { stroke: 'var(--color-border)', width: 1 },
        ticks: { stroke: 'var(--color-border)' },
      },
    ],
    scales: { x: { time: true } },
    cursor: {
      drag: { x: true, y: false },
    },
    legend: {
      show: true,
    },
    plugins: [],
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
  chart = new uPlot(buildOpts(width), buildData(), containerRef.value)
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
  () => [props.timestamps, props.none, props.quarantine, props.reject, props.height],
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
    aria-label="Message volume over time, stacked by DMARC disposition"
  />
</template>
