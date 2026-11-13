"""Local, explicitly synthetic Owner/GM API. No authentication or external services."""
import csv
import html
import io
import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

Number = Annotated[float, Field(ge=0, le=1e15, allow_inf_nan=False)]
Percent = Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)]
Year = Annotated[int, Query(ge=2000, le=2100)]
METHOD = "Seasonal occupancy baseline: same month last year guest nights times historical kg per guest night; not ML"
LIMITATIONS = "Synthetic demo only. Assumes unchanged occupancy and emissions intensity. Bands are illustrative +/-15%, not calibrated confidence intervals. Evaluation uses 2025 to predict 2026 against the same-month previous-year seasonal-naive baseline. Optional LightGBM uses month and guest nights and is selected only if holdout MAPE improves. Holdout occupancy is observed, future occupancy is assumed unchanged."


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Scenario(Input):
    electricity_reduction_pct: Percent
    fuel_reduction_pct: Percent
    scope3_reduction_pct: Percent
    investment_lkr: Number
    annual_savings_lkr: Number


class Budget(Input):
    annual_kg: Number


class Signoff(Input):
    signer_name: str = Field(min_length=3, max_length=120)

    @field_validator("signer_name")
    @classmethod
    def full_name(cls, value):
        value = " ".join(value.split())
        if len(value.split()) < 2 or not all(any(c.isalpha() for c in p) for p in value.split()):
            raise ValueError("Provide a full name with at least two name components")
        return value


class Receipt(Input):
    guest_nights: int = Field(ge=1, le=1000000, strict=True)
    period: str = Field(pattern=r"^20\d{2}-(0[1-9]|1[0-2])$")


def now():
    return datetime.now(timezone.utc).isoformat()


