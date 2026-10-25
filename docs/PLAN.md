# Project Arrow — Final Plan

_v2 (final) · 2026-10-25 · 3-month project (13 weeks: 26 Oct 2026 → 24 Jan 2027) · read with [CONTEXT.md](CONTEXT.md)_
_Proposal: `Project Arrow - Proposal.docx` (rebuild with `python build_proposal.py`). Budget: `Project Arrow - Budget.docx`. Diagrams: `diagrams/png/` (rebuild with `python diagrams/render_diagrams.py`). Use case diagram: `python diagrams/usecase.py`. Wireframes: `diagrams/wireframes/` (`python diagrams/wireframes.py`). ER design: 30 tables in three views (`er-a/b/c.png`)._

**Title (as signed):**
> **Project Arrow: A Greenhouse Gas Emission Monitoring, Analytics and Benchmarking Platform for Sri Lankan Tourist Accommodation Sector**

## 0. Signed proposal changes (25 Oct 2026, supersede anything below)

The supervisor returned the signed proposal (`Downloads/Telegram Desktop/Project_Proposal_-_Template_-_Oct_2026-signed.pdf`). Its changes are now in the docx, the diagrams and this plan:
- **English only.** The Sinhala/Tamil interface and i18n are dropped. Help comes from plain-English labels and tooltips.
- **No offline mode.** Drafts are saved on the server and can be resumed later. There is no offline queue or sync.
- **Non-registered properties** follow the same registration and data-entry flow as SLTDA-registered ones (stated in the abstract).
- **People:** supervisor **Ms. Githmi De Silva**, client **Mrs. MAMT Weerasinghe**. Submitted **25/10/2026**.
- **Team (index no):** Ronith Rashmikara LS05-241027, Nadeera Prabhash LS04-233043, Sithum Nimhan LS04-233042, Akarsha Sirisena LS04-233005, Savinthi Minaya LS04-233052.
- **Signatures:** photos are in `signatures/`, redrawn by fal (`fal_clean.py`, key read from the `FAL_KEY` env var) and turned into navy transparent PNGs by `clean_signatures.py`, which also cuts the supervisor's countersignature from the signed PDF.


---

## 1. Problem → Solution (one paragraph for Ch 1)

Sri Lankan hotels and guest houses have no simple way to measure their carbon footprint. The tool that exists, WRAP's TTVC RE Tool, is a macro-driven Excel file. It needs units in MJ and tonnes, carries emission factors for other countries, holds one hotel per file, and cannot aggregate, compare or rank properties. **Project Arrow** replaces it with a mobile-first web platform:
- Properties log energy, water, waste and food purchases in everyday units (litres, LPG cylinders, bill "units", m³, kg).
- The system converts these to **kg CO₂e using Sri Lanka-specific factors**.
- It shows trends **per guest night**, generates reports, and uses AI to explain results and suggest reductions.
- An **anonymised leaderboard** ranks properties within their category.
- Aggregated data can feed national/UN baseline studies, with the property's consent.

---

## 2. The 5 user roles (one per team member)

Each member owns **one role end-to-end**: its screens, API routes, tests and its part of the proposal. All roles sit on a **shared core** (database, auth, emission engine, UI kit) that the whole team builds together in Week 3 and then **freezes as a contract**. After that, nobody needs to wait for anybody else.

| # | Role | Who in real life | What they can do | Owner |
|---|---|---|---|---|
| **R1** | **Property Owner / Manager** | Hotel or guest-house owner | Register, set up the property profile, invite staff, see own dashboard, generate PDF reports, AI insights + recommendations, own leaderboard rank, accept T&C | **Member 1 – Ronith** |
| **R2** | **Data Entry Staff** | Front office / accounts / maintenance employee | Monthly occupancy, energy, water, waste and food entry (weekly or monthly), meter readings, bill photo upload, draft save, "same as last month" quick-fill. **No access to reports or rankings** | **Member 2 – Sithum** |
| **R3** | **Sustainability Verifier** | Client's field officer / auditor | Review submitted months, check bills and evidence, act on anomaly flags, approve / reject / ask for a correction. **Only verified months count for the leaderboard**. Award badges | **Member 3 – Savinthi** |
| **R4** | **Government / UN Analyst** (read-only) | SLTDA, Ministry, UN partner researcher | Anonymised, aggregated dashboards by district, category and season. National leaderboard (pseudonyms). Export the anonymised dataset (CSV). **Never sees names or contacts** | **Member 4 – Akarsha** |
| **R5** | **System Administrator** | The client | Approve property registrations, manage users and roles, **edit the emission-factor library** (versioned), manage T&C versions, import legacy Excel files, set leaderboard rules and thresholds, view the audit log | **Member 5 – Nadeera** |

