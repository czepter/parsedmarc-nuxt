<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { geoNaturalEarth1, geoPath } from 'd3-geo'
import * as topojson from 'topojson-client'
import type { Topology } from 'topojson-specification'

const props = defineProps<{
  countries: Array<{ name: string | null; count: number; share: number }>
  loading?: boolean
}>()

// ISO_TO_COUNTRY_NAME is auto-imported from app/utils/countryNames.ts

interface PathFeature {
  id: string
  name: string
  path: string
  count: number
}

const containerRef = ref<HTMLDivElement | null>(null)
const width = ref(600)
const height = computed(() => Math.round(width.value * 0.5))
const features = ref<PathFeature[]>([])
const isDark = ref(false)

interface HoverCountry {
  name: string
  count: number
}
const hoverCountry = ref<HoverCountry | null>(null)

// Build a lookup map from world-atlas name → count
const countData = computed(() => {
  const map = new Map<string, number>()
  for (const c of props.countries) {
    if (!c.name) continue
    const atlasName = ISO_TO_COUNTRY_NAME[c.name] ?? c.name
    map.set(atlasName, c.count)
  }
  return map
})

const maxCount = computed(() => {
  let max = 0
  for (const c of props.countries) {
    if (c.count > max) max = c.count
  }
  return max
})

function colorForCount(count: number): string {
  if (count === 0 || maxCount.value === 0) {
    return isDark.value ? 'oklch(0.28 0.01 250)' : 'oklch(0.92 0.01 250)'
  }
  const t = count / maxCount.value
  if (isDark.value) {
    const l = 0.75 - t * 0.45
    const c = t * 0.18
    return `oklch(${l.toFixed(3)} ${c.toFixed(3)} 250)`
  }
  const l = 0.92 - t * 0.45
  const c = t * 0.15
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} 250)`
}

function hoverFill(count: number): string {
  // Slightly darken/lighten on hover
  if (count === 0 || maxCount.value === 0) {
    return isDark.value ? 'oklch(0.35 0.02 250)' : 'oklch(0.85 0.02 250)'
  }
  const t = count / maxCount.value
  if (isDark.value) {
    const l = Math.max(0.1, 0.75 - t * 0.45 - 0.08)
    const c = t * 0.18
    return `oklch(${l.toFixed(3)} ${c.toFixed(3)} 250)`
  }
  const l = Math.max(0.1, 0.92 - t * 0.45 - 0.08)
  const c = t * 0.15
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} 250)`
}

let ro: ResizeObserver | null = null

async function buildMap() {
  if (!import.meta.client) return
  if (!containerRef.value) return

  const w = containerRef.value.clientWidth || 600
  width.value = w

  isDark.value = document.documentElement.classList.contains('dark')

  const world = (await import('world-atlas/countries-110m.json')) as unknown as Topology

  const projection = geoNaturalEarth1()
    .scale(w / 6.3)
    .translate([w / 2, (w * 0.5) / 2])

  const pathGen = geoPath(projection)

  const geoFeatures = (topojson.feature(world, (world as any).objects.countries) as any).features

  const data = countData.value

  features.value = geoFeatures
    .map((f: any) => {
      const name: string = f.properties?.name ?? ''
      const count = data.get(name) ?? 0
      const path = pathGen(f) ?? ''
      return { id: String(f.id), name, path, count } as PathFeature
    })
    .filter((f: PathFeature) => f.path)
}

onMounted(async () => {
  await buildMap()

  if (containerRef.value) {
    ro = new ResizeObserver(async (entries) => {
      const newW = Math.round(entries[0]?.contentRect.width ?? 600)
      if (Math.abs(newW - width.value) > 4) {
        width.value = newW
        await buildMap()
      }
    })
    ro.observe(containerRef.value)
  }
})

onUnmounted(() => {
  if (ro) {
    ro.disconnect()
    ro = null
  }
})

watch(() => props.countries, async () => {
  await buildMap()
}, { deep: false })

const tooltipText = computed(() => {
  if (!hoverCountry.value) return ''
  return `${hoverCountry.value.name}: ${hoverCountry.value.count.toLocaleString()} messages`
})
</script>

<template>
  <div
    ref="containerRef"
    class="w-full"
    role="img"
    aria-label="Geographic distribution of messages by country"
  >
    <Skeleton v-if="loading" class="w-full rounded-md" :style="{ height: `${height}px` }" />

    <TooltipProvider v-else-if="features.length > 0" :delay-duration="0">
      <Tooltip :open="!!hoverCountry">
        <TooltipTrigger as-child>
          <svg
            :width="width"
            :height="height"
            :viewBox="`0 0 ${width} ${height}`"
            class="w-full"
            @mouseleave="hoverCountry = null"
          >
            <path
              v-for="f in features"
              :key="f.id"
              :d="f.path"
              :fill="hoverCountry?.name === f.name ? hoverFill(f.count) : colorForCount(f.count)"
              stroke="oklch(0.8 0 0)"
              stroke-width="0.5"
              style="cursor: default"
              @mouseenter="hoverCountry = { name: f.name, count: f.count }"
            />
          </svg>
        </TooltipTrigger>
        <TooltipContent side="top">
          {{ tooltipText }}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>

    <div
      v-else-if="!loading"
      :style="{ height: `${height}px` }"
      class="text-muted-foreground flex items-center justify-center text-sm"
    >
      Loading map…
    </div>
  </div>
</template>
