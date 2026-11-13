# Project Arrow - Policy & Research web app

React + Vite + TypeScript frontend for **Akarsha's R5 Policy Analyst + R6 Researcher**
modules: national dashboard, GIS emissions map and the 2030 pathway sandbox.

See [`../README.md`](../README.md) for the full local setup (API + frontend + tests).

```powershell
npm install
npm run dev      # http://localhost:5173/policy
npm run build    # type-checks with tsc -b, then bundles
```

The app talks to the FastAPI service through the `/api` proxy configured in
`vite.config.ts`, so the API must be running on port 8000.