### Why this split works for parallel development
- **Separate route modules:** `/owner`, `/staff`, `/verifier`, `/analyst`, `/admin`. Each has its own pages, API router and tests, so there are almost no merge conflicts.
- **Clear handoffs through the database status of a monthly submission:**
  `Draft (R2) → Submitted (R2) → Verified / Returned (R3) → Ranked + Aggregated (R1, R4)`. The factors and rules that drive these steps come from R5.
- **Every member can demo their own role on their own.** This is useful for individual marking and viva.
- One role per person also gives a clean **use case diagram**: 5 actors, each with their own use cases, plus the shared «include» use cases Login and Calculate Emissions.

### Shared core (built together in Week 3, then each member keeps one piece)

| Shared piece | Kept by |
|---|---|
| Emission engine + factor model + unit tests vs the client's Excel | Member 5 (Admin owns factors) |
| Database schema + API contract (OpenAPI) | Member 2 (Staff writes most of the data) |
| Auth, roles and row-level security | Member 5 |
| UI kit, charts components | Member 4 |
| AI service (insights, recommendations, chat, anomaly checks) | Member 1 (uses it most). Member 3 consumes the anomaly checks |
| Pseudonymisation + leaderboard service | Member 3 (verification gates the ranking) |

---

## 3. Features by role

> **v3 scope expansion (25 Oct):** the scope was made bigger so the proposal reads as a full platform, not just "Excel on a website". The additions, also written into the proposal:
> - **R1:** targets + **forecasting**, a **what-if simulator** (solar / refill water / biogas / efficient laundry → CO₂e, LKR, payback), **multi-property** (hotel chains), AI chat
> - **R2:** **AI bill scanning (OCR)**, monthly **reminders** (email/SMS/push), draft save
> - **R3:** **badges with a QR public eco-profile**, a **certification-readiness checklist** (GSTC-style)
> - **R4:** a read-only **open-data API**, an **AI national baseline report**
> - **R5:** a **factor change-impact preview**, legacy Excel import, audit log

### R1 — Property Owner / Manager
- Sign-up (email or phone OTP). Accept **T&C + data-use consent** (versioned, timestamped).
- **Property profile:**
  - Name
  - **SLTDA category** (Tourist Hotel 1–5★, Boutique Hotel, Boutique Villa, Guest House A/B/C/B&B, Bungalow, Heritage Bungalow/Home, Rented Home, Rented Apartment, Homestay, *Not registered*, which follows the same flow)
  - SLTDA reg. no. (optional), district/province, address, phone, contact person, mobile
  - Rooms, beds, size band (auto: <30 / 30–100 / 100+)
  - MICE facility, restaurant, laundry type (in-house/outsourced), energy and water sources
- **Seasonality:** peak/off-peak months, employees per season, approx. guests per month
- Invite R2 staff
- **Dashboard:** kg CO₂e per guest night (headline), scope breakdown, source breakdown, monthly trends, year-on-year, peak vs off-season, benchmark vs category median
- **PDF report:** year + chosen highlights, charts, scope table, data completeness, method and factor sources
- **AI:** monthly plain-language summary, ranked reduction recommendations (CO₂e + LKR saved), "ask your data" chat
- Own leaderboard position (sees own real name; everyone else is a pseudonym). Opt out of the public ranking.
- Export own data (CSV/Excel)

