"""Aggregation rules for the national policy dashboard.

Privacy rules applied here (R5 / R6 responsibilities):
  * A group with fewer than K_MIN_PROPERTIES contributing properties is
    suppressed and reported with `suppressed: true` so the UI can say
    "insufficient data" instead of leaking a small group.
  * Only verified submissions feed the national dashboard figures.
  * Property names are never exposed; the dashboard works on aggregates and
    property counts only.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from .repository import get_repository

K_MIN_PROPERTIES = 5

# Reporting year runs April -> March, matching the client TTVC workbook.
REPORTING_YEAR_START_MONTH = 4


def reporting_year(period: str) -> str:
    """'2025-08' -> '2025/26'. April starts a new reporting year."""
    year, month = (int(part) for part in period.split("-"))
    if month >= REPORTING_YEAR_START_MONTH:
        return f"{year}/{str(year + 1)[-2:]}"
    return f"{year - 1}/{str(year)[-2:]}"


def available_reporting_years() -> list[str]:
    repo = get_repository()
    years = {reporting_year(s["period"]) for s in repo.submissions}
    return sorted(years)


def _rows_for_year(year: str | None, require_verified: bool = True) -> list[dict[str, Any]]:
    repo = get_repository()
    props = repo.property_index()

    rows: list[dict[str, Any]] = []
    for submission in repo.submissions:
        if year and reporting_year(submission["period"]) != year:
            continue
        if require_verified and submission["status"] != "verified":
            continue
        prop = props.get(submission["property_id"])
        if not prop:
            continue
        rows.append({**submission, **{f"prop_{k}": v for k, v in prop.items()}})
    return rows


def _blank_bucket() -> dict[str, Any]:
    return {
        "guest_nights": 0,
        "scope1_kg": 0.0,
        "scope2_kg": 0.0,
        "scope3_kg": 0.0,
        "total_kg": 0.0,
        "properties": set(),
    }


def _finalise(bucket: dict[str, Any]) -> dict[str, Any]:
    total = bucket["total_kg"]
    guest_nights = bucket["guest_nights"]
    return {
        "guest_nights": guest_nights,
        "scope1_kg": round(bucket["scope1_kg"], 1),
        "scope2_kg": round(bucket["scope2_kg"], 1),
        "scope3_kg": round(bucket["scope3_kg"], 1),
        "total_kg": round(total, 1),
        "property_count": len(bucket["properties"]),
        "kg_per_guest_night": round(total / guest_nights, 3) if guest_nights else 0.0,
        "suppressed": len(bucket["properties"]) < K_MIN_PROPERTIES,
    }


def summary(year: str | None = None) -> dict[str, Any]:
    rows = _rows_for_year(year)
    bucket = _blank_bucket()
    for row in rows:
        bucket["guest_nights"] += row["guest_nights"]
        bucket["scope1_kg"] += row["scope1_kg"]
        bucket["scope2_kg"] += row["scope2_kg"]
        bucket["scope3_kg"] += row["scope3_kg"]
        bucket["total_kg"] += row["total_kg"]
        bucket["properties"].add(row["property_id"])

    result = _finalise(bucket)
    result["year"] = year or "all"
    result["reporting_years"] = available_reporting_years()
    result["national_intensity"] = result["kg_per_guest_night"]
    return result


def _group_by(rows: list[dict[str, Any]], key: str) -> dict[str, Any]:
    buckets: dict[str, dict[str, Any]] = defaultdict(_blank_bucket)
    for row in rows:
        buckets[str(row[key])]["guest_nights"] += row["guest_nights"]
        buckets[str(row[key])]["scope1_kg"] += row["scope1_kg"]
        buckets[str(row[key])]["scope2_kg"] += row["scope2_kg"]
        buckets[str(row[key])]["scope3_kg"] += row["scope3_kg"]
        buckets[str(row[key])]["total_kg"] += row["total_kg"]
        buckets[str(row[key])]["properties"].add(row["property_id"])
    return {name: _finalise(bucket) for name, bucket in buckets.items()}


def by_district(year: str | None = None) -> list[dict[str, Any]]:
    rows = _rows_for_year(year)
    grouped = _group_by(rows, "prop_district")
    repo = get_repository()
    districts = {d["name"]: d for d in repo.districts}

    out = []
    for name, stats in grouped.items():
        meta = districts.get(name, {})
        if stats["suppressed"]:
            # A group below the k threshold must not leak its totals, its
            # intensity or even its size through the API response.
            stats = _withhold(stats)
        out.append(
            {
                "district": name,
                "province": meta.get("province", "Unknown"),
                "lat": meta.get("lat"),
                "lng": meta.get("lng"),
                **stats,
            }
        )
    return sorted(out, key=lambda item: item["total_kg"], reverse=True)


def _withhold(stats: dict[str, Any]) -> dict[str, Any]:
    """Blank a group that is below the k threshold."""
    if not stats["suppressed"]:
        return stats
    return {
        **stats,
        "guest_nights": 0,
        "scope1_kg": 0.0,
        "scope2_kg": 0.0,
        "scope3_kg": 0.0,
        "total_kg": 0.0,
        "kg_per_guest_night": 0.0,
        "property_count": 0,
    }


def by_segment(year: str | None = None) -> list[dict[str, Any]]:
    rows = _rows_for_year(year)
    grouped = _group_by(rows, "prop_category")
    return [
        {"segment": segment, **_withhold(stats)}
        for segment, stats in sorted(grouped.items(), key=lambda kv: kv[1]["total_kg"], reverse=True)
    ]


def by_size_band(year: str | None = None) -> list[dict[str, Any]]:
    rows = _rows_for_year(year)
    grouped = _group_by(rows, "prop_size_band")
    return [
        {"size_band": band, **_withhold(stats)}
        for band, stats in sorted(grouped.items(), key=lambda kv: kv[1]["total_kg"], reverse=True)
    ]


def trends(year: str | None = None) -> list[dict[str, Any]]:
    """Month-by-month national totals, optionally restricted to one year."""
    rows = _rows_for_year(year)
    buckets: dict[str, dict[str, Any]] = defaultdict(_blank_bucket)
    for row in rows:
        buckets[row["period"]]["guest_nights"] += row["guest_nights"]
        buckets[row["period"]]["scope1_kg"] += row["scope1_kg"]
        buckets[row["period"]]["scope2_kg"] += row["scope2_kg"]
        buckets[row["period"]]["scope3_kg"] += row["scope3_kg"]
        buckets[row["period"]]["total_kg"] += row["total_kg"]
        buckets[row["period"]]["properties"].add(row["property_id"])

    out = []
    for period in sorted(buckets):
        stats = _finalise(buckets[period])
        out.append(
            {
                "period": period,
                "label": _period_label(period),
                "reporting_year": reporting_year(period),
                **stats,
            }
        )
    return out


def _period_label(period: str) -> str:
    year, month = (int(part) for part in period.split("-"))
    names = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]
    return f"{names[month - 1]} {year}"


def gis(year: str | None = None) -> list[dict[str, Any]]:
    """District level payload for the choropleth map.

    Suppressed districts are already blanked by `by_district`, so the map can
    be rendered straight from this response.
    """
    return by_district(year)


def pathway_scenario(
    year: str | None = None,
    scope2_reduction_pct: float = 0.0,
    scope1_reduction_pct: float = 0.0,
    scope3_reduction_pct: float = 0.0,
) -> dict[str, Any]:
    """Baseline vs scenario projection used by the 2030 pathway tool."""
    base = summary(year)
    s1 = base["scope1_kg"] * (1 - scope1_reduction_pct / 100)
    s2 = base["scope2_kg"] * (1 - scope2_reduction_pct / 100)
    s3 = base["scope3_kg"] * (1 - scope3_reduction_pct / 100)
    projected = s1 + s2 + s3
    return {
        "year": base["year"],
        "baseline_total_kg": base["total_kg"],
        "projected_total_kg": round(projected, 1),
        "avoided_kg": round(base["total_kg"] - projected, 1),
        "reduction_pct": round(
            (base["total_kg"] - projected) / base["total_kg"] * 100, 2
        ) if base["total_kg"] else 0.0,
        "scope1_kg": round(s1, 1),
        "scope2_kg": round(s2, 1),
        "scope3_kg": round(s3, 1),
        "assumptions": {
            "scope1_reduction_pct": scope1_reduction_pct,
            "scope2_reduction_pct": scope2_reduction_pct,
            "scope3_reduction_pct": scope3_reduction_pct,
        },
    }
