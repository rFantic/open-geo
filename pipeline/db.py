from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_conn(db_path: str = "data/aeo.db") -> sqlite3.Connection:
    path = Path(db_path)
    if path.parent and not path.parent.exists():
        path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS brands (
            id         INTEGER PRIMARY KEY,
            name       TEXT NOT NULL,
            domain     TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(name, domain)
        );

        CREATE TABLE IF NOT EXISTS runs (
            id        INTEGER PRIMARY KEY,
            brand_id  INTEGER NOT NULL REFERENCES brands(id),
            engine    TEXT NOT NULL,
            run_at    TEXT NOT NULL,
            status    TEXT NOT NULL DEFAULT 'running',
            n_queries INTEGER NOT NULL DEFAULT 0,
            n_ok      INTEGER NOT NULL DEFAULT 0,
            n_failed  INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS results (
            id                        INTEGER PRIMARY KEY,
            run_id                    INTEGER NOT NULL REFERENCES runs(id),
            query                     TEXT,
            lens                      TEXT,
            captured_at               TEXT,
            answer_text_md            TEXT,
            screenshot_path           TEXT,
            overview_present          INTEGER,
            sources_json              TEXT,
            citations_json            TEXT,
            target_source_ranks_json  TEXT,
            target_citation_ranks_json TEXT,
            brand_in_answer_text      INTEGER,
            sentiment                 TEXT
        );

        -- NOTE: the metrics table schema CHANGED (relative_citation RE-ADDED;
        -- it is valid because citations ⊆ sources, so the ratio is bounded).
        -- Because this is CREATE TABLE IF NOT EXISTS, it will NOT alter an
        -- existing table. Any DB created before this change must DROP the metrics
        -- table and re-aggregate (metrics are derived from results — dropping
        -- them causes NO data loss):
        --     DROP TABLE IF EXISTS metrics;  -- then init_db + re-run pipeline.aggregate
        CREATE TABLE IF NOT EXISTS metrics (
            id                      INTEGER PRIMARY KEY,
            run_id                  INTEGER NOT NULL REFERENCES runs(id),
            brand_id                INTEGER,
            engine                  TEXT,
            lens                    TEXT,
            n_queries               INTEGER,
            n_overviews             INTEGER,
            overview_coverage       REAL,
            n_in_sources            INTEGER,
            visibility_in_sources   REAL,
            n_cited                 INTEGER,
            visibility_in_citations REAL,
            avg_source_position     REAL,
            avg_citation_position   REAL,
            relative_citation       REAL,
            computed_at             TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_runs_brand_engine ON runs(brand_id, engine);
        CREATE INDEX IF NOT EXISTS idx_results_run        ON results(run_id);
        CREATE INDEX IF NOT EXISTS idx_metrics_run        ON metrics(run_id);
        """
    )
    conn.commit()


def get_or_create_brand(conn: sqlite3.Connection, name: str, domain: str) -> int:
    from pipeline.schema import normalize_domain

    norm_domain = normalize_domain(domain)

    row = conn.execute(
        "SELECT id FROM brands WHERE name = ? AND domain = ?",
        (name, norm_domain),
    ).fetchone()
    if row is not None:
        return int(row["id"])

    cur = conn.execute(
        "INSERT INTO brands (name, domain, created_at) VALUES (?, ?, ?)",
        (name, norm_domain, _utcnow_iso()),
    )
    conn.commit()
    return int(cur.lastrowid)


def create_run(conn: sqlite3.Connection, brand_id: int, engine: str) -> int:
    cur = conn.execute(
        "INSERT INTO runs (brand_id, engine, run_at, status) VALUES (?, ?, ?, 'running')",
        (brand_id, engine, _utcnow_iso()),
    )
    conn.commit()
    return int(cur.lastrowid)


def update_run_counts(
    conn: sqlite3.Connection,
    run_id: int,
    n_queries: Optional[int] = None,
    n_ok: Optional[int] = None,
    n_failed: Optional[int] = None,
    status: Optional[str] = None,
) -> None:
    sets: list[str] = []
    params: list[object] = []
    if n_queries is not None:
        sets.append("n_queries = ?")
        params.append(n_queries)
    if n_ok is not None:
        sets.append("n_ok = ?")
        params.append(n_ok)
    if n_failed is not None:
        sets.append("n_failed = ?")
        params.append(n_failed)
    if status is not None:
        sets.append("status = ?")
        params.append(status)

    if not sets:
        return

    params.append(run_id)
    conn.execute(f"UPDATE runs SET {', '.join(sets)} WHERE id = ?", params)
    conn.commit()


__all__ = [
    "get_conn",
    "init_db",
    "get_or_create_brand",
    "create_run",
    "update_run_counts",
]