### R2 — Data Entry Staff
- **Monthly occupancy:** guest nights, guests, employees, conference delegate days
- **Energy:** petrol / diesel / kerosene (L), **LPG cylinders 37.5 / 12.5 / 5 / 2.3 kg × count**, grid electricity (kWh from the CEB/LECO bill), solar generation, biogas, firewood/other
- **Water:** multiple meters. Reading mode (system calculates consumption, flags rollover) or direct m³. Unmetered estimate, greywater, recycled. Laundry in-house (capacity × washes) or outsourced (provider, kg/washes).
- **Waste (kg):** food waste (prep / plate / spoilage), plastic, glass, metal, paper, **e-waste**, garden, mixed. **Disposal route** per stream (landfill, open burning, compost, biogas, animal feed, recycler). Bottled water counts, single/multi-use plastics.
- **Food purchases (kg):** the 30 categories from the client sheet (optional "advanced" tab)
- Weekly → monthly roll-up, bill photo upload, server-side drafts, quick-fill, inline validation
- Submit month → status becomes **Submitted**

### R3 — Sustainability Verifier
- Queue of submitted months (filter by district/category)
- Side-by-side view: entered values, bill photos, last year's same month, **AI anomaly flags**
- Approve / return with comment. Every action goes to the audit log.
- Data completeness check (≥ 80% needed to rank)
- Leaderboard rules engine: pseudonyms, ranking **within the same category + size band**, **groups with fewer than 5 properties hidden**, rating bands (Leader / Good / Needs improvement)
- Award badges/certificates (e.g. "Verified Low-Carbon 2026")

### R4 — Government / UN Analyst
- National dashboard: total and per-guest-night CO₂e by district, category, season and scope
- Heat map by district, trend vs baseline year
- National anonymised leaderboard
- **Anonymised dataset export** (no names or contacts; pseudonym IDs only; small groups suppressed)
- Read-only. Sees only properties whose consent allows research sharing.

### R5 — System Administrator
- Approve or reject new properties. Manage users and roles.
- **Emission-factor library:** source, year, unit, value. Versioned, so every result stores the factor version it used. Sri Lanka grid factor per year.
- T&C versions (forces re-consent), leaderboard thresholds, reporting-year start (default **April**)
- **Excel importer:** upload the client's `English simplified data tables.xlsx` / RE Tool file → mapped into the database (Apr 2025–Mar 2026 history kept)
- System audit log, basic usage stats

---

## 4. Emission engine (shared core)
`emissions = activity × emission factor`. Results are grouped by GHG Protocol scope.

| Scope | Sources |
|---|---|
| **Scope 1** (direct) | Petrol, diesel, kerosene, LPG, generator fuel, biogas/firewood |
| **Scope 2** (purchased electricity) | Grid kWh × SL grid factor for that year. Solar reported as avoided emissions |
| **Scope 3** (indirect) | Food purchases, waste by disposal route, water supply/treatment, outsourced laundry |

- Unit conversions are built in (L→MJ, cylinders→kg, m³). Users never type MJ.
- **KPIs:** kg CO₂e/guest night, kWh/GN, L water/GN, kg waste/GN, % single-use plastic, % waste diverted from landfill. Extra views per employee and per room.
- **Data completeness %.** When data is missing, annual totals are marked "estimated".
- Fix the RE-tool bugs (laundry water only counted in month 1, wrong month header in the waste sheet).
- AI never calculates numbers. It only explains engine output.

## 5. Terms & Conditions / Data use
These need review by the client and the institute.
- What data is collected and why (monitoring + national baseline)
- **Anonymised/aggregated data may be shared with government bodies (SLTDA, Ministry of Environment) and international organisations (UN agencies) for research, policy and reporting**
- Identifiable data is never published. The leaderboard uses pseudonyms, and groups smaller than 5 are hidden.
- **Sri Lanka Personal Data Protection Act No. 9 of 2022**: purpose limitation, access/correction/deletion rights, retention period, controller contact
- Versioned consent, re-acceptance when the terms change, withdrawal + deletion request
- Disclaimer: the figures are estimates from published factors and are not a certified carbon audit

## 6. Accessibility (the client's emphasis)
- **Mobile-first PWA.** It installs on Android from the browser. Online only, no offline mode. Optional Play Store APK via Capacitor.
- **English only** (decided in the signed proposal), plain-language labels and tooltips
- WCAG 2.1 AA: large touch targets, contrast, screen-reader labels, numeric keypads
- One topic per screen, progress bar, quick-fill

