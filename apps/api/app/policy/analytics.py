"""Analytical aggregations behind the national dashboard views.

Everything here works on property-level aggregates and never exposes a
property name, contact or raw bill. Groups below the k threshold are
suppressed, exactly like the headline aggregates.
"""

from __future__ import annotations

import hashlib
import statistics
from collections import defaultdict
from typing import Any

from .repository import get_repository
from .service import (
    K_MIN_PROPERTIES,
    REPORTING_YEAR_START_MONTH,
    _rows_for_year,
    available_reporting_years,
    reporting_year,
)

PEAK_MONTHS = {12, 1, 2}

# SLTDA-style category groups used by the box plot.
CATEGORY_GROUPS: dict[str, list[str]] = {
    "Tourist Hotel 1-5*": ["Tourist Hotel 3*", "Tourist Hotel 4*", "Tourist Hotel 5*"],
    "Boutique Hotel / Villa": ["Boutique Hotel", "Bungalow"],
    "Guest House A/B/C & B&B": ["Guest House A", "Guest House B"],
    "Heritage Bungalow": ["Heritage Bungalow"],
    "Homestay / Rented": ["Homestay", "Rented Home", "Not registered"],
}

CATEGORY_LOOKUP: dict[str, str] = {
    category: group for group, members in CATEGORY_GROUPS.items() for category in members
}

PSEUDONYM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"


def _quartiles(values: list[float]) -> dict[str, float]:
    """Tukey hinges - quartiles plus whiskers and outliers for the box plot."""
    if not values:
        return {}
    ordered = sorted(values)
    q1, _, q3 = statistics.quantiles(ordered, n=4, method="inclusive") if len(ordered) > 1 else (
        ordered[0],
        ordered[0],
        ordered[0],
    )
    iqr = q3 - q1
    low_fence = q1 - 1.5 * iqr
    high_fence = q3 + 1.5 * iqr
    whiskers = [value for value in ordered if low_fence <= value <= high_fence]
    outliers = [value for value in ordered if value > high_fence or value < low_fence]
    return {
        "min": round(ordered[0], 2),
        "q1": round(q1, 2),
        "median": round(statistics.median(ordered), 2),
        "q3": round(q3, 2),
        "max": round(ordered[-1], 2),
        "lower_whisker": round(whiskers[0] if whiskers else ordered[0], 2),
        "upper_whisker": round(whiskers[-1] if whiskers else ordered[-1], 2),
        "outliers": [round(value, 2) for value in outliers],
        "mean": round(statistics.fmean(ordered), 2),
    }


def property_records(year: str | None = None) -> list[dict[str, Any]]:
    """One aggregated record per property for the selected reporting year."""
    rows = _rows_for_year(year)
    grouped: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "guest_nights": 0,
            "scope1_kg": 0.0,
            "scope2_kg": 0.0,
            "scope3_kg": 0.0,
            "total_kg": 0.0,
            "months": 0,
        }
    )
    meta: dict[str, dict[str, Any]] = {}

    for row in rows:
        bucket = grouped[row["property_id"]]
        bucket["guest_nights"] += row["guest_nights"]
        bucket["scope1_kg"] += row["scope1_kg"]
        bucket["scope2_kg"] += row["scope2_kg"]
        bucket["scope3_kg"] += row["scope3_kg"]
        bucket["total_kg"] += row["total_kg"]
        bucket["months"] += 1
        meta[row["property_id"]] = {
            "district": row["prop_district"],
            "category": row["prop_category"],
            "size_band": row["prop_size_band"],
            "rooms": row["prop_rooms"],
        }

    records = []
    for property_id, bucket in grouped.items():
        guest_nights = bucket["guest_nights"]
        records.append(
            {
                "property_id": property_id,
                **meta[property_id],
                "category_group": CATEGORY_LOOKUP.get(meta[property_id]["category"], "Homestay / Rented"),
                "guest_nights": guest_nights,
                "scope1_kg": round(bucket["scope1_kg"], 1),
                "scope2_kg": round(bucket["scope2_kg"], 1),
                "scope3_kg": round(bucket["scope3_kg"], 1),
                "total_kg": round(bucket["total_kg"], 1),
                "kg_per_guest_night": round(bucket["total_kg"] / guest_nights, 2) if guest_nights else 0.0,
                "months_reported": bucket["months"],
                "complete": bucket["months"] >= 10,
            }
        )
    return records


