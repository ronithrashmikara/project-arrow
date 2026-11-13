# Project Arrow Owner / GM API

Local synthetic demo, not a production security or carbon verification system. One hotel with 24 deterministic monthly records, January 2025 through December 2026. Seed is explicit in `main.py` and idempotent. Future 2026 months are synthetic, not claims of observed data. No credentials, cloud APIs or external services.

## Run (Windows, from repository root)

```cmd
call setup-owner.cmd
call start-owner.cmd
.venv\Scripts\python.exe -m pytest apps/owner-api/test_owner_api.py -q
```

`ARROW_DB_PATH` overrides the SQLite file. Default is `%USERPROFILE%/.project-arrow/owner-demo.sqlite3`, outside tracked sources. Tests create isolated temporary databases. Delete that runtime file only if you intentionally want to reset local saved demo state. No reset endpoint is exposed.

Backend paths have no `/api` prefix. Frontend proxy must strip `/api`. CORS permits only HTTP localhost:5180 and 127.0.0.1:5180. This is not access control, bind to loopback only.

## Contract

- `GET /health`: SQLite and demo health labels.
- `GET /owner/overview?year=2026`: hotel, totals, monthly rows, saved annual budget, demo label. Years 2000..2100 are accepted, years without seeded records return 404.
- `GET /owner/forecast`: persisted 12-month forecast, percentage MAPE evaluation and limitations. Same-month prior-year seasonal-naive forecast assumes unchanged occupancy and intensity. Illustrative +/-15% bands are not calibrated confidence intervals. Chronological evaluation trains on 2025 and tests on 2026. The comparison baseline is actual same-month prior-year emissions, not a monthly average. `model_mape` names the selected method's MAPE for frontend compatibility, it does not imply ML. Optional `pip install -r apps/owner-api/requirements-ml.txt` enables a real local LightGBM candidate using month and guest nights, deterministic parameters and a holdout comparison. Candidate is selected only if MAPE beats seasonal naive, then refitted to all 24 records. Observed holdout occupancy is used in evaluation, forecast occupancy is assumed unchanged. Tiny synthetic holdout is not production evidence.
- `POST /owner/scenario`: required electricity, fuel and Scope 3 reduction percentages 0..100, investment and annual savings in nonnegative LKR. Scenario baseline is saved 2026 totals. Zero annual savings yields null payback (no finite payback). Numeric upper guard is 1e15 and values must be finite.
- `PUT /owner/budget`: saves nonnegative finite `annual_kg`.
- `POST /owner/months/{id}/sign-off`: `signer_name` requires two name components. Returns saved month with `signed_off` status. Duplicate is 409. Transactionally appends `demo_signoff` audit entry. This is a demo acknowledgement, not authentication, identity verification or a legal signature.
- `GET /owner/report?year=2026`, `/owner/report.csv`, `/owner/report.pdf`: downloadable actual saved-data reports. HTML escapes all stored text. CSV protects formula-like text. PDF is a compact local ReportLab report. Reports are not independently verified.
- `POST /owner/guest-receipt`: integer `guest_nights >= 1`, period `YYYY-MM` for a saved month. Allocates saved Scope 1+2+3 kg proportionally by guest nights, persists receipt, returns null verification URL and demo label. No verification or QR claims.
- `GET /owner/audit`: ordered persisted signoff audit list.
- `POST /owner/jobs/retrain`: HTTP 202 with persisted queued job. FastAPI background task genuinely recomputes evaluation and forecast, saves metrics and completed/failed status. `GET /owner/jobs` lists persisted jobs. No remote worker, fake LightGBM, or durable execution claim. Restart marks unfinished jobs failed rather than silently claiming completion.

Invalid bodies return 422, missing saved records 404, duplicate signoffs 409, unavailable SQLite 503. Unknown request fields are rejected. SQLite transactions protect signoff uniqueness. This initial local slice has no authentication, multi-tenant authorization, durable job queue or independent emissions verification.