## 7. Out of scope
- Certified carbon audits or carbon credits
- IoT/smart-meter integration
- Payments
- SLTDA system integration
- Native iOS
- Production operations: **deployment is the client's last priority**, so we deliver a deployable build plus a free-tier demo
- Scope 3 beyond food, waste, water and laundry

## 8. Things the brief did not mention (found in the Excels/template)

**Data fields:**
1. **Guest nights** (the key normaliser), not just guests per month
2. Kerosene, electricity kWh, biogas, solar generation
3. **LPG by cylinder size**
4. **Food purchases, 30 categories** (Scope 3)
5. Food waste split + **disposal destination**
6. Laundry in-house/outsourced
7. Greywater, recycled water
8. MICE delegate days, star rating, size band
9. Contact details

**Behaviour of the existing tool:**
10. **Reporting year Apr→Mar**, monthly data, quarterly submission
11. Data completeness % + estimated totals
12. 3-year comparison
13. Water scarcity footprint (optional)

**Proposal template requirements:**
14. A Data Use & Protection precedent (the TTVC tool sent anonymised data to WRAP for a UN/German-government programme)
15. The template needs flowcharts of the current system, a review of similar systems, MoSCoW prioritisation and a process-model justification. It also has **only 4 member slots on the cover and 2 on the declaration, so add 5**.

**Corrections and gaps:**
16. **No Sri Lanka factors** in either Excel
17. **e-waste** is not in either Excel (new)
18. "cm³" → **m³**

## 9. Questions for the client (ask in Week 1)
1. Who is the admin organisation? Is there a funding body or partner (UN, GIZ, etc.)?
2. Which emission-factor source is official: SLSEA, IPCC, DEFRA, or the TTVC factors?
3. Is food-purchase tracking mandatory or optional?
4. What makes a property "pro-environmental": thresholds, percentiles, or targets? Badges?
5. Should non-registered properties be verified differently from SLTDA-registered ones?
6. How many pilot properties are there? Can we get anonymised sample data?
7. Weekly or monthly entry? Who enters the data?
8. Does the baseline still go to WRAP/UN? Which organisations should the T&C name?
9. Is a PWA enough, or is a Play Store listing needed?
10. Who will act as the verifier (R3): her staff, or self-declared?

## 10. Tech stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite (or Next.js) **PWA**, Tailwind, Recharts |
| Android (optional) | Capacitor wrapper |
| Backend | Supabase (PostgreSQL + Auth + row-level security + storage) **or** Node.js (Express/NestJS) + PostgreSQL |
| Emission engine | TypeScript service + unit tests against the Excel's results |
| AI | Claude API (`claude-sonnet-5-5`, or `claude-haiku-5-5` for summaries) with tool use |
| Reports | react-pdf / Puppeteer |
| Design / diagrams | Figma (edu), draw.io / StarUML |
| Process | **Scrum, 2-week sprints**, GitHub Projects. Justification: requirements will change after client demos, and 5 role modules can be built in parallel |

**Core classes (seed for the class diagram):** User, Role (Owner/Staff/Verifier/Analyst/Admin), Property, PropertyProfile, SeasonProfile, ReportingPeriod, MonthlySubmission (status), MonthlyOccupancy, EnergyEntry, WaterMeter, WaterEntry, WasteEntry, FoodPurchase, PlasticPurchase, Evidence (bill photo), EmissionFactor (versioned), EmissionCalculator, EmissionResult, KPIService, VerificationRecord, Badge, LeaderboardService, Pseudonym, Report, AIInsight, AnomalyFlag, ConsentRecord, TermsVersion, ExcelImporter, AuditLog.

**The 2 sequence diagrams:**
1. **Submit and verify monthly data:** Staff → UI → API → Validation + AnomalyCheck → EmissionCalculator → FactorRepository → DB (Submitted) → Verifier approves → Leaderboard update. Alternative flow: anomaly flagged → returned to staff.
2. **Generate AI insight report:** Owner → ReportService → KPIService → AI agent (tool calls) → PDF → download. Alternative flow: data <80% complete → "estimated" warning.

