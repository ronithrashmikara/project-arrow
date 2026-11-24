import { useEffect, useState } from 'react'
import { policyApi } from '../lib/api'

// One job: load the reporting years and remember the selected one.
export function useReportingYears() {
  const [years, setYears] = useState<string[]>([])
  const [year, setYear] = useState('')
  const [error, setError] = useState<string | null>(null)

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

  return { years, year, setYear, error }
}