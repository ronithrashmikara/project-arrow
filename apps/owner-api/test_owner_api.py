import csv
import importlib.util
import io
import json
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def module(tmp_path, monkeypatch):
    monkeypatch.setenv('ARROW_DB_PATH', str(tmp_path / 'owner.sqlite3'))
    spec = importlib.util.spec_from_file_location('owner_main', Path(__file__).with_name('main.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def client(module):
    with TestClient(module.app) as client:
        yield client


def test_health_totals_seed_and_persistence(client, module):
    assert client.get('/health').json() == {'status': 'ok', 'storage': 'sqlite', 'demo': True}
    data = client.get('/owner/overview?year=2026').json()
    assert data['hotel'] == {'id': 1, 'name': 'Arrow Demo Hotel'}
    assert data['demo'] is True
    assert len(data['months']) == 12
    for key in ('scope1_kg', 'scope2_kg', 'scope3_kg', 'total_kg', 'guest_nights'):
        assert data['totals'][key] == sum(row[key] for row in data['months'])
    assert data['totals']['kg_per_guest_night'] == pytest.approx(data['totals']['total_kg'] / data['totals']['guest_nights'])
    assert client.put('/owner/budget', json={'annual_kg': 123456}).json() == {'annual_kg': 123456}
    with TestClient(module.create_app()) as restarted:
        assert restarted.get('/owner/overview').json()['budget']['annual_kg'] == 123456
        assert len(restarted.get('/owner/overview?year=2025').json()['months']) == 12
    with sqlite3.connect(module.app.state.db_path) as db:
        assert db.execute('SELECT count(*) FROM months').fetchone()[0] == 24
        assert db.execute('SELECT count(*) FROM hotel').fetchone()[0] == 1


@pytest.mark.parametrize('year', ['1999', '2101', 'abc', '2026-01', '2026.5'])
def test_invalid_year(client, year):
    for route in ('overview', 'report', 'report.csv', 'report.pdf'):
        assert client.get(f'/owner/{route}?year={year}').status_code == 422


def test_no_data_and_no_api_prefix(client):
    assert client.get('/owner/overview?year=2024').status_code == 404
    assert client.get('/api/owner/overview').status_code == 404


SCENARIO = dict(electricity_reduction_pct=10, fuel_reduction_pct=20, scope3_reduction_pct=30, investment_lkr=1000, annual_savings_lkr=250)


def test_scenario(client):
    t = client.get('/owner/overview').json()['totals']
    r = client.post('/owner/scenario', json=SCENARIO).json()
    avoided = t['scope1_kg'] * .2 + t['scope2_kg'] * .1 + t['scope3_kg'] * .3
    assert r['avoided_kg'] == pytest.approx(avoided)
    assert r['projected_kg'] == pytest.approx(t['total_kg'] - avoided)
    assert r['reduction_pct'] == pytest.approx(avoided / t['total_kg'] * 100)
    assert r['payback_years'] == 4
    assert client.post('/owner/scenario', json=SCENARIO | {'annual_savings_lkr': 0}).json()['payback_years'] is None
    all_reduced = SCENARIO | dict(electricity_reduction_pct=100, fuel_reduction_pct=100, scope3_reduction_pct=100)
    assert client.post('/owner/scenario', json=all_reduced).json()['projected_kg'] == 0


@pytest.mark.parametrize('key,value', [('electricity_reduction_pct', -1), ('fuel_reduction_pct', 101), ('scope3_reduction_pct', 'NaN'), ('investment_lkr', -1), ('annual_savings_lkr', 'Infinity')])
def test_bad_scenario(client, key, value):
    assert client.post('/owner/scenario', json=SCENARIO | {key: value}).status_code == 422


@pytest.mark.parametrize('value', [-1, 'NaN', 'Infinity', None])
def test_bad_budget(client, value):
    assert client.put('/owner/budget', json={'annual_kg': value}).status_code == 422


def test_signoff_audit_reports_escape(client, module):
    month = client.get('/owner/overview').json()['months'][0]
    route = f"/owner/months/{month['id']}/sign-off"
    for name in ('Ronith', '  ', '123 456'):
        assert client.post(route, json={'signer_name': name}).status_code == 422
    name = '<script>alert(1)</script> Ronith'
    signed = client.post(route, json={'signer_name': name}).json()
    assert signed['status'] == 'signed_off'
    assert 'not authentication' in signed['signoff_method']
    assert client.post(route, json={'signer_name': 'Ronith Owner'}).status_code == 409
    assert client.post('/owner/months/999/sign-off', json={'signer_name': 'Ronith Owner'}).status_code == 404
    audit = client.get('/owner/audit').json()
    assert len(audit) == 1
    assert audit[0]['details']['signer_name'] == name
    assert audit[0]['details']['authentication'] is False
    report = client.get('/owner/report?year=2026')
    assert 'attachment;' in report.headers['content-disposition']
    assert '<script>' not in report.text
    assert '&lt;script&gt;' in report.text
    assert 'signed_off' in report.text
    rows = list(csv.DictReader(io.StringIO(client.get('/owner/report.csv').text)))
    assert len(rows) == 12
    assert rows[0]['signer_name'] == name
    with TestClient(module.create_app()) as restarted:
        assert restarted.get('/owner/audit').json() == audit
        assert restarted.get('/owner/overview').json()['months'][0]['status'] == 'signed_off'


def test_csv_formula_escape(client):
    month = client.get('/owner/overview').json()['months'][0]
    client.post(f"/owner/months/{month['id']}/sign-off", json={'signer_name': '=SUM(A1) Owner'})
    assert "'=SUM(A1) Owner" in client.get('/owner/report.csv').text


def test_receipt_saved_allocation(client, module):
    month = client.get('/owner/overview').json()['months'][9]
    receipt = client.post('/owner/guest-receipt', json={'guest_nights': 3, 'period': '2026-10'}).json()
    assert receipt['kg_co2e'] == pytest.approx(month['total_kg'] / month['guest_nights'] * 3)
    assert receipt['verification_url'] is None and receipt['demo'] is True
    with sqlite3.connect(module.app.state.db_path) as db:
        stored = json.loads(db.execute('SELECT payload FROM receipts WHERE receipt_id=?', (receipt['receipt_id'],)).fetchone()[0])
        assert stored == receipt


@pytest.mark.parametrize('body', [{'guest_nights': 0, 'period': '2026-10'}, {'guest_nights': 1.5, 'period': '2026-10'}, {'guest_nights': True, 'period': '2026-10'}, {'guest_nights': 1, 'period': '2026-13'}, {'guest_nights': 1, 'period': '2026-1'}, {'guest_nights': 1, 'period': '1999-01'}])
def test_bad_receipt(client, body):
    assert client.post('/owner/guest-receipt', json=body).status_code == 422


def test_missing_receipt_period(client):
    assert client.post('/owner/guest-receipt', json={'guest_nights': 1, 'period': '2024-01'}).status_code == 404


def test_forecast_jobs_recompute_persisted_metrics(client, module):
    before = client.get('/owner/forecast').json()
    assert before['training_data'] == 'demo'
    assert 'seasonal' in before['evaluation']['baseline_method']
    assert before['evaluation']['model_mape'] <= before['evaluation']['baseline_mape']
    assert len(before['points']) == 12
    for point in before['points']:
        assert point['lower_kg'] <= point['predicted_kg'] <= point['upper_kg']
        assert point['period'].startswith('2027-')
    with sqlite3.connect(module.app.state.db_path) as db:
        db.execute("UPDATE months SET scope2_kg=scope2_kg+1000 WHERE period='2026-10'")
        db.commit()
    response = client.post('/owner/jobs/retrain')
    assert response.status_code == 202
    job = response.json()
    assert job['status'] == 'queued'
    jobs = client.get('/owner/jobs').json()
    assert jobs[0]['id'] == job['id'] and jobs[0]['status'] == 'completed'
    assert jobs[0]['completed_at']
    after = client.get('/owner/forecast').json()
    assert after['evaluation'] != before['evaluation']
    assert after['points'] != before['points']
    with TestClient(module.create_app()) as restarted:
        assert restarted.get('/owner/forecast').json() == after
        assert restarted.get('/owner/jobs').json() == jobs


def test_interrupted_job_marked_failed(module):
    with sqlite3.connect(module.app.state.db_path) as db:
        db.execute("INSERT INTO jobs(id,status,created_at) VALUES('interrupted','running','2026-11-13')")
        db.commit()
    with TestClient(module.create_app()) as restarted:
        assert restarted.get('/owner/jobs').json()[0]['status'] == 'failed'


@pytest.mark.parametrize('literal', ['NaN', 'Infinity', '-Infinity'])
def test_nonfinite_json(client, literal):
    response = client.put('/owner/budget', content='{"annual_kg":' + literal + '}', headers={'Content-Type': 'application/json'})
    assert response.status_code == 422
    assert response.json()['detail']


def test_malformed_and_extra_input(client):
    assert client.put('/owner/budget', content='{broken', headers={'Content-Type': 'application/json'}).status_code == 422
    assert client.put('/owner/budget', json={'annual_kg': 100, 'unknown': True}).status_code == 422


def test_pdf_report(client):
    response = client.get('/owner/report.pdf?year=2026')
    assert response.status_code == 200
    assert response.content.startswith(b'%PDF-')
    assert response.headers['content-type'] == 'application/pdf'
    assert 'attachment;' in response.headers['content-disposition']


def test_seasonal_baseline_exact(client):
    train = client.get('/owner/overview?year=2025').json()['months']
    holdout = client.get('/owner/overview?year=2026').json()['months']
    expected = sum(abs(a['total_kg'] - b['total_kg']) / b['total_kg'] for a, b in zip(train, holdout)) / 12 * 100
    evaluation = client.get('/owner/forecast').json()['evaluation']
    assert evaluation['baseline_mape'] == pytest.approx(expected)
    assert evaluation['mape_unit'] == 'percent'
    if evaluation['lightgbm_mape'] is not None:
        assert evaluation['model_mape'] == min(evaluation['lightgbm_mape'], evaluation['baseline_mape'])


def test_cors(client):
    for origin in ('http://localhost:5180', 'http://127.0.0.1:5180'):
        r = client.options('/owner/budget', headers={'Origin': origin, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type'})
        assert r.status_code == 200
        assert r.headers['access-control-allow-origin'] == origin
    for origin in ('http://localhost:5173', 'https://localhost:5180', 'https://evil.example'):
        r = client.get('/health', headers={'Origin': origin})
        assert 'access-control-allow-origin' not in r.headers
