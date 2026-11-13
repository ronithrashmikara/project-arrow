# Running the Project Arrow policy module locally

This folder holds **Akarsha's R5 Policy Analyst + R6 Researcher** work only.
It is self-contained so you can develop without touching teammates' branches.

```text
apps/
  web/   React + Vite + TypeScript dashboard (Tailwind v4, Recharts, Leaflet)
  api/   FastAPI service exposing aggregated policy endpoints
```

## 1. Prerequisites

| Tool | Version | You have |
|---|---|---|
| Node.js | >= 20 | v24.18.0 ✓ |
| npm | >= 10 | 11.13.0 ✓ |
| Python | >= 3.11 | 3.14.2 ✓ |

No database is required for local development — the API reads a deterministic
seed file so the dashboard works offline. Supabase/Postgres becomes the source
later by swapping the repository implementation (`app/policy/repository.py`).

## 2. Backend (FastAPI)

```powershell
cd apps\api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# regenerate the demo dataset (only needed if you change the generator)
python app\policy\seed\generate.py

# start the API
uvicorn app.main:app --reload --port 8000
```

- API docs: <http://localhost:8000/docs>
- Health check: <http://localhost:8000/health>

## 3. Frontend (React dashboard)

```powershell
cd apps\web
npm install
npm run dev
```

- Dashboard: <http://localhost:5173/policy>
- GIS map: <http://localhost:5173/policy/gis>
- 2030 pathway: <http://localhost:5173/policy/pathway>

> **Vite 7 is pinned on purpose.** Vite 8 uses the native `rolldown` binding, which fails on this
> machine with `rolldown-binding.win32-x64-msvc.node is not a valid Win32 application`.
> `npm rebuild` does not fix it, so the app is pinned to Vite 7 (Rollup-based).
> If the team standardises on Vite 8 later, it needs a different Windows toolchain.
> Note: `origin/nadeera`'s `frontend/package.json` also pins `vite ^8.3.6`, so it will hit this.

Vite proxies `/api/*` to `http://127.0.0.1:8000` (see `vite.config.ts`), so start
the API **before** opening the dashboard or the charts will stay empty.

## 3b. Tests

```powershell
cd apps\api
.\.venv\Scripts\Activate.ps1
pytest -q          # 10 tests covering the aggregation and privacy rules
```

```powershell
cd apps\web
npm run build      # runs `tsc -b` first, so type errors fail the build
```


## 4. Endpoints exposed by the API

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Service + dataset status |
| GET | `/policy/periods` | Available reporting years (April → March) |
| GET | `/policy/summary?year=2025/26` | National headline KPIs |
| GET | `/policy/by-district?year=` | Aggregates per district |
| GET | `/policy/by-segment?year=` | Aggregates per property segment |
| GET | `/policy/by-size-band?year=` | Aggregates per size band |
| GET | `/policy/trends?year=` | Month-by-month national trend |
| GET | `/policy/gis?year=` | Choropleth payload (suppressed cells zeroed) |
| GET | `/policy/pathway?year=&scope1_reduction_pct=…` | 2030 pathway scenario |

## 5. Privacy rules baked into the API

- Only `verified` submissions feed the national figures.
- Any group with **fewer than 5 contributing properties** is flagged
  `suppressed: true`; totals are withheld in the API response and the UI shows
  "Suppressed" / "insufficient data" instead of a number.
- `/policy/gis` additionally zeroes totals for suppressed districts so the map
  cannot leak a value through its tooltip.
- Property names and guest-level records are never returned by these endpoints.

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| Dashboard shows "Could not load data" | API is not running. Check <http://localhost:8000/health>. |
| `API status: degraded` / seed missing | Run `python app\policy\seed\generate.py` in `apps\api`. |
| Port 8000 already in use | `uvicorn app.main:app --reload --port 8001` and update the proxy target in `apps\web\vite.config.ts`. |
| Port 5173 already in use | Vite will offer the next free port automatically. |
| `ExecutionPolicy` blocks the venv | `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` |
| Map tiles are grey | OpenStreetMap tiles need internet access. |
| `npm run build` fails on types | `npm run build` runs `tsc -b` first; fix the reported errors. |

## 7. Next pieces in this module

1. Consent ledger + consent-gated research datasets (R6).
2. Research access requests, data-use agreements and dataset releases (R6).
3. Policy report builder (PDF export from the dashboard).
4. Voice assistant service (LLM + Whisper with scoped read-only tools).
5. Swap the seed repository for Supabase with RLS enforced per role.
