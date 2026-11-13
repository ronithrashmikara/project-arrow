import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { ErrorBox, Panel, Spinner, YearSelect } from '../../components/ui'
import { policyApi, type DistrictStat } from '../../lib/api'

const SRI_LANKA_CENTRE: [number, number] = [7.8731, 80.7717]

export default function GisPage() {
  const [years, setYears] = useState<string[]>([])
  const [year, setYear] = useState('')
  const [districts, setDistricts] = useState<DistrictStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metric, setMetric] = useState<'total_kg' | 'kg_per_guest_night'>('total_kg')

  useEffect(() => {
    policyApi
      .periods()
      .then((data) => {
        setYears(data.reporting_years)
        const latest = data.reporting_years.at(-1)
        if (latest) setYear(latest)
      })
      .catch((err: Error) => setError(err.message))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    policyApi
      .gis(year || undefined)
      .then((data) => {
        if (!cancelled) setDistricts(data)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [year])

  const { min, max } = useMemo(() => {
    const values = districts
      .filter((district) => !district.suppressed)
      .map((district) => district[metric])
    if (!values.length) return { min: 0, max: 1 }
    return { min: Math.min(...values), max: Math.max(...values) }
  }, [districts, metric])

  const colourFor = (value: number) => {
    if (max === min) return '#15803d'
    const ratio = (value - min) / (max - min)
    // Light green -> dark green ramp.
    const light = 220 - ratio * 150
    return `hsl(142, ${55 + ratio * 25}%, ${light * 0.55 + 12}%)`
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">GIS emissions map</h2>
          <p className="text-sm text-ink-500">
            District-level aggregates. Districts with fewer than 5 properties are suppressed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="metric" className="text-sm font-medium text-ink-700">
              Metric
            </label>
            <select
              id="metric"
              value={metric}
              onChange={(event) => setMetric(event.target.value as typeof metric)}
              className="min-h-11 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            >
              <option value="total_kg">Total kg CO₂e</option>
              <option value="kg_per_guest_night">kg CO₂e / guest night</option>
            </select>
          </div>
          <YearSelect value={year} years={years} onChange={setYear} />
        </div>
      </div>

      {error ? <ErrorBox message={error} /> : null}

      <Panel
        title="District choropleth"
        description="Bubble size and colour follow the selected metric. Approximate district centroids."
      >
        {loading ? (
          <Spinner label="Loading map data" />
        ) : (
          <div className="h-[560px] w-full overflow-hidden rounded-lg border border-line">
            <MapContainer
              center={SRI_LANKA_CENTRE}
              zoom={7}
              scrollWheelZoom
              className="h-full w-full"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {districts
                .filter((district) => district.lat !== null && district.lng !== null)
                .map((district) => {
                  const value = district[metric]
                  const radius = district.suppressed
                    ? 8
                    : 10 + (max === min ? 0 : ((value - min) / (max - min)) * 26)
                  return (
                    <CircleMarker
                      key={district.district}
                      center={[district.lat as number, district.lng as number]}
                      radius={radius}
                      pathOptions={{
                        color: district.suppressed ? '#94a3b8' : colourFor(value),
                        fillColor: district.suppressed ? '#cbd5e1' : colourFor(value),
                        fillOpacity: 0.7,
                        weight: 1.5,
                      }}
                    >
                      <Tooltip>
                        <strong>{district.district}</strong>
                        <br />
                        {district.suppressed
                          ? 'Suppressed - fewer than 5 properties'
                          : `${value.toLocaleString()} ${metric === 'total_kg' ? 'kg CO₂e' : 'kg CO₂e / guest night'}`}
                      </Tooltip>
                      <Popup>
                        <strong>{district.district}</strong>
                        <br />
                        Province: {district.province}
                        <br />
                        Properties: {district.suppressed ? '—' : district.property_count}
                        <br />
                        Total: {district.suppressed ? 'Suppressed' : `${district.total_kg.toLocaleString()} kg CO₂e`}
                        <br />
                        Intensity:{' '}
                        {district.suppressed
                          ? 'Suppressed'
                          : `${district.kg_per_guest_night.toFixed(2)} kg / guest night`}
                      </Popup>
                    </CircleMarker>
                  )
                })}
            </MapContainer>
          </div>
        )}
      </Panel>
    </div>
  )
}
