"""Browser smoke test + screenshot for the policy dashboard.

Uses the Edge browser already installed on the machine (no browser download).

    .\\.venv\\Scripts\\python.exe scripts/screenshot.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT_DIR = Path(__file__).resolve().parents[2] / "screenshots"
BASE = "http://localhost:5173"

PAGES = [
    ("national-overview", "/policy"),
    ("by-district", "/policy/district"),
    ("by-category", "/policy/category"),
    ("leaderboard", "/policy/leaderboard"),
    ("baseline-report", "/policy/report"),
    ("data-export", "/policy/export"),
    ("pathway", "/policy/pathway"),
]


def main() -> int:
    OUT_DIR.mkdir(exist_ok=True)
    failures: list[str] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge", headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        console_errors: list[str] = []
        page.on(
            "console",
            lambda message: console_errors.append(f"{message.type}: {message.text}")
            if message.type == "error"
            else None,
        )
        page.on("pageerror", lambda error: console_errors.append(f"pageerror: {error}"))

        for name, path in PAGES:
            console_errors.clear()
            page.goto(f"{BASE}{path}", wait_until="networkidle")
            page.wait_for_timeout(1200)
            page.screenshot(path=str(OUT_DIR / f"{name}.png"), full_page=False)

            body = page.inner_text("body")
            if "Could not load data" in body:
                failures.append(f"{name}: API error banner")
            if len(body) < 200:
                failures.append(f"{name}: page looks empty ({len(body)} chars)")
            if console_errors:
                failures.append(f"{name}: console -> {console_errors[:3]}")

            print(f"{name:20s} ok  ({len(body)} chars)")

        browser.close()

    if failures:
        print("\nFAILURES:")
        for failure in failures:
            print(f"  - {failure}")
        return 1

    print(f"\nAll pages rendered cleanly. Screenshots in {OUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