def create_app(db_path=None):
    path = Path(db_path or os.environ.get("ARROW_DB_PATH", str(Path.home() / ".project-arrow" / "owner-demo.sqlite3")))
    path.parent.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def db():
        connection = sqlite3.connect(str(path), timeout=15)
        connection.row_factory = sqlite3.Row
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS hotel(id INTEGER PRIMARY KEY, name TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS months(id INTEGER PRIMARY KEY, period TEXT UNIQUE NOT NULL, scope1_kg REAL NOT NULL, scope2_kg REAL NOT NULL, scope3_kg REAL NOT NULL, guest_nights INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'draft', signer_name TEXT, signed_at TEXT);
        CREATE TABLE IF NOT EXISTS budget(id INTEGER PRIMARY KEY, annual_kg REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, action TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, status TEXT NOT NULL, created_at TEXT NOT NULL, completed_at TEXT, error TEXT);
        CREATE TABLE IF NOT EXISTS metrics(id INTEGER PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS receipts(receipt_id TEXT PRIMARY KEY, payload TEXT NOT NULL);
        """)
        c.execute("INSERT OR IGNORE INTO hotel VALUES(1, 'Arrow Demo Hotel')")
        c.execute("INSERT OR IGNORE INTO budget VALUES(1, 300000)")
        # Explicit deterministic synthetic seed, never duplicated on restart.
        for year in (2025, 2026):
            for month in range(1, 13):
                nights = (1400, 1500, 1650, 1500, 1300, 1200, 1450, 1700, 1550, 1600, 1800, 2000)[month - 1] + (year - 2025) * 40
                c.execute("INSERT OR IGNORE INTO months(period,scope1_kg,scope2_kg,scope3_kg,guest_nights) VALUES(?,?,?,?,?)", (f"{year}-{month:02d}", nights * 3.0 + 800, nights * 7.0 + 1200, nights * 2.0 + 400, nights))
        c.execute("UPDATE jobs SET status='failed', error='Process restarted before completion', completed_at=? WHERE status IN ('queued','running')", (now(),))

    def months(c, year=None):
        rows = c.execute("SELECT * FROM months WHERE period LIKE ? ORDER BY period", (f"{year}-%" if year else "%",)).fetchall()
        return [dict(r) | {"total_kg": r["scope1_kg"] + r["scope2_kg"] + r["scope3_kg"], "demo": True, "signoff_method": "Demo acknowledgement, not authentication"} for r in rows]

    def overview(year):
        with db() as c:
            records = months(c, year)
            if not records:
                raise HTTPException(404, "No demo records for requested year")
            totals = {key: sum(r[key] for r in records) for key in ("scope1_kg", "scope2_kg", "scope3_kg", "total_kg", "guest_nights")}
            totals["kg_per_guest_night"] = totals["total_kg"] / totals["guest_nights"]
            return {"hotel": dict(c.execute("SELECT * FROM hotel WHERE id=1").fetchone()), "year": year, "totals": totals, "months": records, "budget": dict(c.execute("SELECT annual_kg FROM budget WHERE id=1").fetchone()), "demo": True}

    def recompute(c):
        records = months(c)
        training = records[:12]
        holdout = records[12:24]
        seasonal = [r["total_kg"] for r in training]
        mape = lambda predictions: sum(abs(float(p) - r["total_kg"]) / r["total_kg"] for p, r in zip(predictions, holdout)) / len(holdout) * 100
        latest = records[-12:]
        selected_method = METHOD
        selected_mape = mape(seasonal)
        candidate_mape = None
        candidate_status = "LightGBM unavailable, seasonal naive selected"
        predictions = [r["total_kg"] for r in latest]
        try:
            import lightgbm as lgb
            features = lambda rows: [[int(r['period'][5:]), r['guest_nights']] for r in rows]
            candidate = lgb.LGBMRegressor(n_estimators=40, max_depth=2, num_leaves=4, min_child_samples=2, random_state=0, n_jobs=1, verbosity=-1)
            candidate.fit(features(training), [r['total_kg'] for r in training])
            candidate_mape = mape(candidate.predict(features(holdout)))
            candidate_status = "Evaluated LightGBM on chronological 2026 holdout using 2025 training"
            if candidate_mape < selected_mape:
                selected_mape = candidate_mape
                selected_method = "Local LightGBM candidate selected by chronological holdout MAPE; month and assumed guest nights only"
                candidate.fit(features(records), [r['total_kg'] for r in records])
                predictions = [max(0.0, float(p)) for p in candidate.predict(features(latest))]
        except ImportError:
            pass
        points = [{"period": f"{int(r['period'][:4]) + 1}-{r['period'][5:]}", "predicted_kg": p, "lower_kg": p * .85, "upper_kg": p * 1.15} for r, p in zip(latest, predictions)]
        result = {"method": selected_method, "limitations": LIMITATIONS, "points": points, "evaluation": {"model_mape": selected_mape, "baseline_mape": mape(seasonal), "lightgbm_mape": candidate_mape, "candidate_status": candidate_status, "mape_unit": "percent", "baseline_method": "same-month previous-year seasonal naive"}, "training_data": "demo"}
        c.execute("INSERT OR REPLACE INTO metrics VALUES(1,?,?)", (json.dumps(result), now()))
        return result

    with db() as c:
        if not c.execute("SELECT 1 FROM metrics").fetchone():
            recompute(c)

    app = FastAPI(title="Project Arrow Owner Demo")
    app.state.db_path = str(path)
    app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5180", "http://127.0.0.1:5180"], allow_methods=["GET", "POST", "PUT"], allow_headers=["Content-Type"])

    from fastapi.exceptions import RequestValidationError
    from fastapi.responses import JSONResponse

    @app.exception_handler(RequestValidationError)
    async def invalid_input(request, exc):
        return JSONResponse(status_code=422, content={"detail": [{"loc": list(e['loc']), "msg": e['msg'], "type": e['type']} for e in exc.errors()]})

    @app.exception_handler(sqlite3.Error)
    async def database_error(request, exc):
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=503, content={"detail": "Local SQLite database unavailable"})

    @app.get("/health")
    def health():
        with db() as c:
            c.execute("SELECT 1").fetchone()
        return {"status": "ok", "storage": "sqlite", "demo": True}

    @app.get("/owner/overview")
    def get_overview(year: Year = 2026):
        return overview(year)

    @app.get("/owner/forecast")
    def forecast():
        with db() as c:
            return json.loads(c.execute("SELECT payload FROM metrics WHERE id=1").fetchone()[0])

    @app.post("/owner/scenario")
    def scenario(body: Scenario):
        t = overview(2026)["totals"]
        avoided = t["scope1_kg"] * body.fuel_reduction_pct / 100 + t["scope2_kg"] * body.electricity_reduction_pct / 100 + t["scope3_kg"] * body.scope3_reduction_pct / 100
        return {"baseline_kg": t["total_kg"], "projected_kg": t["total_kg"] - avoided, "avoided_kg": avoided, "reduction_pct": avoided / t["total_kg"] * 100, "payback_years": body.investment_lkr / body.annual_savings_lkr if body.annual_savings_lkr else None}

    @app.put("/owner/budget")
    def budget(body: Budget):
        with db() as c:
            c.execute("UPDATE budget SET annual_kg=? WHERE id=1", (body.annual_kg,))
        return body.model_dump()

    @app.post("/owner/months/{month_id}/sign-off")
    def signoff(month_id: int, body: Signoff):
        with db() as c:
            c.execute("BEGIN IMMEDIATE")
            row = c.execute("SELECT * FROM months WHERE id=?", (month_id,)).fetchone()
            if not row:
                raise HTTPException(404, "Month not found")
            if row["status"] == "signed_off":
                raise HTTPException(409, "Month already signed off")
            c.execute("UPDATE months SET status='signed_off', signer_name=?, signed_at=? WHERE id=?", (body.signer_name, now(), month_id))
            c.execute("INSERT INTO audit(action,details,created_at) VALUES(?,?,?)", ("demo_signoff", json.dumps({"month_id": month_id, "signer_name": body.signer_name, "authentication": False}), now()))
            return next(r for r in months(c) if r["id"] == month_id)

    @app.get("/owner/report", response_class=HTMLResponse)
    def report(year: Year = 2026):
        data = overview(year)
        totals = data['totals']
        rows = ''.join(
            '<tr>' + ''.join(f'<td>{html.escape(str(value))}</td>' for value in (
                r['period'], f"{r['scope1_kg']:,.2f}", f"{r['scope2_kg']:,.2f}",
                f"{r['scope3_kg']:,.2f}", f"{r['total_kg']:,.2f}",
                r['guest_nights'], r['status'], r['signer_name'] or 'Not signed')) + '</tr>'
            for r in data['months']
        )
        document = f'''<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Arrow owner inventory draft {year}</title><style>
body{{font:15px Arial,sans-serif;color:#203c30;max-width:1100px;margin:40px auto;padding:20px}}
h1{{font-size:28px}}.notice{{background:#fff4d8;padding:16px;border-left:4px solid #a77320}}
table{{width:100%;border-collapse:collapse;font-size:12px}}th,td{{padding:9px;text-align:left;border-bottom:1px solid #dce5de}}
dl{{display:grid;grid-template-columns:240px 1fr}}dt,dd{{padding:7px;margin:0}}
@media print{{body{{margin:0;padding:12px}}}}</style></head><body>
<p>PROJECT ARROW / OWNER INVENTORY DRAFT</p><h1>{html.escape(data['hotel']['name'])} | {year}</h1>
<p class="notice"><strong>LOCAL DEMO: not independently verified.</strong> Generated synthetic records, not client-approved emission-factor calculations or an ISO-certified inventory. Owner sign-off is a local acknowledgement, not independent verification.</p>
<h2>Annual totals</h2><dl>
<dt>Scope 1</dt><dd>{totals['scope1_kg']:,.2f} kg CO2e</dd>
<dt>Scope 2</dt><dd>{totals['scope2_kg']:,.2f} kg CO2e</dd>
<dt>Selected Scope 3</dt><dd>{totals['scope3_kg']:,.2f} kg CO2e</dd>
<dt>Total emissions</dt><dd>{totals['total_kg']:,.2f} kg CO2e</dd>
<dt>Guest nights</dt><dd>{totals['guest_nights']:,}</dd>
<dt>Emissions intensity</dt><dd>{totals['kg_per_guest_night']:,.2f} kg CO2e / guest-night</dd>
<dt>Annual carbon budget</dt><dd>{data['budget']['annual_kg']:,.2f} kg CO2e</dd></dl>
<h2>Monthly inventory</h2><p>All emissions columns are kg CO2e. Records are read from the saved local database.</p>
<table><thead><tr><th>Period</th><th>Scope 1</th><th>Scope 2</th><th>Scope 3</th><th>Total</th><th>Guest nights</th><th>Status</th><th>Demo signer</th></tr></thead><tbody>{rows}</tbody></table>
<p>Generated {html.escape(now())}. Factor provenance and evidence verification must be integrated with the team's shared GHG engine before real reporting.</p>
</body></html>'''
        return HTMLResponse(document, headers={"Content-Disposition": f'attachment; filename="owner-report-{year}.html"'})

    @app.get("/owner/report.pdf")
    def report_pdf(year: Year = 2026):
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
        data = overview(year)
        output = io.BytesIO()
        pdf = canvas.Canvas(output, pagesize=A4)
        y = 800
        t = data['totals']
        lines = [f"Project Arrow demo inventory {year}", data['hotel']['name'], "Synthetic demo, not independently verified", "Not an ISO-certified inventory. Sign-off is a local demo acknowledgement.", f"Scope 1: {t['scope1_kg']:.2f} kg CO2e", f"Scope 2: {t['scope2_kg']:.2f} kg CO2e", f"Selected Scope 3: {t['scope3_kg']:.2f} kg CO2e", f"Annual total: {t['total_kg']:.2f} kg CO2e", f"Guest nights: {t['guest_nights']}; intensity: {t['kg_per_guest_night']:.2f} kg CO2e / guest-night", f"Annual budget: {data['budget']['annual_kg']:.2f} kg CO2e", "Monthly period | total kg CO2e | guest nights | owner sign-off status"]
        lines += [f"{r['period']} | {r['total_kg']:.2f} kg | {r['guest_nights']} nights | {r['status']} | {r['signer_name'] or ''}" for r in data['months']]
        for line in lines:
            pdf.drawString(40, y, line[:150])
            y -= 24
        pdf.save()
        return Response(output.getvalue(), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="owner-report-{year}.pdf"'})

    @app.get("/owner/report.csv")
    def report_csv(year: Year = 2026):
        data = overview(year)
        output = io.StringIO(newline="")
        fields = ["id", "period", "scope1_kg", "scope2_kg", "scope3_kg", "total_kg", "guest_nights", "status", "signer_name"]
        writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in data["months"]:
            # Prevent spreadsheet formula execution in user-provided names.
            safe = {k: ("'" + v if isinstance(v, str) and v.startswith(("=", "+", "-", "@", "\t", "\r")) else v) for k, v in row.items()}
            writer.writerow(safe)
        return Response(output.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="owner-report-{year}.csv"'})

    @app.post("/owner/guest-receipt")
    def receipt(body: Receipt):
        with db() as c:
            row = c.execute("SELECT * FROM months WHERE period=?", (body.period,)).fetchone()
            if not row:
                raise HTTPException(404, "No saved month for requested period")
            total = sum(row[k] for k in ("scope1_kg", "scope2_kg", "scope3_kg"))
            result = {"receipt_id": str(uuid.uuid4()), "period": body.period, "guest_nights": body.guest_nights, "kg_co2e": total / row["guest_nights"] * body.guest_nights, "method": "Demo allocation: saved monthly Scope 1+2+3 kg divided by guest nights, multiplied by receipt nights; not verified", "verification_url": None, "demo": True}
            c.execute("INSERT INTO receipts VALUES(?,?)", (result["receipt_id"], json.dumps(result)))
            return result

    @app.get("/owner/audit")
    def audit():
        with db() as c:
            return [dict(r) | {"details": json.loads(r["details"])} for r in c.execute("SELECT * FROM audit ORDER BY id")]

    def run_job(job_id):
        try:
            with db() as c:
                c.execute("UPDATE jobs SET status='running' WHERE id=?", (job_id,))
            with db() as c:
                recompute(c)
                c.execute("UPDATE jobs SET status='completed', completed_at=? WHERE id=?", (now(), job_id))
        except Exception:
            with db() as c:
                c.execute("UPDATE jobs SET status='failed', error='Local evaluation failed', completed_at=? WHERE id=?", (now(), job_id))

    @app.post("/owner/jobs/retrain", status_code=202)
    def retrain(background_tasks: BackgroundTasks):
        job_id = str(uuid.uuid4())
        with db() as c:
            c.execute("INSERT INTO jobs(id,status,created_at) VALUES(?,'queued',?)", (job_id, now()))
        background_tasks.add_task(run_job, job_id)
        return {"id": job_id, "status": "queued"}

    @app.get("/owner/jobs")
    def jobs():
        with db() as c:
            return [dict(r) for r in c.execute("SELECT * FROM jobs ORDER BY created_at,id")]

    return app


app = create_app()