**Similar systems for Ch 2.2:** WRAP TTVC RE Tool, Hotel Carbon Measurement Initiative (HCMI), Cornell Hotel Sustainability Benchmarking, Travelife, Green Globe / EarthCheck, Greenview Portal. Verify each source when citing.

## 11. MoSCoW

| Priority | Features |
|---|---|
| **Must** | Auth + 5 roles, property registration (SLTDA categories), T&C consent, occupancy/energy/water/waste entry, emission engine with SL factors, verification workflow, dashboards, PDF report, anonymised leaderboard, factor admin |
| **Should** | AI insights + recommendations, anomaly flags, food purchases, **AI bill scanning**, **reminders**, **targets + forecasting**, **what-if simulator**, Excel import, analyst export |
| **Could** | AI chat, **badges + QR eco-profile**, **certification checklist**, **open-data API**, **AI national baseline report**, Play Store APK |
| **Won't** | IoT, payments, iOS native, certified audits |

## 12. Timeline — 3 months (13 weeks)

Timeline flowchart (weeks only, no dates): `diagrams/png/timeline.png`. The pre-proposal flowchart was dropped on request.

| Week | Dates | Phase | Output |
|---|---|---|---|
| 1 | 26 Oct – 1 Nov | **Pre-proposal:** team kickoff, client meeting + questions (§9), Excel analysis, SL factor research, similar-systems review | Requirements notes |
| 2 | 2 – 8 Nov | **Pre-proposal:** current-system flowchart, use case, class + sequence diagrams, wireframes, write Ch 1–3, supervisor review | **Proposal signed and submitted (25 Oct)** |
| 3 | 9 – 15 Nov | **Sprint 0, shared core (everyone):** repo, schema, API contract, auth + roles, UI kit, engine skeleton → **contract freeze** | Core runs, 5 empty role modules |
| 4–5 | 16 – 29 Nov | **Sprint 1, roles in parallel:** each member builds their role's main screens on the core | 5 role MVPs |
| 6–7 | 30 Nov – 13 Dec | **Sprint 2:** engine + SL factors wired in, tests vs Excel, submission → verification flow, dashboards | **Client demo 1 (13 Dec)** |
| 8–9 | 14 – 27 Dec | **Sprint 3:** leaderboard + pseudonyms, PDF reports, AI insights/anomalies, analyst dashboard + export (lighter holiday week) | Feature complete (Must) |
| 10–11 | 28 Dec – 10 Jan | **Sprint 4:** Should-haves: Excel import, food purchases, AI recommendations | **Client demo 2 (10 Jan)** |
| 12 | 11 – 17 Jan | **Testing:** usability with 2–3 real guest houses, accessibility audit, bug fixing | Test report |
| 13 | 18 – 24 Jan | **Final:** documentation, free-tier deployment, handover, viva prep | **Final submission + demo** |

_Dates assume a start on Mon 26 Oct 2026. Shift everything if the institute's proposal deadline is different._

## 13. Risks

| Risk | Mitigation |
|---|---|
| No official SL emission factors | Source hierarchy SLSEA → IEA → IPCC, with the source stored per factor |
| Small properties will not enter much data | "Basic" mode (energy + water + waste), quick-fill, reminders |
| Re-identification on the leaderboard | Pseudonyms, min group size 5, province-level location |
| AI gives wrong numbers | AI only narrates engine output. Disclaimer shown |
| Role modules drift apart | Week-3 API contract freeze, shared UI kit, weekly integration merge |
| Holiday weeks (Christmas/New Year) | Sprint 3 kept lighter. Demo 2 placed after New Year |
| Client unavailable | Fortnightly demo slot agreed in Week 1 |

## 14. Next steps
1. Send the client the §9 questions this week.
2. Get 1–2 filled sample Excels (anonymised).
3. Fill the proposal: cover with 5 members, Ch 1 from §1/§3/§7, Ch 2 from §2/§8/§11, Ch 3 from §10. Put the flowcharts in Ch 2.1 and the budget docx in the Appendices.
4. Create the GitHub repo with the 5 role folders + Figma file.
