from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


@pytest.fixture
def empty_db_path(tmp_path) -> str:
    from pipeline.db import get_conn, init_db

    p = tmp_path / "aeo.db"
    conn = get_conn(str(p))
    try:
        init_db(conn)
    finally:
        conn.close()
    return str(p)


@pytest.fixture
def empty_conn(empty_db_path):
    from pipeline.db import get_conn

    conn = get_conn(empty_db_path)
    try:
        yield conn
    finally:
        conn.close()


@pytest.fixture
def seeded_db_path(tmp_path) -> str:
    from pipeline.seed_demo import seed

    p = tmp_path / "seeded.db"
    seed(str(p), reset=True)
    return str(p)


@pytest.fixture
def dash_fixture_db_path(tmp_path) -> str:
    from dashboard.seed_fixture import seed

    p = tmp_path / "dash.db"
    seed(str(p))
    return str(p)


@pytest.fixture
def make_client(monkeypatch):
    from fastapi.testclient import TestClient

    from dashboard.api import app

    def _make(db_path) -> TestClient:
        monkeypatch.setenv("OPEN_GEO_DB", str(db_path))
        return TestClient(app)

    return _make