def _pseudonym(property_id: str) -> str:
    """Stable, non-reversible display name - e.g. 'Property H-42'."""
    digest = hashlib.sha256(property_id.encode("utf-8")).digest()
    letter = PSEUDONYM_ALPHABET[digest[0] % len(PSEUDONYM_ALPHABET)]
    number = 10 + (int.from_bytes(digest[1:3], "big") % 89)
    return f"Property {letter}-{number}"


def overview(year: str | None = None) -> dict[str, Any]:
    """Headline KPIs for the national overview cards."""
    rows = _rows_for_year(year)
    records = property_records(year)

    guest_nights = sum(row["guest_nights"] for row in rows)
    scope1 = sum(row["scope1_kg"] for row in rows)
    scope2 = sum(row["scope2_kg"] for row in rows)
    scope3 = sum(row["scope3_kg"] for row in rows)
    total = scope1 + scope2 + scope3

    intensities = [record["kg_per_guest_night"] for record in records]
    median_intensity = round(statistics.median(intensities), 2) if intensities else 0.0

    previous = _previous_year(year)
    deltas: dict[str, Any] = {}
    if previous:
        previous_rows = _rows_for_year(previous)
        previous_total = sum(row["total_kg"] for row in previous_rows)
        previous_records = property_records(previous)
        previous_intensities = [r["kg_per_guest_night"] for r in previous_records]
        previous_median = round(statistics.median(previous_intensities), 2) if previous_intensities else 0.0
        previous_properties = len(previous_records)
        deltas = {
            "properties_vs_previous": len(records) - previous_properties,
            "total_kg_change_pct": round((total - previous_total) / previous_total * 100, 1)
            if previous_total
            else 0.0,
            "median_intensity_change": round(median_intensity - previous_median, 2),
            "previous_year": previous,
        }

    return {
        "year": year or "all",
        "reporting_years": available_reporting_years(),
        "properties_reporting": len(records),
        "total_co2e_kg": round(total, 1),
        "total_co2e_tonnes": round(total / 1000, 1),
        "median_intensity": median_intensity,
        "grid_share_pct": round(scope2 / total * 100, 1) if total else 0.0,
        "scope1_kg": round(scope1, 1),
        "scope2_kg": round(scope2, 1),
        "scope3_kg": round(scope3, 1),
        "guest_nights": guest_nights,
        "deltas": deltas,
        "estimated_properties": sum(1 for record in records if not record["complete"]),
    }


def _previous_year(year: str | None) -> str | None:
    if not year:
        return None
    years = available_reporting_years()
    index = years.index(year) if year in years else -1
    if index <= 0:
        return None
    return years[index - 1]


def district_stats(year: str | None = None) -> list[dict[str, Any]]:
    """Heat-map payload: district totals plus the median property intensity."""
    records = property_records(year)
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        grouped[record["district"]].append(record)

    repo = get_repository()
    districts = {district["name"]: district for district in repo.districts}

    out = []
    for name, group in grouped.items():
        intensities = [item["kg_per_guest_night"] for item in group]
        total = sum(item["total_kg"] for item in group)
        guest_nights = sum(item["guest_nights"] for item in group)
        scope1 = sum(item["scope1_kg"] for item in group)
        scope2 = sum(item["scope2_kg"] for item in group)
        scope3 = sum(item["scope3_kg"] for item in group)
        suppressed = len(group) < K_MIN_PROPERTIES
        meta = districts.get(name, {})
        out.append(
            {
                "district": name,
                "province": meta.get("province", "Unknown"),
                "lat": meta.get("lat"),
                "lng": meta.get("lng"),
                "property_count": 0 if suppressed else len(group),
                "total_kg": 0.0 if suppressed else round(total, 1),
                "guest_nights": 0 if suppressed else guest_nights,
                "scope1_kg": 0.0 if suppressed else round(scope1, 1),
                "scope2_kg": 0.0 if suppressed else round(scope2, 1),
                "scope3_kg": 0.0 if suppressed else round(scope3, 1),
                "median_intensity": 0.0 if suppressed else round(statistics.median(intensities), 2),
                "min_intensity": 0.0 if suppressed else round(min(intensities), 2),
                "max_intensity": 0.0 if suppressed else round(max(intensities), 2),
                "kg_per_guest_night": 0.0
                if suppressed
                else round(total / guest_nights, 2) if guest_nights else 0.0,
                "suppressed": suppressed,
            }
        )
    return sorted(out, key=lambda item: item["median_intensity"], reverse=True)


