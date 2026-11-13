"""Deterministic seed-data generator for the national dashboard.

Produces apps/api/app/policy/seed/data.json containing:
  - 25 Sri Lankan districts with approximate centroid coordinates
  - Synthetic hotel / guest-house properties with research consent flags
  - Monthly submissions (reporting years Apr->Mar) with Scope 1/2/3 kg CO2e

The generator is fully deterministic (fixed random seed) so every teammate
gets identical data and the dashboard is reproducible.

Run:  python apps/api/app/policy/seed/generate.py
"""

from __future__ import annotations

import json
import random
import zlib
from datetime import date
from pathlib import Path

SEED = 20261113
OUT = Path(__file__).with_name("data.json")

# (name, province, latitude, longitude) - coordinates are approximate district
# centroids, good enough for a national choropleth demo.
DISTRICTS: list[tuple[str, str, float, float]] = [
    ("Colombo", "Western", 6.9271, 79.8612),
    ("Gampaha", "Western", 7.0283, 79.8737),
    ("Kalutara", "Western", 6.5333, 79.8833),
    ("Kandy", "Central", 7.2906, 80.6337),
    ("Matale", "Central", 7.4875, 80.6881),
    ("Nuwara Eliya", "Central", 6.9697, 80.7826),
    ("Galle", "Southern", 6.0535, 80.2210),
    ("Matara", "Southern", 5.9485, 80.5350),
    ("Hambantota", "Southern", 6.1186, 81.0965),
    ("Jaffna", "Northern", 9.6615, 80.0256),
    ("Kilinochchi", "Northern", 9.3800, 80.4000),
    ("Mannar", "Northern", 8.9830, 79.8400),
    ("Vayamba", "Northern", 8.7500, 80.5000),
    ("Mullaitivu", "Northern", 9.4700, 80.6600),
    ("Batticaloa", "Eastern", 7.7167, 81.7000),
    ("Ampara", "Eastern", 7.7000, 81.9000),
    ("Trincomalee", "Eastern", 8.5730, 81.1770),
    ("Kurunegala", "North Western", 7.7520, 80.7060),
    ("Puttalam", "North Western", 8.0317, 79.8280),
    ("Anuradhapura", "North Central", 8.3130, 80.4070),
    ("Polonnaruwa", "North Central", 7.9400, 81.1000),
    ("Monaragala", "Uva", 6.8720, 81.0500),
    ("Badulla", "Uva", 6.9930, 81.0560),
    ("Kegalle", "Sabaragamuwa", 7.1480, 80.7050),
    ("Ratnapura", "Sabaragamuwa", 6.6828, 80.4033),
]

# SLTDA-style property categories used as the leaderboard segment.
CATEGORIES = [
    "Tourist Hotel 5*",
    "Tourist Hotel 4*",
    "Tourist Hotel 3*",
    "Boutique Hotel",
    "Bungalow",
    "Guest House A",
    "Guest House B",
    "Heritage Bungalow",
    "Homestay",
    "Not registered",
]

SIZE_BANDS = ["small (<30)", "medium (30-100)", "large (100+)"]

# Properties per district in the demo dataset.
# Districts with >= 5 properties publish national aggregates; the smaller ones
# are deliberately kept below the k >= 5 threshold so the suppression rule is
# visible on the dashboard and on the map.
PROPERTY_PLAN: list[tuple[str, int]] = [
    ("Colombo", 8),
    ("Gampaha", 7),
    ("Kalutara", 6),
    ("Kandy", 7),
    ("Matale", 5),
    ("Nuwara Eliya", 5),
    ("Galle", 6),
    ("Matara", 5),
    ("Hambantota", 4),  # suppressed
    ("Jaffna", 5),
    ("Kilinochchi", 3),  # suppressed
    ("Mannar", 2),  # suppressed
    ("Batticaloa", 4),  # suppressed
    ("Ampara", 4),  # suppressed
    ("Trincomalee", 4),  # suppressed
    ("Anuradhapura", 5),
    ("Polonnaruwa", 4),  # suppressed
    ("Monaragala", 3),  # suppressed
    ("Badulla", 4),  # suppressed
    ("Kegalle", 3),  # suppressed
    ("Kurunegala", 5),
    ("Puttalam", 3),  # suppressed
    ("Ratnapura", 3),  # suppressed
    ("Vayamba", 2),  # suppressed
    ("Mullaitivu", 2),  # suppressed
]

# Realistic-ish guest night share per district weight.
DISTRICT_WEIGHT = {
    "Colombo": 9.0,
    "Gampaha": 5.0,
    "Kalutara": 4.0,
    "Kandy": 6.5,
    "Matale": 2.2,
    "Nuwara Eliya": 5.5,
    "Galle": 5.0,
    "Matara": 3.5,
    "Hambantota": 2.5,
    "Jaffna": 1.4,
    "Kilinochchi": 1.0,
    "Mannar": 0.6,
    "Vayamba": 0.8,
    "Mullaitivu": 0.6,
    "Batticaloa": 1.6,
    "Ampara": 1.3,
    "Trincomalee": 1.2,
    "Anuradhapura": 1.5,
    "Polonnaruwa": 1.0,
    "Monaragala": 0.9,
    "Badulla": 1.2,
    "Kegalle": 1.1,
    "Kurunegala": 1.8,
    "Puttalam": 1.4,
    "Ratnapura": 1.0,
}


