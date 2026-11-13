"""Acceptance checks against the running Owner module through its public HTTP API.

Run after starting API + web: python tools/check_owner.py
The default URL goes through Vite's real /api proxy. Uses only the standard library.
Mutates LOCAL DEMO data: budget (restored), one month sign-off, one guest receipt,
and one training job. Never run against production.
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.request


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='http://127.0.0.1:5180/api')
    args = parser.parse_args()
    base = args.base_url.rstrip('/')
    if not (base.startswith('http://127.0.0.1:') or base.startswith('http://localhost:')):
        raise SystemExit('This mutating demo acceptance check only permits loopback URLs.')

    def request(path: str, method: str = 'GET', body: dict | None = None, expected: int = 200):
        payload = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(base + path, data=payload, method=method,
                                     headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                status, content, content_type = res.status, res.read(), res.headers.get('Content-Type', '')
        except urllib.error.HTTPError as error:
            status, content, content_type = error.code, error.read(), error.headers.get('Content-Type', '')
        assert status == expected, (path, status, content[:500])
        return json.loads(content) if 'application/json' in content_type else content

    overview = request('/owner/overview?year=2026')
    assert overview['demo'] is True, 'Refusing mutations on non-demo data'
    assert len(overview['months']) == 12
    assert abs(sum(m['total_kg'] for m in overview['months']) - overview['totals']['total_kg']) < 0.2
    assert abs(sum(overview['totals'][s] for s in ('scope1_kg', 'scope2_kg', 'scope3_kg')) - overview['totals']['total_kg']) < 0.2
    print('PASS overview: 12 periods, scope and monthly totals reconcile')

    budget = overview['budget']['annual_kg']
    try:
        request('/owner/budget', 'PUT', {'annual_kg': 150000})
        assert request('/owner/overview?year=2026')['budget']['annual_kg'] == 150000
        request('/owner/budget', 'PUT', {'annual_kg': -1}, 422)
        print('PASS budget: persisted through separate HTTP reads, negatives rejected')
    finally:
        request('/owner/budget', 'PUT', {'annual_kg': budget})

    scenario = {'electricity_reduction_pct': 20, 'fuel_reduction_pct': 10,
                'scope3_reduction_pct': 5, 'investment_lkr': 250000, 'annual_savings_lkr': 50000}
    result = request('/owner/scenario', 'POST', scenario)
    assert result['projected_kg'] < result['baseline_kg']
    assert result['payback_years'] == 5
    request('/owner/scenario', 'POST', {**scenario, 'electricity_reduction_pct': 101}, 422)
    no_savings = request('/owner/scenario', 'POST', {**scenario, 'annual_savings_lkr': 0})
    assert no_savings['payback_years'] is None
    print('PASS scenario: reduction, payback, zero savings and range validation')

    pending = next((m for m in overview['months'] if m['status'] != 'signed_off'), None)
    if pending:
        request(f"/owner/months/{pending['id']}/sign-off", 'POST', {'signer_name': ''}, 422)
        signed = request(f"/owner/months/{pending['id']}/sign-off", 'POST', {'signer_name': 'Local Acceptance Tester'})
        assert signed['status'] == 'signed_off'
        request(f"/owner/months/{pending['id']}/sign-off", 'POST', {'signer_name': 'Local Acceptance Tester'}, 409)
        assert any(m['id'] == pending['id'] and m['status'] == 'signed_off' for m in request('/owner/overview?year=2026')['months'])
        print('PASS sign-off: saved transition, blank signer rejected, repeat rejected')

    receipt = request('/owner/guest-receipt', 'POST', {'guest_nights': 2, 'period': '2026-10'})
    assert receipt['kg_co2e'] > 0 and receipt['demo'] is True
    assert receipt['verification_url'] is None
    request('/owner/guest-receipt', 'POST', {'guest_nights': 0, 'period': '2026-10'}, 422)
    request('/owner/guest-receipt', 'POST', {'guest_nights': 1, 'period': '2026-99'}, 422)
    print('PASS receipt: allocated emissions, no fake public verification, invalid inputs rejected')

    assert b'<html' in request('/owner/report?year=2026').lower()
    assert b'period' in request('/owner/report.csv?year=2026').lower()
    assert request('/owner/report.pdf?year=2026').startswith(b'%PDF')
    print('PASS reports: HTML, CSV and genuine PDF delivered over HTTP')

    forecast = request('/owner/forecast')
    assert forecast['points'] and forecast['training_data'] == 'demo'
    assert all(p['lower_kg'] <= p['predicted_kg'] <= p['upper_kg'] for p in forecast['points'])
    job = request('/owner/jobs/retrain', 'POST', {}, 202)
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        jobs = request('/owner/jobs')
        finished = next((j for j in jobs if j['id'] == job['id']), None)
        if finished and finished['status'] in ('completed', 'failed'):
            assert finished['status'] == 'completed', finished
            break
        time.sleep(0.25)
    else:
        raise AssertionError('Training job never reached a completed state')
    assert request('/owner/audit')
    print('PASS forecasts/jobs: labelled predictions, sensible bounds, completed persistent training job, audit log')
    print('PASS: owner module public HTTP acceptance checks completed')


if __name__ == '__main__':
    main()
