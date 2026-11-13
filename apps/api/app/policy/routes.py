"""HTTP API for the national policy dashboard (R5 Policy Analyst)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from . import service

router = APIRouter(prefix="/policy", tags=["policy"])


def _validate_year(year: str | None) -> str | None:
    if year is None:
        return None
    if year not in service.available_reporting_years():
        raise HTTPException(
            status_code=404,
            detail=(
                f"Unknown reporting year '{year}'. "
                f"Available: {', '.join(service.available_reporting_years())}"
            ),
        )
    return year


@router.get("/periods")
def periods() -> dict:
    """Reporting years available in the dataset."""
    return {
        "reporting_years": service.available_reporting_years(),
        "reporting_year_start": "April",
    }


@router.get("/summary")
def summary(year: str | None = Query(default=None, description="e.g. 2025/26")) -> dict:
    """National headline figures for the selected reporting year."""
    return service.summary(_validate_year(year))


@router.get("/by-district")
def by_district(year: str | None = Query(default=None)) -> list[dict]:
    """Aggregated emissions per district (k >= 5 suppression applied)."""
    return service.by_district(_validate_year(year))


@router.get("/by-segment")
def by_segment(year: str | None = Query(default=None)) -> list[dict]:
    """Aggregated emissions per property segment (hotel category)."""
    return service.by_segment(_validate_year(year))


@router.get("/by-size-band")
def by_size_band(year: str | None = Query(default=None)) -> list[dict]:
    """Aggregated emissions per size band."""
    return service.by_size_band(_validate_year(year))


@router.get("/trends")
def trends(year: str | None = Query(default=None)) -> list[dict]:
    """Month-by-month national trend."""
    return service.trends(_validate_year(year))


@router.get("/gis")
def gis(year: str | None = Query(default=None)) -> list[dict]:
    """District payload for the choropleth map."""
    return service.gis(_validate_year(year))


@router.get("/pathway")
def pathway(
    year: str | None = Query(default=None),
    scope1_reduction_pct: float = Query(default=0.0, ge=0, le=100),
    scope2_reduction_pct: float = Query(default=0.0, ge=0, le=100),
    scope3_reduction_pct: float = Query(default=0.0, ge=0, le=100),
) -> dict:
    """Baseline vs scenario projection (2030 pathway sandbox)."""
    return service.pathway_scenario(
        year=_validate_year(year),
        scope1_reduction_pct=scope1_reduction_pct,
        scope2_reduction_pct=scope2_reduction_pct,
        scope3_reduction_pct=scope3_reduction_pct,
    )