def category_stats(year: str | None = None) -> list[dict[str, Any]]:
    """Box-plot payload per SLTDA category group."""
    records = property_records(year)
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        grouped[record["category_group"]].append(record)

    out = []
    for group_name, members in CATEGORY_GROUPS.items():
        items = grouped.get(group_name, [])
        suppressed = len(items) < K_MIN_PROPERTIES
        stats = _quartiles([item["kg_per_guest_night"] for item in items])
        out.append(
            {
                "category": group_name,
                "property_count": 0 if suppressed else len(items),
                "suppressed": suppressed,
                **({} if suppressed else stats),
                "values": [] if suppressed else [item["kg_per_guest_night"] for item in items],
            }
        )
    return out


def _resolve_year(year: str | None) -> str | None:
    """Fall back to the most recent reporting year when none is requested."""
    if year:
        return year
    years = available_reporting_years()
    return years[-1] if years else None


def seasonality(year: str | None = None) -> dict[str, Any]:
    """Peak vs off-season monthly series across the reporting year."""
    year = _resolve_year(year)
    if not year:
        return {"points": [], "peak_average_intensity": 0.0, "off_peak_average_intensity": 0.0, "peak_months": []}

    rows = _rows_for_year(year)
    monthly: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"total_kg": 0.0, "guest_nights": 0, "properties": set()}
    )
    for row in rows:
        bucket = monthly[row["period"]]
        bucket["total_kg"] += row["total_kg"]
        bucket["guest_nights"] += row["guest_nights"]
        bucket["properties"].add(row["property_id"])

    start_year = int(year.split("/")[0])
    months = [f"{start_year}-{month:02d}" for month in range(4, 13)] + [
        f"{start_year + 1}-{month:02d}" for month in range(1, 4)
    ]

    points = []
    for period in months:
        bucket = monthly.get(period)
        if not bucket:
            continue
        month_number = int(period.split("-")[1])
        points.append(
            {
                "period": period,
                "label": _month_label(period),
                "season": "peak" if month_number in PEAK_MONTHS else "off-peak",
                "total_kg": round(bucket["total_kg"], 1),
                "kg_per_guest_night": round(bucket["total_kg"] / bucket["guest_nights"], 2)
                if bucket["guest_nights"]
                else 0.0,
                "guest_nights": bucket["guest_nights"],
            }
        )

    peak = [point for point in points if point["season"] == "peak"]
    off_peak = [point for point in points if point["season"] == "off-peak"]
    return {
        "points": points,
        "peak_average_intensity": round(
            statistics.fmean([point["kg_per_guest_night"] for point in peak]), 2
        )
        if peak
        else 0.0,
        "off_peak_average_intensity": round(
            statistics.fmean([point["kg_per_guest_night"] for point in off_peak]), 2
        )
        if off_peak
        else 0.0,
        "peak_months": sorted({point["label"] for point in peak}),
    }


def _month_label(period: str) -> str:
    year, month = (int(part) for part in period.split("-"))
    names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return f"{names[month - 1]} {year}"


def leaderboard(year: str | None = None) -> dict[str, Any]:
    """Pseudonymised ranking. Real property names are never returned."""
    records = [record for record in property_records(year) if record["complete"]]

    groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        groups[(record["category_group"], record["size_band"])].append(record)

    entries: list[dict[str, Any]] = []
    for (category_group, size_band), members in groups.items():
        if len(members) < K_MIN_PROPERTIES:
            continue  # whole group suppressed: k >= 5
        intensities = sorted(member["kg_per_guest_night"] for member in members)
        median = statistics.median(intensities)
        ordered = sorted(members, key=lambda item: item["kg_per_guest_night"])
        for rank, member in enumerate(ordered, start=1):
            value = member["kg_per_guest_night"]
            if value <= median * 0.85:
                tier = "Leader"
            elif value <= median * 1.15:
                tier = "Good"
            else:
                tier = "Needs improvement"
            entries.append(
                {
                    "pseudonym": _pseudonym(member["property_id"]),
                    "category_group": category_group,
                    "size_band": size_band,
                    "rank": rank,
                    "kg_per_guest_night": value,
                    "group_median": round(median, 2),
                    "tier": tier,
                    "guest_nights": member["guest_nights"],
                }
            )

    entries.sort(key=lambda item: (item["category_group"], item["rank"]))
    return {
        "entries": entries,
        "groups": len({(entry["category_group"], entry["size_band"]) for entry in entries}),
        "k_threshold": K_MIN_PROPERTIES,
    }


