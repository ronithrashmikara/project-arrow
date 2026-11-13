import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Seasonality } from '../../../lib/api'

/*
  Peak vs off-season series.
    peak     #F1C087 with rgba(241,192,135,0.12) area fill
    off-peak #6CE9B4 with rgba(108,233,180,0.12) area fill

  Both series are intensities (kg CO2e per guest night) so they share one
  axis. The absolute monthly total is deliberately not plotted here - it is
  three orders of magnitude larger and would flatten both lines.
*/

export default function SeasonalityChart({
  data,
  height = 240,
}: {
  data: Seasonality
  height?: number
}) {
  const points = data.points.map((point) => ({
    label: point.label,
    peak: point.season === 'peak' ? point.kg_per_guest_night : null,
    offPeak: point.season === 'off-peak' ? point.kg_per_guest_night : null,
    guestNights: point.guest_nights,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
        <defs>
          <linearGradient id="peakFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(241,192,135,0.12)" />
            <stop offset="100%" stopColor="rgba(241,192,135,0)" />
          </linearGradient>
          <linearGradient id="offPeakFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(108,233,180,0.12)" />
            <stop offset="100%" stopColor="rgba(108,233,180,0)" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(37,84,84,0.35)" />
        <XAxis dataKey="label" tick={{ fill: '#C4DDD1', fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis
          tick={{ fill: '#C4DDD1', fontSize: 11 }}
          domain={['dataMin - 0.5', 'dataMax + 0.5']}
          unit=" kg"
        />
        <Tooltip
          contentStyle={{
            background: 'rgba(18,60,58,0.92)',
            border: '1px solid #255454',
            borderRadius: 10,
            color: '#F8F9FB',
          }}
          formatter={(value, name) => [`${value} kg CO₂e / guest night`, String(name)]}
        />
        <Legend />
        <Area
          type="monotone"
          dataKey="peak"
          name="Peak"
          stroke="#F1C087"
          strokeWidth={2}
          fill="url(#peakFill)"
          connectNulls
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="offPeak"
          name="Off-peak"
          stroke="#6CE9B4"
          strokeWidth={2}
          fill="url(#offPeakFill)"
          connectNulls
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
