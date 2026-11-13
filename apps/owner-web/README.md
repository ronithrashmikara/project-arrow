# Owner web

React, TypeScript and Vite dashboard for the local Owner/GM module. No fabricated API success fallback.

From the repository root run `setup-owner.cmd`, then `start-owner.cmd`. Open http://127.0.0.1:5180. Both development and compiled preview proxy `/api` to the loopback API on port 8010. Production needs its own reverse proxy and authentication.

Sections: scope inventory and intensity, evaluated forecast with genuine optional LightGBM versus seasonal-naive, what-if and payback, saved budgets and monthly demo sign-off, HTML/PDF/CSV reports, guest receipts, training jobs and audit.

Sign-off is self-declared acknowledgement, not authenticated approval. Duplicate clicks are guarded and signed months cannot be resubmitted. Forecast bands are illustrative, not calibrated confidence intervals. All data is synthetic and labelled as demo.

## Validation, November 13, 2026

`npm ci` and `npm run build` passed. Real browser scenario returned 219,846 projected kg and five-year payback, budget saved, May sign-off succeeded with a synchronous duplicate click and became disabled without an error, and October two-night receipt showed 26.93 kg. API integration tests through the actual preview proxy passed. See root VALIDATION-OWNER.md for scope and limitations.