def export_rows(year: str | None = None) -> list[dict[str, Any]]:
    """Rows for the CSV / JSON export - district level only."""
    return district_stats(year)


def dataset_hash() -> str:
    """SHA-256 of the dataset behind the current figures."""
    repo = get_repository()
    payload = "\n".join(
        f"{record['property_id']}|{record['period']}|{record['total_kg']}"
        for record in repo.submissions
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def baseline_report(year: str | None = None) -> dict[str, Any]:
    """Deterministic national baseline brief.

    The prose is template-generated from engine figures; it is never produced
    by a language model, so no number can be invented.
    """
    overview_data = overview(year)
    districts = district_stats(year)
    categories = category_stats(year)
    season = seasonality(year)

    published = [district for district in districts if not district["suppressed"]]
    top = published[0] if published else None
    cleanest = min(published, key=lambda item: item["median_intensity"]) if published else None

    lines = [
        {
            "heading": "Scope and coverage",
            "body": (
                f"Reporting year {overview_data['year']}: {overview_data['properties_reporting']} "
                f"consented properties reported {overview_data['guest_nights']:,} guest nights. "
                f"National emissions were {overview_data['total_co2e_tonnes']:,} t CO2e "
                f"(Scope 1 {overview_data['scope1_kg'] / 1000:,.1f} t, Scope 2 "
                f"{overview_data['scope2_kg'] / 1000:,.1f} t, Scope 3 "
                f"{overview_data['scope3_kg'] / 1000:,.1f} t)."
            ),
        },
        {
            "heading": "Intensity and drivers",
            "body": (
                f"Median emissions intensity was {overview_data['median_intensity']} kg CO2e per guest night. "
                f"Purchased grid electricity accounted for {overview_data['grid_share_pct']}% of the total, "
                "making it the dominant single source. "
                f"Peak-season intensity averaged {season['peak_average_intensity']} kg CO2e per guest night "
                f"against {season['off_peak_average_intensity']} kg CO2e off-peak."
            ),
        },
        {
            "heading": "Geographic and segment picture",
            "body": (
                (
                    f"{top['district']} recorded the highest median intensity at "
                    f"{top['median_intensity']} kg CO2e per guest night across {top['property_count']} properties. "
                    if top
                    else "No district met the k >= 5 publication threshold this year. "
                )
                + (
                    f"{cleanest['district']} was the lowest at {cleanest['median_intensity']} kg CO2e per guest night. "
                    if cleanest and cleanest is not top
                    else ""
                )
                + "District groups below five consenting properties are suppressed."
            ),
        },
        {
            "heading": "Method and limitations",
            "body": (
                "Figures are deterministic outputs of the GHG engine using versioned Sri Lankan emission "
                "factors. They are estimates, not a certified audit. Property-level identities are never "
                "exposed in this view and all groups are published only at k >= 5."
            ),
        },
    ]

    return {
        "year": overview_data["year"],
        "generated_for": "Government / UN analyst national baseline",
        "badge": "Auto-drafted summary - engine-verified figures",
        "sections": lines,
        "dataset_hash": dataset_hash(),
        "properties_reporting": overview_data["properties_reporting"],
        "suppressed_districts": sum(1 for district in districts if district["suppressed"]),
        "categories": [
            {
                "category": category["category"],
                "property_count": category["property_count"],
                "median": category.get("median"),
                "suppressed": category["suppressed"],
            }
            for category in categories
        ],
    }


def to_csv(rows: list[dict[str, Any]], year: str | None = None) -> str:
    """CSV export of the district aggregates (k >= 5 applied upstream)."""
    header = [
        "reporting_year",
        "district",
        "province",
        "properties",
        "guest_nights",
        "scope1_kg",
        "scope2_kg",
        "scope3_kg",
        "total_kg",
        "kg_per_guest_night",
        "median_intensity",
        "suppressed",
    ]
    lines = [",".join(header)]
    for row in rows:
        values = [
            str(year or "all"),
            row["district"],
            row["province"],
            str(row["property_count"]),
            str(row["guest_nights"]),
            str(row["scope1_kg"]),
            str(row["scope2_kg"]),
            str(row["scope3_kg"]),
            str(row["total_kg"]),
            str(row["kg_per_guest_night"]),
            str(row["median_intensity"]),
            "yes" if row["suppressed"] else "no",
        ]
        lines.append(",".join(f'"{value}"' for value in values))
    return "\n".join(lines)
