"""Tests for the policy dashboard API.

Run from apps/api:
    .\\.venv\\Scripts\\Activate.ps1
    pytest -q
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.policy.service import K_MIN_PROPERTIES, reporting_year

client = TestClient(app)


def test_health_reports_dataset() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["districts"] == 25
    assert body["properties"] > 0


def test_reporting_year_starts_in_april() -> None:
    assert reporting_year("2025-04") == "2025/26"
    assert reporting_year("2026-03") == "2025/26"
    assert reporting_year("2025-12") == "2025/26"


def test_periods_lists_reporting_years() -> None:
    body = client.get("/policy/periods").json()
    assert "2025/26" in body["reporting_years"]
    assert body["reporting_year_start"] == "April"


def test_summary_totals_are_consistent() -> None:
    body = client.get("/policy/summary?year=2025/26").json()
    assert body["total_kg"] == pytest_approx(
        body["scope1_kg"] + body["scope2_kg"] + body["scope3_kg"]
    )
    assert body["kg_per_guest_night"] > 0
    assert body["property_count"] >= K_MIN_PROPERTIES


def pytest_approx(value: float) -> float:
    return round(value, 1)


def test_small_districts_are_suppressed() -> None:
    """No group below the k threshold may leak totals or its size."""
    districts = client.get("/policy/by-district?year=2025/26").json()
    assert districts, "expected district aggregates"

    for district in districts:
        if district["suppressed"]:
            assert district["total_kg"] == 0.0
            assert district["kg_per_guest_night"] == 0.0
            assert district["guest_nights"] == 0
            assert district["property_count"] == 0
        else:
            assert district["property_count"] >= K_MIN_PROPERTIES


def test_gis_payload_never_leaks_suppressed_values() -> None:
    gis = client.get("/policy/gis?year=2025/26").json()
    for district in gis:
        if district["suppressed"]:
            assert district["total_kg"] == 0.0


def test_segments_are_suppressed_when_small() -> None:
    segments = client.get("/policy/by-segment?year=2025/26").json()
    for segment in segments:
        if segment["suppressed"]:
            assert segment["total_kg"] == 0.0
            assert segment["property_count"] == 0


def test_unknown_year_returns_404() -> None:
    response = client.get("/policy/summary?year=1999/00")
    assert response.status_code == 404


def test_pathway_scenario_reduces_emissions() -> None:
    baseline = client.get("/policy/summary?year=2025/26").json()
    scenario = client.get(
        "/policy/pathway?year=2025/26&scope2_reduction_pct=20"
    ).json()
    assert scenario["projected_total_kg"] < scenario["baseline_total_kg"]
    assert scenario["baseline_total_kg"] == pytest_approx(baseline["total_kg"])
    assert scenario["reduction_pct"] > 0


def test_endpoints_do_not_expose_property_names() -> None:
    for path in ("/policy/summary", "/policy/by-district", "/policy/by-segment", "/policy/trends"):
        response = client.get(f"{path}?year=2025/26")
        assert response.status_code == 200
        assert "Resort" not in response.text
        assert "Lodge" not in response.text