def district_profile(name: str) -> tuple[float, float]:
    """Deterministic (efficiency, grid_ratio) per district.

    Efficiency scales how carbon-intensive a property is, and grid_ratio the
    share of Scope 2 in its emissions. Both are derived from the district name
    so the national map shows a real gradient instead of a flat colour.
    """
    digest = zlib.crc32(name.encode("utf-8"))
    efficiency = 0.78 + (digest % 62) / 100.0  # 0.78 - 1.39
    grid_ratio = 0.35 + ((digest >> 8) % 46) / 100.0  # 0.35 - 0.80
    return efficiency, grid_ratio


def reporting_months(start_year: int, years: int = 2) -> list[str]:
    """Reporting year runs April -> March (client workbook convention)."""
    months: list[str] = []
    for offset in range(years):
        y = start_year + offset
        for m in range(4, 13):
            months.append(f"{y}-{m:02d}")
        for m in range(1, 4):
            months.append(f"{y + 1}-{m:02d}")
    return months


def build() -> dict:
    rng = random.Random(SEED)

    districts = [
        {
            "id": f"d{idx:02d}",
            "name": name,
            "province": province,
            "lat": lat,
            "lng": lng,
        }
        for idx, (name, province, lat, lng) in enumerate(DISTRICTS, start=1)
    ]

    properties = []
    submissions = []

    periods = reporting_months(2024, years=2)  # Apr 2024 -> Mar 2026

    for district, property_count in PROPERTY_PLAN:
        if district not in DISTRICT_WEIGHT:
            continue

        efficiency, grid_ratio = district_profile(district)

        for slot in range(property_count):
            idx = len(properties) + 1
            category = CATEGORIES[(idx * 3) % len(CATEGORIES)]
            size_band = SIZE_BANDS[(idx + 1) % len(SIZE_BANDS)]
            guest_nights_base = DISTRICT_WEIGHT[district] * 120 * rng.uniform(0.5, 1.5)
            consent = rng.random() > 0.25  # ~75% consent to research sharing

            prop_id = f"p{idx:02d}"
            properties.append(
                {
                    "id": prop_id,
                    "name": f"{district} {'Resort' if 'Hotel' in category else 'Lodge'} {idx}",
                    "district": district,
                    "category": category,
                    "size_band": size_band,
                    "rooms": rng.choice([8, 14, 22, 35, 48, 60, 90, 120]),
                    "consent_research": consent,
                }
            )

            for period_index, period in enumerate(periods):
                # Seasonality: peak from Dec to Feb, low in Oct-Nov and Jun-Jul.
                month = int(period.split("-")[1])
                seasonal = 1.0
                if month in (12, 1, 2):
                    seasonal = 1.45
                elif month in (6, 7, 8):
                    seasonal = 0.72
                elif month in (3, 11):
                    seasonal = 1.15

                trend = 1.0 - 0.012 * period_index  # gentle year-on-year reduction

                guest_nights = round(guest_nights_base * seasonal * trend * rng.uniform(0.9, 1.1))
                occupancy = round(guest_nights * rng.uniform(0.55, 0.85))

                scope1 = round(guest_nights * rng.uniform(1.4, 3.6) * efficiency * trend, 1)
                scope2 = round(
                    guest_nights * rng.uniform(3.1, 9.4) * efficiency * grid_ratio * 2.2 * trend, 1
                )
                scope3 = round(guest_nights * rng.uniform(1.8, 5.2) * efficiency * trend, 1)

                submissions.append(
                    {
                        "property_id": prop_id,
                        "period": period,
                        "guest_nights": guest_nights,
                        "occupancy": occupancy,
                        "scope1_kg": scope1,
                        "scope2_kg": scope2,
                        "scope3_kg": scope3,
                        "total_kg": round(scope1 + scope2 + scope3, 1),
                        "status": "verified" if rng.random() > 0.12 else "submitted",
                        "completeness": rng.choice([100, 100, 100, 92, 86, 78, 65]),
                    }
                )

    return {
        "meta": {
            "generated_at": date.today().isoformat(),
            "seed": SEED,
            "reporting_year_start": "April",
            "note": "Synthetic demo data. Emissions are simulated for dashboard development.",
        },
        "districts": districts,
        "properties": properties,
        "submissions": submissions,
    }


def main() -> None:
    data = build()
    OUT.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"Wrote {OUT}")
    print(f"  districts   : {len(data['districts'])}")
    print(f"  properties  : {len(data['properties'])}")
    print(f"  submissions : {len(data['submissions'])}")


if __name__ == "__main__":
    main()
