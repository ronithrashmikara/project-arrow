import { useEffect, useMemo, useState } from 'react'
import type { DistrictHeatStat } from '../../../lib/api'

/*
  Sri Lanka district choropleth.

  Boundaries come from the vendored geoBoundaries ADM2 release
  (public/geo/sri-lanka-districts.geojson, Open Data Commons Open Database
  Licence). Rendering is plain SVG with a simple equirectangular projection
  scaled to the country bounding box, so no tile server or API key is needed.

  Sequential ramp (low -> high kg CO2e / guest night):
    #0C2B25 -> #123C3A -> #255454 -> #487674 -> #3DCF8E -> #6CE9B4
*/

const RAMP = ['#0C2B25', '#123C3A', '#255454', '#487674', '#3DCF8E', '#6CE9B4']

const GEOJSON_URL = '/geo/sri-lanka-districts.geojson'

type Feature = {
  properties: { shapeName: string }
  geometry: { type: string; coordinates: number[][][] | number[][][][] }
}

type DistrictFeature = {
  name: string
  path: string
  centroid: [number, number]
}

export function rampColour(value: number, min: number, max: number): string {
  if (max <= min) return RAMP[0]
  const ratio = Math.min(1, Math.max(0, (value - min) / (max - min)))
  const index = Math.min(RAMP.length - 1, Math.floor(ratio * (RAMP.length - 1) + 0.5))
  return RAMP[index]
}

function normaliseDistrictName(raw: string): string {
  return raw.replace(/\s*District$/i, '').trim()
}

/** Equirectangular projection with a latitude correction, scaled to the bbox. */
function buildProjection(features: Feature[]) {
  let minLon = Infinity
  let maxLon = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity

  const eachRing = (feature: Feature, callback: (ring: number[][]) => void) => {
    const geometry = feature.geometry
    if (geometry.type === 'Polygon') {
      ;(geometry.coordinates as number[][][]).forEach(callback)
    } else if (geometry.type === 'MultiPolygon') {
      ;(geometry.coordinates as number[][][][]).forEach((polygon) => polygon.forEach(callback))
    }
  }

  features.forEach((feature) => {
    eachRing(feature, (ring) => {
      ring.forEach(([lon, lat]) => {
        if (lon < minLon) minLon = lon
        if (lon > maxLon) maxLon = lon
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
      })
    })
  })

  const lat0 = (minLat + maxLat) / 2
  const kx = Math.cos((lat0 * Math.PI) / 180)

  const width = 900
  const height = 620
  const padding = 24

  const projectedWidth = (maxLon - minLon) * kx
  const projectedHeight = maxLat - minLat
  const scale = Math.min(
    (width - padding * 2) / projectedWidth,
    (height - padding * 2) / projectedHeight,
  )

  const offsetX = (width - projectedWidth * scale) / 2
  const offsetY = (height - projectedHeight * scale) / 2

  const project = (lon: number, lat: number): [number, number] => [
    offsetX + (lon - minLon) * kx * scale,
    offsetY + (maxLat - lat) * scale,
  ]

  const districts: DistrictFeature[] = features.map((feature) => {
    const parts: string[] = []
    const centroid: [number, number] = [0, 0]
    let pointCount = 0

    eachRing(feature, (ring) => {
      const path = ring
        .map(([lon, lat], index) => {
          const [x, y] = project(lon, lat)
          centroid[0] += x
          centroid[1] += y
          pointCount += 1
          return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
        })
        .join(' ')
      parts.push(`${path} Z`)
    })

    return {
      name: normaliseDistrictName(feature.properties.shapeName),
      path: parts.join(' '),
      centroid: [centroid[0] / Math.max(1, pointCount), centroid[1] / Math.max(1, pointCount)],
    }
  })

  return { districts, width, height }
}

