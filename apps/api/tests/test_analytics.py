"""Tests for the analytical views behind the national dashboard."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.policy.analytics import CATEGORY_GROUPS, _quartiles

client = TestClient(app)


def test_quartiles_and_outliers() -> None:
    stats = _quartiles([1, 2, 3, 4, 5, 6, 7, 8, 9, 100])
    assert stats["median"] == 5.5
    assert stats["q1"] <= stats["median"] <= stats["q3"]
    assert 100 in stats["outliers"]
    assert stats["upper_whisker"] <= stats["max"]


def test_quartiles_empty_input() -> None:
    assert _quartiles([]) == {}


def test_overview_exposes_headline_kpis() -> None:
    body = client.get("/policy/overview?year=2025/26").json()
    assert body["properties_reporting"] > 0
    assert body["total_co2e_tonnes"] > 0
    assert body["median_intensity"] > 0
    assert 0 < body["grid_share_pct"] <= 100
    assert body["reporting_years"] == ["2024/25", "2025/26"]


def test_overview_without_a_year_does_not_crash() -> None:
    response = client.get("/policy/overview")
    assert response.status_code == 200


def test_seasonality_without_a_year_falls_back() -> None:
    response = client.get("/policy/seasonality")
    assert response.status_code == 200
    body = response.json()
    assert body["points"], "expected a monthly series"
    seasons = {point["season"] for point in body["points"]}
    assert seasons == {"peak", "off-peak"}


def test_seasonality_covers_twelve_months() -> None:
    body = client.get("/policy/seasonality?year=2025/26").json()
    assert len(body["points"]) == 12


def test_district_stats_suppress_small_groups() -> None:
    districts = client.get("/policy/district-stats?year=2025/26").json()
    assert districts
    for district in districts:
        if district["suppressed"]:
            assert district["total_kg"] == 0.0
            assert district["median_intensity"] == 0.0
            assert district["property_count"] == 0
        else:
            assert district["property_count"] >= 5
            assert district["median_intensity"] > 0


def test_category_stats_cover_every_group() -> None:
    categories = client.get("/policy/category-stats?year=2025/26").json()
    assert len(categories) == len(CATEGORY_GROUPS)
    for category in categories:
        if category["suppressed"]:
            assert category["values"] == []
        else:
            assert category["property_count"] >= 5
            assert category["q1"] <= category["median"] <= category["q3"]


def test_leaderboard_never_returns_real_names() -> None:
    body = client.get("/policy/leaderboard?year=2025/26").json()
    assert body["k_threshold"] == 5
    for entry in body["entries"]:
        assert entry["pseudonym"].startswith("Property ")
        assert entry["tier"] in {"Leader", "Good", "Needs improvement"}
    assert "Resort" not in str(body)
    assert "Lodge" not in str(body)


def test_leaderboard_groups_respect_k_threshold() -> None:
    body = client.get("/policy/leaderboard?year=2025/26").json()
    sizes: dict[tuple[str, str], int] = {}
    for entry in body["entries"]:
        key = (entry["category_group"], entry["size_band"])
        sizes[key] = sizes.get(key, 0) + 1
    assert all(count >= 5 for count in sizes.values())


def test_baseline_report_is_engine_derived() -> None:
    body = client.get("/policy/baseline-report?year=2025/26").json()
    assert body["sections"]
    assert len(body["dataset_hash"]) == 64
    assert body["badge"].startswith("Auto-drafted")
    for section in body["sections"]:
        assert section["heading"] and section["body"]


def test_dataset_hash_is_stable() -> None:
    first = client.get("/policy/baseline-report?year=2025/26").json()["dataset_hash"]
    second = client.get("/policy/baseline-report?year=2024/25").json()["dataset_hash"]
    assert first == second, "the citation must identify the dataset, not the year"


def test_csv_export_is_anonymised() -> None:
    response = client.get("/policy/export.csv?year=2025/26")
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    body = response.text
    assert "district" in body.splitlines()[0]
    assert "Resort" not in body
    assert "Lodge" not in body
