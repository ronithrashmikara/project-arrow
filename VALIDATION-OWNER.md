# Owner module acceptance evidence

Validated November 13, 2026 on Windows. Interpreted the request as completing Ronith's R2 Owner/GM local implementation, not teammates' modules or production deployment.

## Observed checks

- Root setup-owner.cmd completed successfully: pinned API dependencies including LightGBM, npm ci, TypeScript and Vite production build.
- `.venv\Scripts\python.exe -m pytest apps\owner-api -q`: 36 passed. Coverage includes saved state, validation, duplicate sign-off, HTML escaping, CSV formula protection, PDF generation, forecast evaluation, jobs, restart handling and CORS.
- Root start-owner.cmd launched actual loopback API 8010 and compiled web preview 5180. The command remains attached to child terminal output while servers are running, not a failed startup.
- `.venv\Scripts\python.exe tools\check_owner.py`: all HTTP acceptance checks passed against the real frontend proxy. Verified totals reconciliation, persisted budget, invalid input rejection, scenario reductions and zero-savings behavior, sign-off success and duplicate rejection, receipt allocation, HTML/CSV/genuine PDF, forecast bounds and completed persisted training job with audit.
- Browser: overview showed 258,360 kg annual total. Scenario inputs 20% electricity, 10% fuel, 5% scope3, LKR250000 investment and LKR50000 savings returned 219,846 projected kg and five-year payback. Budget persisted at 280000 kg.
- Browser final compiled asset index-Bm4Mnv-b.js: May sign-off submitted twice synchronously resulted in one success message, saved signed_off status and disabled button, no error. An earlier stale tab was explicitly replaced with a cache-independent navigation before final acceptance.
- Browser: October two-guest-night receipt returned 26.93 kg, persisted receipt ID and explicit unverified/no verification URL notice.

## Honest limits

Synthetic single-hotel data, local SQLite, unauthenticated demo acknowledgements and in-process jobs. Not production authorization, multi-tenancy, durable job orchestration, verified carbon accounting, real occupancy forecasting or completed team integration. LightGBM is a genuine candidate selected only when its small synthetic holdout beats seasonal-naive. Forecast bands are illustrative. CI configuration is committed locally but has not run on GitHub. No push or deployment performed.
See YOUR-WORK.md for assignment and production follow-up. Demo acceptance changed local budget/signoffs/receipts/jobs intentionally. Runtime data and virtual environments are ignored by git.

## UI refinement, November 13, 2026

Replaced cream/serif marketing styling with a neutral operations layout, charcoal navigation, consistent SVG icons, grouped numeric summaries and plain task-oriented copy. Reduced decorative badges and fixed scenario field labels and chart month names. Kept existing endpoints, form IDs and sign-off guards.

Production build passed after refinement. Reviewed actual compiled dashboard in Chrome desktop and a 390px embedded browser viewport (375px content width with scrollbar). All six routes had no document overflow, chart overflow stayed inside its scroll container, and the narrow-screen scenario form returned 219,846 projected kg and five-year payback with readable units. The public HTTP acceptance suite passed again. This is responsive desktop-browser validation, not physical phone testing.

Fetched origin/ronith before final UI commit: no remote-only commits and a fast-forward push is possible at that observation. No push performed.
