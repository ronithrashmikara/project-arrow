"""Data access for the policy dashboard.

Today this reads the local deterministic seed file so the dashboard runs with
zero infrastructure. The repository is the seam where the Supabase/Postgres
(RLS-protected) source will be plugged in later - the service layer above it
does not care where the rows come from.
"""

from __future__ import annotations

import json
import threading
from functools import lru_cache
from pathlib import Path
from typing import Any

SEED_FILE = Path(__file__).resolve().parent / "seed" / "data.json"


class PolicyRepository:
    """Loads the dataset once and hands out plain dict rows."""

    def __init__(self, seed_file: Path = SEED_FILE) -> None:
        self._seed_file = seed_file
        self._lock = threading.Lock()
        self._data: dict[str, Any] | None = None

    # -- loading -----------------------------------------------------------
    def _load(self) -> dict[str, Any]:
        if self._data is None:
            with self._lock:
                if self._data is None:
                    if not self._seed_file.exists():
                        raise FileNotFoundError(
                            f"Seed file missing at {self._seed_file}. "
                            "Run: python apps/api/app/policy/seed/generate.py"
                        )
                    self._data = json.loads(self._seed_file.read_text(encoding="utf-8"))
        return self._data

    def reload(self) -> None:
        with self._lock:
            self._data = None
        self._load()

    # -- tables ------------------------------------------------------------
    @property
    def districts(self) -> list[dict[str, Any]]:
        return self._load()["districts"]

    @property
    def properties(self) -> list[dict[str, Any]]:
        return self._load()["properties"]

    @property
    def submissions(self) -> list[dict[str, Any]]:
        return self._load()["submissions"]

    @property
    def meta(self) -> dict[str, Any]:
        return self._load()["meta"]

    # -- helpers -----------------------------------------------------------
    def property_index(self) -> dict[str, dict[str, Any]]:
        return {p["id"]: p for p in self.properties}


@lru_cache(maxsize=1)
def get_repository() -> PolicyRepository:
    return PolicyRepository()
