# Arrow owner command centre

Standalone React 18 + TypeScript + Vite 6 app. No UI or chart library, no copied application code, and no mock API fallback.

## Run

```cmd
cd apps\owner-web
npm install
npm run dev
npm run build
```

The dev server binds strictly to `127.0.0.1:5180`. `/api` proxies to `http://127.0.0.1:8010`, with the `/api` prefix removed. Production hosting must supply the same reverse proxy.

## Interaction checks

- Overview loads real hotel, totals, monthly scopes and budget from the 2026 overview API.
- Forecast labels predictions and uncertainty explicitly. Evaluation metrics retain the API's numeric scale rather than guessing whether MAPE is fractional. Seasonal / occupancy baseline, not LightGBM.
- What-if inputs have percent bounds and nonnegative LKR controls. Submit calls the scenario endpoint and displays only the returned result.
- Budget saves through PUT. Sign-off requires month, nonblank local demo signer and explicit acknowledgement. It is not authentication.
- Report and CSV anchors download directly from the backend. Guest receipt uses integer guest-nights and a 2026 reporting period.
- Retrain submits a job. Refresh jobs and audit trail fetch real lists. Additional fields are rendered defensively as text.
- All fetch requests have loading/error feedback and retry controls. No fabricated successful response is substituted on connection failure.

Stable acceptance selectors: `#scenario-form`, `#electricity_reduction_pct`, `#fuel_reduction_pct`, `#scope3_reduction_pct`, `#investment_lkr`, `#annual_savings_lkr`, `[data-testid="scenario-result"]`, `#annual-budget`, `#signoff-month`, `#signer-name`, `#signoff-ack`, `#retrain`, `#download-report`, `#download-csv`, `#receipt-form`, `#guest-nights`, `#receipt-period`, `[data-testid="guest-receipt"]`.

## Validation (2026-11-13)

- `npm install --no-audit --no-fund` succeeded and generated package-lock.json.
- `npm run build` passed strict TypeScript and Vite production compilation.
- Real Chrome rendered the dashboard at port 5180. Navigation and scenario controls render. A real scenario POST against the unavailable backend displayed HTTP 500 and Try again, with no success/result fabricated.
- Full successful API workflow validation is pending backend startup at port 8010. No mocked response was used to claim end-to-end success.
