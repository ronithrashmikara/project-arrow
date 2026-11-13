import type { CategoryStat } from '../../../lib/api'

/*
  Box plot drawn as plain SVG.
  Colours follow the spec:
    box fill   rgba(43,227,139,0.18)
    box stroke #3DCF8E
    median     #6CE9B4 2px
    whiskers   #487674
    mean       #BE8144
    outliers   #F1C087
*/

const WIDTH = 640
const HEIGHT = 300
const PADDING = { top: 16, right: 16, bottom: 56, left: 52 }

export default function BoxPlot({
  data,
  height = HEIGHT,
}: {
  data: CategoryStat[]
  height?: number
}) {
  const published = data.filter((item) => !item.suppressed && item.values?.length)
  if (!published.length) {
    return (
      <p className="flex h-full items-center justify-center text-sm text-soft-sea-glass">
        No category met the k ≥ 5 publication threshold.
      </p>
    )
  }

  const allValues = published.flatMap((item) => item.values)
  const lo = Math.min(...allValues)
  const hi = Math.max(...allValues)
  const span = hi - lo || 1

  const toY = (value: number) =>
    PADDING.top + (1 - (value - lo) / span) * (height - PADDING.top - PADDING.bottom)

  const columnWidth = (WIDTH - PADDING.left - PADDING.right) / published.length
  const boxWidth = Math.min(56, columnWidth * 0.5)

  const ticks = [lo, lo + span / 2, hi]

  return (
    <figure>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="w-full"
        role="img"
        aria-label={`Distribution of emissions intensity by SLTDA category, median ${published
          .map((item) => `${item.category} ${item.median}`)
          .join(', ')} kg CO2e per guest night`}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={toY(tick)}
              y2={toY(tick)}
              stroke="rgba(37,84,84,0.35)"
            />
            <text
              x={PADDING.left - 8}
              y={toY(tick) + 4}
              textAnchor="end"
              fontSize={11}
              fill="#C4DDD1"
            >
              {tick.toFixed(1)}
            </text>
          </g>
        ))}

        {published.map((item, index) => {
          const centre = PADDING.left + columnWidth * index + columnWidth / 2
          const boxTop = toY(item.q3 as number)
          const boxBottom = toY(item.q1 as number)
          const medianY = toY(item.median as number)
          const meanY = toY(item.mean as number)

          return (
            <g key={item.category}>
              {/* whiskers */}
              <line
                x1={centre}
                x2={centre}
                y1={toY(item.upper_whisker as number)}
                y2={boxTop}
                stroke="#487674"
                strokeWidth={1.5}
              />
              <line
                x1={centre}
                x2={centre}
                y1={boxBottom}
                y2={toY(item.lower_whisker as number)}
                stroke="#487674"
                strokeWidth={1.5}
              />
              <line
                x1={centre - 10}
                x2={centre + 10}
                y1={toY(item.upper_whisker as number)}
                y2={toY(item.upper_whisker as number)}
                stroke="#487674"
                strokeWidth={1.5}
              />
              <line
                x1={centre - 10}
                x2={centre + 10}
                y1={toY(item.lower_whisker as number)}
                y2={toY(item.lower_whisker as number)}
                stroke="#487674"
                strokeWidth={1.5}
              />

              {/* box */}
              <rect
                x={centre - boxWidth / 2}
                y={boxTop}
                width={boxWidth}
                height={Math.max(2, boxBottom - boxTop)}
                fill="rgba(43,227,139,0.18)"
                stroke="#3DCF8E"
                strokeWidth={1.5}
                rx={4}
              />

              {/* median */}
              <line
                x1={centre - boxWidth / 2}
                x2={centre + boxWidth / 2}
                y1={medianY}
                y2={medianY}
                stroke="#6CE9B4"
                strokeWidth={2}
              />

              {/* mean marker */}
              <circle cx={centre} cy={meanY} r={4} fill="#BE8144" />

              {/* outliers */}
              {(item.outliers ?? []).map((outlier, outlierIndex) => (
                <circle
                  key={`${item.category}-${outlierIndex}`}
                  cx={centre}
                  cy={toY(outlier)}
                  r={3}
                  fill="#F1C087"
                />
              ))}

              <text
                x={centre}
                y={height - PADDING.bottom + 18}
                textAnchor="middle"
                fontSize={11}
                fill="#C4DDD1"
              >
                {item.category.length > 16 ? `${item.category.slice(0, 15)}…` : item.category}
              </text>
              <text
                x={centre}
                y={height - PADDING.bottom + 34}
                textAnchor="middle"
                fontSize={10}
                fill="#487674"
              >
                n = {item.property_count}
              </text>
            </g>
          )
        })}
      </svg>

      <figcaption className="mt-2 flex flex-wrap items-center gap-4 px-1 text-[11px] text-soft-sea-glass">
        <Legend colour="#6CE9B4" label="Median" />
        <Legend colour="#BE8144" label="Mean" />
        <Legend colour="#487674" label="Whiskers (1.5 × IQR)" />
        <Legend colour="#F1C087" label="Outlier" />
        <span className="text-misty-blue-teal">kg CO₂e per guest night</span>
      </figcaption>
    </figure>
  )
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: colour }} />
      {label}
    </span>
  )
}