export default function HeatMap({
  districts,
  metric = 'median_intensity',
}: {
  districts: DistrictHeatStat[]
  metric?: 'median_intensity' | 'total_kg' | 'kg_per_guest_night'
}) {
  const [features, setFeatures] = useState<Feature[]>([])
  const [hovered, setHovered] = useState<DistrictHeatStat | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(GEOJSON_URL)
      .then((response) => response.json())
      .then((geojson: { features: Feature[] }) => {
        if (!cancelled) setFeatures(geojson.features)
      })
      .catch(() => setFeatures([]))
    return () => {
      cancelled = true
    }
  }, [])

  const { districts: shapes, width, height } = useMemo(
    () => buildProjection(features),
    [features],
  )

  const { min, max } = useMemo(() => {
    const values = districts
      .filter((district) => !district.suppressed)
      .map((district) => district[metric])
    if (!values.length) return { min: 0, max: 1 }
    return { min: Math.min(...values), max: Math.max(...values) }
  }, [districts, metric])

  const byName = useMemo(() => {
    const map = new Map<string, DistrictHeatStat>()
    for (const district of districts) map.set(district.district, district)
    return map
  }, [districts])

  const metricLabel =
    metric === 'total_kg'
      ? 'kg CO₂e'
      : metric === 'kg_per_guest_night'
        ? 'kg CO₂e / guest night'
        : 'median kg CO₂e / guest night'

  return (
    <div className="relative h-full w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full"
        role="img"
        aria-label={`Choropleth of ${metricLabel} by Sri Lanka district. ${
          districts.filter((district) => !district.suppressed).length
        } districts published, ${districts.filter((district) => district.suppressed).length} suppressed.`}
      >
        <defs>
          <pattern id="hatch" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="8" height="8" fill="#0C2B25" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(72,118,116,0.45)" strokeWidth="3" />
          </pattern>
          <filter id="selectedGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {shapes.map((shape) => {
          const data = byName.get(shape.name)
          const suppressed = !data || data.suppressed
          const value = data ? data[metric] : 0
          const isHovered = hovered?.district === shape.name

          return (
            <path
              key={shape.name}
              d={shape.path}
              tabIndex={0}
              role="listitem"
              aria-label={
                data
                  ? `${shape.name}: ${suppressed ? 'suppressed, fewer than 5 properties' : `${value} ${metricLabel}`}`
                  : `${shape.name}: no data`
              }
              onMouseEnter={() => setHovered(data ?? null)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(data ?? null)}
              onBlur={() => setHovered(null)}
              fill={suppressed ? 'url(#hatch)' : rampColour(value, min, max)}
              stroke={isHovered ? '#6CE9B4' : '#2BE38B'}
              strokeWidth={isHovered ? 1.5 : 0.6}
              strokeOpacity={isHovered ? 1 : 0.35}
              filter={isHovered ? 'url(#selectedGlow)' : undefined}
              style={{ cursor: 'pointer', outline: 'none' }}
              className="transition-[stroke-width] duration-150"
            />
          )
        })}
      </svg>

      {/* Legend - bottom left inside the card */}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-[10px] border border-atmospheric-teal bg-deep-forest/85 px-3 py-2 backdrop-blur-md">
        <p className="text-[11px] text-soft-sea-glass">
          low → high {metricLabel}
        </p>
        <div className="mt-1.5 flex h-2 w-44 overflow-hidden rounded-full">
          {RAMP.map((colour) => (
            <span key={colour} className="flex-1" style={{ background: colour }} />
          ))}
        </div>
        <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-warm-copper">
          <span aria-hidden="true">▨</span> suppressed (k &lt; 5)
        </p>
      </div>

      {/* Hover readout */}
      {hovered ? (
        <div className="pointer-events-none absolute top-3 right-3 max-w-[220px] rounded-[10px] border border-mountain-teal bg-deep-forest/95 px-3 py-2 text-[11px] backdrop-blur-md">
          <p className="font-semibold text-paper">{hovered.district}</p>
          <p className="mt-1 text-soft-sea-glass">
            {hovered.suppressed ? (
              <span className="text-warm-copper">Suppressed (k &lt; 5)</span>
            ) : (
              <>
                <span className="block">
                  Median intensity: {hovered.median_intensity} kg CO₂e / GN
                </span>
                <span className="block">Properties: {hovered.property_count}</span>
                <span className="block">Total: {hovered.total_kg.toLocaleString()} kg CO₂e</span>
              </>
            )}
          </p>
        </div>
      ) : null}
    </div>
  )
}
