# Ronith's Project Arrow work

## Your assignment

The current root README is the authoritative six-role proposal scope. It assigns **R2 Owner / GM** and the **Predict forecasting service** to Ronith Rashmikara, together with the backend gateway, job queue and MLOps. Earlier `docs/PLAN.md` uses obsolete role numbering, so do not treat its R1 label as current.

Your feature responsibilities are:

1. Owner command centre: own-property emissions by scope, monthly trends and kg CO2e per guest night.
2. Occupancy/seasonality forecasting, with LightGBM evaluated against a seasonal-naive baseline.
3. What-if reduction scenarios, savings and simple payback.
4. Annual carbon budgets and targets.
5. Monthly owner sign-off with audit history.
6. Annual GHG inventory reports and guest carbon receipts.
7. Backend integration gateway, asynchronous jobs, model evaluation and operations.

## What this folder is

A local first implementation on your `ronith` Git branch, independent of teammates' feature branches. No changes are pushed automatically. `apps/owner-api` holds the FastAPI backend and SQLite persistence. `apps/owner-web` holds the React/TypeScript owner dashboard. The source repository's proposal remains unchanged.

This is an explicitly labelled **single-property local demo**, not a production system, certified carbon inventory or completed team integration. It uses generated hotel activity records, not private client data. Demo sign-off names are not authenticated identities. Forecast bands are indicative rather than calibrated statistical guarantees. Guest allocations are estimates, not verifier-certified receipts.

## Run on Windows

From this folder:

```cmd
setup-owner.cmd
start-owner.cmd
```

Open `http://127.0.0.1:5180` in a browser. API documentation is at `http://127.0.0.1:8010/docs`.

Setup needs Python 3.11+ and Node.js 20.19+ or 22.12+. It installs into project `.venv` and app `node_modules`. No Supabase account, cloud credentials or PostgreSQL server is required for this local slice. The launch script binds both services to loopback only. Close both launched terminal windows to stop them. Ports 8010/5180 are intentionally separate from teammates' 8000/5173 defaults.

Local demo writes are stored under `runtime/owner.sqlite3` when launched with `start-owner.cmd`. The database and virtual environments are ignored by Git. Do not put real customer data in this unauthenticated demo.

## Validate the real application

Run API regression tests from `apps/owner-api` with the project's `.venv` Python and `-m pytest -q`. Run `npm run build` in `apps/owner-web` for the production TypeScript/Vite build.

With both services running, run:

```cmd
.venv\Scripts\python.exe tools\check_owner.py
```

This check uses the actual browser-facing Vite `/api` proxy and public backend endpoints. It deliberately changes LOCAL DEMO state: a budget is restored afterward, one month is signed off, one receipt is created and a training job is submitted. Do not use it against real data. See `VALIDATION-OWNER.md` for the observed results of coordinator checks once completed.

## What you still need to finish with the team

- Agree on one gateway and canonical REST contracts with Nadeera and Sithum. Replace this SQLite demo repository with the shared PostgreSQL schema and versioned GHG results. Never use model predictions in place of historical carbon-accounting figures.
- Integrate Supabase authentication, verified Owner role, property-level isolation/RLS, server-derived identity and authorization on every endpoint before any real data or deployment.
- Connect monthly submissions from Sithum and evidence/verification state from Savinthi. Owner approval is not independent verification.
- Obtain enough real historical occupancy/activity data, use chronological holdout evaluation and demonstrate model improvement over the seasonal baseline. Demo-data evaluation does not satisfy this acceptance criterion.
- Turn the local training job mechanism into a durable worker/queue, add retries, crash recovery, scheduling, observability, model version artifacts and production deployment controls.
- Agree on client-approved factors and report wording with Nadeera/client. Reports generated from seeded totals are demonstrations, not validated accounting outputs.
- Connect guest receipts to Savinthi's real public QR proof service. Do not imply a hash or QR proves truthfulness.
- Add private benchmark rank, savings-library recommendations, full target pathways, trilingual content, accessibility checks, performance/load tests and hotel-pilot usability validation.
- Exercise full cross-role end-to-end flows and security/privacy tests before pilot use. No cross-branch merge or production readiness is claimed here.
