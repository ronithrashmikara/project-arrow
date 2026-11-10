import { useEffect, useState } from 'react'

function App() {
  const [backendStatus, setBackendStatus] = useState('Checking...')
  const [databaseStatus, setDatabaseStatus] = useState('Checking...')

  useEffect(() => {
    fetch('http://127.0.0.1:8000/health')
      .then((response) => {
        if (!response.ok) {
          throw new Error('Backend request failed')
        }

        return response.json()
      })
      .then((data) => {
        setBackendStatus(data.status)
        setDatabaseStatus(data.database)
      })
      .catch(() => {
        setBackendStatus('down')
        setDatabaseStatus('unknown')
      })
  }, [])

  return (
    <div className="min-h-screen bg-[#040A05] text-[#F8F9FB]">

      <header className="border-b border-[#255454] bg-[#031912]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">

          <div>
            <h1 className="text-2xl font-semibold text-[#6CE9B4]">
              Project Arrow
            </h1>

            <p className="text-sm text-[#C4DDD1]">
              Carbon Intelligence Platform
            </p>
          </div>

          <div className="rounded-full border border-[#2BE38B] px-4 py-2 text-sm text-[#2BE38B]">
            Admin Portal
          </div>

        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-12">

        <h2 className="mb-8 text-3xl font-bold">
          System Status
        </h2>

        <div className="grid gap-6 md:grid-cols-2">

          <div className="rounded-2xl border border-[#255454] bg-[#0C2B25] p-6">

            <p className="text-sm text-[#C4DDD1]">
              Backend API
            </p>

            <h3 className="mt-3 text-2xl font-semibold text-[#6CE9B4]">
              {backendStatus}
            </h3>

            <p className="mt-2 text-sm text-[#487674]">
              FastAPI connection status
            </p>

          </div>

          <div className="rounded-2xl border border-[#255454] bg-[#0C2B25] p-6">

            <p className="text-sm text-[#C4DDD1]">
              Database
            </p>

            <h3 className="mt-3 text-2xl font-semibold text-[#6CE9B4]">
              {databaseStatus}
            </h3>

            <p className="mt-2 text-sm text-[#487674]">
              PostgreSQL connection status
            </p>

          </div>

        </div>

      </main>

    </div>
  )
}

export default App