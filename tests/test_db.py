from __future__ import annotations

import sqlite3
from datetime import datetime

import pytest

from pipeline.db import (
    _utcnow_iso,
    create_run,
    get_conn,
    get_or_create_brand,
    init_db,
    update_run_counts,
)


def test_utcnow_iso_is_str():
    assert isinstance(_utcnow_iso(), str)


def test_utcnow_iso_parseable_and_tz_aware():
    ts = _utcnow_iso()
    parsed = datetime.fromisoformat(ts)
    assert parsed.tzinfo is not None
    assert parsed.utcoffset().total_seconds() == 0


def test_utcnow_iso_carries_utc_offset_marker():
    ts = _utcnow_iso()
    assert ts.endswith("+00:00")
    assert "Z" not in ts


def test_get_conn_creates_missing_parent_dirs(tmp_path):
    nested = tmp_path / "a" / "b" / "c.db"
    assert not nested.parent.exists()
    conn = get_conn(str(nested))
    try:
        assert nested.parent.exists()
        assert nested.exists()
    finally:
        conn.close()


def test_get_conn_parent_already_exists_no_error(tmp_path):
    p = tmp_path / "already.db"
    assert p.parent.exists()
    conn = get_conn(str(p))
    try:
        assert conn.execute("SELECT 1").fetchone()[0] == 1
    finally:
        conn.close()


def test_get_conn_bare_filename_parent_is_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    conn = get_conn("bare.db")
    try:
        assert (tmp_path / "bare.db").exists()
    finally:
        conn.close()


def test_get_conn_row_factory_is_sqlite_row(tmp_path):
    conn = get_conn(str(tmp_path / "rf.db"))
    try:
        assert conn.row_factory is sqlite3.Row
        row = conn.execute("SELECT 7 AS seven, 'x' AS letter").fetchone()
        assert isinstance(row, sqlite3.Row)
        assert row["seven"] == 7
        assert row["letter"] == "x"
        assert row[0] == 7
    finally:
        conn.close()


def test_get_conn_journal_mode_is_wal(tmp_path):
    conn = get_conn(str(tmp_path / "wal.db"))
    try:
        mode = conn.execute("PRAGMA journal_mode;").fetchone()[0]
        assert mode.lower() == "wal"
    finally:
        conn.close()


def test_get_conn_foreign_keys_enabled(tmp_path):
    conn = get_conn(str(tmp_path / "fk.db"))
    try:
        fk = conn.execute("PRAGMA foreign_keys;").fetchone()[0]
        assert fk == 1
    finally:
        conn.close()


def _table_names(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall()
    return {r["name"] for r in rows}


def _index_names(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='index'"
    ).fetchall()
    return {r["name"] for r in rows}


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return {r["name"] for r in rows}


def test_init_db_creates_all_tables(empty_conn):
    assert {"brands", "runs", "results", "metrics"} <= _table_names(empty_conn)


def test_init_db_creates_the_three_indexes(empty_conn):
    names = _index_names(empty_conn)
    assert {
        "idx_runs_brand_engine",
        "idx_results_run",
        "idx_metrics_run",
    } <= names


def test_init_db_idempotent_called_twice(tmp_path):
    conn = get_conn(str(tmp_path / "idem.db"))
    try:
        init_db(conn)
        init_db(conn)
        assert {"brands", "runs", "results", "metrics"} <= _table_names(conn)
    finally:
        conn.close()


def test_metrics_table_has_revised_citation_columns(empty_conn):
    cols = _columns(empty_conn, "metrics")
    assert "visibility_in_citations" in cols
    assert "avg_citation_position" in cols


def test_metrics_table_has_relative_citation(empty_conn):
    assert "relative_citation" in _columns(empty_conn, "metrics")


def test_metrics_table_full_column_set(empty_conn):
    assert _columns(empty_conn, "metrics") == {
        "id",
        "run_id",
        "brand_id",
        "engine",
        "lens",
        "n_queries",
        "n_overviews",
        "overview_coverage",
        "n_in_sources",
        "visibility_in_sources",
        "n_cited",
        "visibility_in_citations",
        "avg_source_position",
        "avg_citation_position",
        "relative_citation",
        "computed_at",
    }


def test_get_or_create_brand_new_returns_int_id(empty_conn):
    bid = get_or_create_brand(empty_conn, "Acme", "acme.com")
    assert isinstance(bid, int)
    row = empty_conn.execute(
        "SELECT name, domain, created_at FROM brands WHERE id = ?", (bid,)
    ).fetchone()
    assert row["name"] == "Acme"
    assert row["domain"] == "acme.com"
    assert row["created_at"]
    datetime.fromisoformat(row["created_at"])


def test_get_or_create_brand_idempotent_same_id(empty_conn):
    first = get_or_create_brand(empty_conn, "Acme", "acme.com")
    second = get_or_create_brand(empty_conn, "Acme", "acme.com")
    assert first == second
    count = empty_conn.execute(
        "SELECT COUNT(*) FROM brands WHERE name = ? AND domain = ?",
        ("Acme", "acme.com"),
    ).fetchone()[0]
    assert count == 1


def test_get_or_create_brand_normalizes_domain(empty_conn):
    bid_url = get_or_create_brand(empty_conn, "Acme", "https://www.Acme.com/x?utm=1")
    bid_bare = get_or_create_brand(empty_conn, "Acme", "acme.com")
    assert bid_url == bid_bare
    rows = empty_conn.execute(
        "SELECT domain FROM brands WHERE name = ?", ("Acme",)
    ).fetchall()
    assert [r["domain"] for r in rows] == ["acme.com"]


def test_get_or_create_brand_different_name_same_domain_is_distinct(empty_conn):
    a = get_or_create_brand(empty_conn, "Acme", "acme.com")
    b = get_or_create_brand(empty_conn, "Acme Rebrand", "acme.com")
    assert a != b
    total = empty_conn.execute(
        "SELECT COUNT(*) FROM brands WHERE domain = ?", ("acme.com",)
    ).fetchone()[0]
    assert total == 2


def test_get_or_create_brand_same_name_different_domain_is_distinct(empty_conn):
    a = get_or_create_brand(empty_conn, "Acme", "acme.com")
    b = get_or_create_brand(empty_conn, "Acme", "acme.io")
    assert a != b
    total = empty_conn.execute(
        "SELECT COUNT(*) FROM brands WHERE name = ?", ("Acme",)
    ).fetchone()[0]
    assert total == 2


def test_create_run_inserts_running_with_defaults(empty_conn):
    bid = get_or_create_brand(empty_conn, "Acme", "acme.com")
    run_id = create_run(empty_conn, bid, "google_ai_overview")
    assert isinstance(run_id, int)

    row = empty_conn.execute(
        "SELECT brand_id, engine, run_at, status, n_queries, n_ok, n_failed "
        "FROM runs WHERE id = ?",
        (run_id,),
    ).fetchone()
    assert row["brand_id"] == bid
    assert row["engine"] == "google_ai_overview"
    assert row["status"] == "running"
    assert row["run_at"]
    datetime.fromisoformat(row["run_at"])
    assert (row["n_queries"], row["n_ok"], row["n_failed"]) == (0, 0, 0)


def test_create_run_multiple_runs_get_distinct_ids(empty_conn):
    bid = get_or_create_brand(empty_conn, "Acme", "acme.com")
    r1 = create_run(empty_conn, bid, "google_ai_overview")
    r2 = create_run(empty_conn, bid, "google_ai_overview")
    assert r1 != r2


def _fresh_run(conn: sqlite3.Connection) -> int:
    bid = get_or_create_brand(conn, "Acme", "acme.com")
    return create_run(conn, bid, "google_ai_overview")


def _run_row(conn: sqlite3.Connection, run_id: int) -> sqlite3.Row:
    return conn.execute(
        "SELECT status, n_queries, n_ok, n_failed FROM runs WHERE id = ?",
        (run_id,),
    ).fetchone()


def test_update_run_counts_partial_only_n_ok(empty_conn):
    run_id = _fresh_run(empty_conn)
    update_run_counts(empty_conn, run_id, n_ok=7)
    row = _run_row(empty_conn, run_id)
    assert row["n_ok"] == 7
    assert row["status"] == "running"
    assert row["n_queries"] == 0
    assert row["n_failed"] == 0


def test_update_run_counts_only_n_queries(empty_conn):
    run_id = _fresh_run(empty_conn)
    update_run_counts(empty_conn, run_id, n_queries=42)
    row = _run_row(empty_conn, run_id)
    assert row["n_queries"] == 42
    assert (row["n_ok"], row["n_failed"], row["status"]) == (0, 0, "running")


def test_update_run_counts_only_n_failed(empty_conn):
    run_id = _fresh_run(empty_conn)
    update_run_counts(empty_conn, run_id, n_failed=3)
    row = _run_row(empty_conn, run_id)
    assert row["n_failed"] == 3
    assert (row["n_queries"], row["n_ok"], row["status"]) == (0, 0, "running")


def test_update_run_counts_only_status(empty_conn):
    run_id = _fresh_run(empty_conn)
    update_run_counts(empty_conn, run_id, status="done")
    row = _run_row(empty_conn, run_id)
    assert row["status"] == "done"
    assert (row["n_queries"], row["n_ok"], row["n_failed"]) == (0, 0, 0)


def test_update_run_counts_all_fields_at_once(empty_conn):
    run_id = _fresh_run(empty_conn)
    update_run_counts(
        empty_conn, run_id, n_queries=10, n_ok=8, n_failed=2, status="done"
    )
    row = _run_row(empty_conn, run_id)
    assert row["status"] == "done"
    assert (row["n_queries"], row["n_ok"], row["n_failed"]) == (10, 8, 2)


def test_update_run_counts_no_fields_is_noop(empty_conn):
    run_id = _fresh_run(empty_conn)
    update_run_counts(empty_conn, run_id, n_queries=5, n_ok=4, n_failed=1, status="done")
    before = tuple(_run_row(empty_conn, run_id))

    update_run_counts(empty_conn, run_id)

    after = tuple(_run_row(empty_conn, run_id))
    assert after == before


def test_update_run_counts_zero_is_explicit_not_noop(empty_conn):
    run_id = _fresh_run(empty_conn)
    update_run_counts(empty_conn, run_id, n_queries=9, n_ok=9, n_failed=9, status="done")
    update_run_counts(empty_conn, run_id, n_queries=0, n_ok=0, n_failed=0, status="failed")
    row = _run_row(empty_conn, run_id)
    assert (row["n_queries"], row["n_ok"], row["n_failed"]) == (0, 0, 0)
    assert row["status"] == "failed"


def test_update_run_counts_persists_across_reconnect(tmp_path):
    db = str(tmp_path / "persist.db")
    conn = get_conn(db)
    try:
        init_db(conn)
        run_id = _fresh_run(conn)
        update_run_counts(conn, run_id, n_ok=11, status="done")
    finally:
        conn.close()

    conn2 = get_conn(db)
    try:
        row = _run_row(conn2, run_id)
        assert row["n_ok"] == 11
        assert row["status"] == "done"
    finally:
        conn2.close()


import os  # noqa: E402  (intentional: hardening helpers added after the file body)


def test_utcnow_iso_two_calls_are_non_decreasing():
    a = _utcnow_iso()
    b = _utcnow_iso()
    assert a <= b


def test_utcnow_iso_has_microseconds_and_single_offset():
    ts = _utcnow_iso()
    date_part, sep, off = ts.partition("+")
    assert sep == "+" and off == "00:00"
    assert "." in date_part
    parsed = datetime.fromisoformat(ts)
    assert parsed.utcoffset().total_seconds() == 0


def test_get_conn_default_db_path_targets_data_aeo_db(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    assert not (tmp_path / "data").exists()
    conn = get_conn()
    try:
        assert (tmp_path / "data" / "aeo.db").exists()
        assert conn.execute("PRAGMA journal_mode;").fetchone()[0].lower() == "wal"
    finally:
        conn.close()


def test_get_conn_deeply_nested_parents_all_created(tmp_path):
    nested = tmp_path / "x" / "y" / "z" / "w" / "deep.db"
    conn = get_conn(str(nested))
    try:
        assert nested.exists()
        assert nested.parent.exists()
    finally:
        conn.close()


def test_get_conn_reuses_existing_nested_dir_no_error(tmp_path):
    nested = tmp_path / "shared" / "db.db"
    c1 = get_conn(str(nested))
    c1.close()
    assert nested.parent.exists()
    c2 = get_conn(str(nested))
    try:
        assert c2.execute("SELECT 1").fetchone()[0] == 1
    finally:
        c2.close()


def test_get_conn_absolute_path_with_missing_parents(tmp_path):
    p = tmp_path / "abs" / "sub" / "a.db"
    assert os.path.isabs(str(p))
    conn = get_conn(str(p))
    try:
        assert p.exists()
    finally:
        conn.close()


def test_get_conn_foreign_keys_enforced_not_just_reported(empty_conn):
    with pytest.raises(sqlite3.IntegrityError):
        empty_conn.execute(
            "INSERT INTO runs (brand_id, engine, run_at, status) "
            "VALUES (?, ?, ?, 'running')",
            (999_999, "google_ai_overview", _utcnow_iso()),
        )
        empty_conn.commit()


def test_init_db_second_call_preserves_existing_rows(empty_conn):
    bid = get_or_create_brand(empty_conn, "Acme", "acme.com")
    rid = create_run(empty_conn, bid, "google_ai_overview")
    init_db(empty_conn)
    assert empty_conn.execute("SELECT COUNT(*) FROM brands").fetchone()[0] == 1
    assert empty_conn.execute("SELECT COUNT(*) FROM runs").fetchone()[0] == 1
    assert empty_conn.execute(
        "SELECT name FROM brands WHERE id = ?", (bid,)
    ).fetchone()["name"] == "Acme"
    assert empty_conn.execute(
        "SELECT status FROM runs WHERE id = ?", (rid,)
    ).fetchone()["status"] == "running"


def test_init_db_runs_table_sql_defaults_match_contract(empty_conn):
    bid = get_or_create_brand(empty_conn, "Acme", "acme.com")
    cur = empty_conn.execute(
        "INSERT INTO runs (brand_id, engine, run_at) VALUES (?, ?, ?)",
        (bid, "google_ai_overview", _utcnow_iso()),
    )
    empty_conn.commit()
    row = empty_conn.execute(
        "SELECT status, n_queries, n_ok, n_failed FROM runs WHERE id = ?",
        (cur.lastrowid,),
    ).fetchone()
    assert row["status"] == "running"
    assert (row["n_queries"], row["n_ok"], row["n_failed"]) == (0, 0, 0)


def test_init_db_brands_unique_constraint_is_enforced(empty_conn):
    get_or_create_brand(empty_conn, "Acme", "acme.com")
    with pytest.raises(sqlite3.IntegrityError):
        empty_conn.execute(
            "INSERT INTO brands (name, domain, created_at) VALUES (?, ?, ?)",
            ("Acme", "acme.com", _utcnow_iso()),
        )
        empty_conn.commit()


def test_init_db_indexes_point_at_expected_tables(empty_conn):
    rows = empty_conn.execute(
        "SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
    ).fetchall()
    mapping = {r["name"]: r["tbl_name"] for r in rows}
    assert mapping["idx_runs_brand_engine"] == "runs"
    assert mapping["idx_results_run"] == "results"
    assert mapping["idx_metrics_run"] == "metrics"


def test_get_or_create_brand_unicode_name_and_domain_roundtrip(empty_conn):
    bid = get_or_create_brand(empty_conn, "Кафе ☕ Sünset", "пример.рф")
    again = get_or_create_brand(empty_conn, "Кафе ☕ Sünset", "пример.рф")
    assert bid == again
    row = empty_conn.execute(
        "SELECT name, domain FROM brands WHERE id = ?", (bid,)
    ).fetchone()
    assert row["name"] == "Кафе ☕ Sünset"
    assert row["domain"] == "пример.рф"


def test_get_or_create_brand_empty_strings_insert_and_are_idempotent(empty_conn):
    bid = get_or_create_brand(empty_conn, "", "")
    assert isinstance(bid, int)
    again = get_or_create_brand(empty_conn, "", "")
    assert again == bid
    cnt = empty_conn.execute(
        "SELECT COUNT(*) FROM brands WHERE name = '' AND domain = ''"
    ).fetchone()[0]
    assert cnt == 1


def test_get_or_create_brand_returns_int_for_existing_row_branch(empty_conn):
    first = get_or_create_brand(empty_conn, "Acme", "acme.com")
    second = get_or_create_brand(empty_conn, "Acme", "https://WWW.Acme.com/path?x=1")
    assert second == first
    assert isinstance(second, int)
    assert type(second) is int


def test_get_or_create_brand_id_is_valid_runs_fk_target(empty_conn):
    bid = get_or_create_brand(empty_conn, "Acme", "acme.com")
    rid = create_run(empty_conn, bid, "google_ai_overview")
    linked = empty_conn.execute(
        "SELECT brand_id FROM runs WHERE id = ?", (rid,)
    ).fetchone()["brand_id"]
    assert linked == bid


def test_get_or_create_brand_created_at_is_utc_aware(empty_conn):
    bid = get_or_create_brand(empty_conn, "Acme", "acme.com")
    ts = empty_conn.execute(
        "SELECT created_at FROM brands WHERE id = ?", (bid,)
    ).fetchone()["created_at"]
    parsed = datetime.fromisoformat(ts)
    assert parsed.tzinfo is not None
    assert parsed.utcoffset().total_seconds() == 0


def test_create_run_bogus_brand_id_raises_foreign_key(empty_conn):
    with pytest.raises(sqlite3.IntegrityError):
        create_run(empty_conn, 4242, "google_ai_overview")


def test_create_run_run_at_is_utc_aware(empty_conn):
    bid = get_or_create_brand(empty_conn, "Acme", "acme.com")
    rid = create_run(empty_conn, bid, "google_ai_overview")
    ts = empty_conn.execute(
        "SELECT run_at FROM runs WHERE id = ?", (rid,)
    ).fetchone()["run_at"]
    parsed = datetime.fromisoformat(ts)
    assert parsed.utcoffset().total_seconds() == 0


def test_create_run_preserves_arbitrary_engine_string(empty_conn):
    bid = get_or_create_brand(empty_conn, "Acme", "acme.com")
    rid = create_run(empty_conn, bid, "some_future_engine_v2")
    eng = empty_conn.execute(
        "SELECT engine FROM runs WHERE id = ?", (rid,)
    ).fetchone()["engine"]
    assert eng == "some_future_engine_v2"


def test_update_run_counts_two_fields_n_ok_and_status(empty_conn):
    run_id = _fresh_run(empty_conn)
    update_run_counts(empty_conn, run_id, n_ok=6, status="done")
    row = _run_row(empty_conn, run_id)
    assert (row["n_ok"], row["status"]) == (6, "done")
    assert (row["n_queries"], row["n_failed"]) == (0, 0)


def test_update_run_counts_two_fields_n_queries_and_n_failed(empty_conn):
    run_id = _fresh_run(empty_conn)
    update_run_counts(empty_conn, run_id, n_queries=12, n_failed=3)
    row = _run_row(empty_conn, run_id)
    assert (row["n_queries"], row["n_failed"]) == (12, 3)
    assert (row["n_ok"], row["status"]) == (0, "running")


def test_update_run_counts_three_fields_omitting_status(empty_conn):
    run_id = _fresh_run(empty_conn)
    update_run_counts(empty_conn, run_id, n_queries=20, n_ok=18, n_failed=2)
    row = _run_row(empty_conn, run_id)
    assert (row["n_queries"], row["n_ok"], row["n_failed"]) == (20, 18, 2)
    assert row["status"] == "running"


def test_update_run_counts_three_fields_omitting_n_queries(empty_conn):
    run_id = _fresh_run(empty_conn)
    update_run_counts(empty_conn, run_id, n_ok=8, n_failed=1, status="done")
    row = _run_row(empty_conn, run_id)
    assert (row["n_ok"], row["n_failed"], row["status"]) == (8, 1, "done")
    assert row["n_queries"] == 0


def test_update_run_counts_is_incremental_across_two_calls(empty_conn):
    run_id = _fresh_run(empty_conn)
    update_run_counts(empty_conn, run_id, n_queries=15)
    update_run_counts(empty_conn, run_id, n_ok=9)
    row = _run_row(empty_conn, run_id)
    assert row["n_queries"] == 15
    assert row["n_ok"] == 9
    assert (row["n_failed"], row["status"]) == (0, "running")


def test_update_run_counts_status_only_then_counts_only(empty_conn):
    run_id = _fresh_run(empty_conn)
    update_run_counts(empty_conn, run_id, status="failed")
    update_run_counts(empty_conn, run_id, n_failed=4)
    row = _run_row(empty_conn, run_id)
    assert row["status"] == "failed"
    assert row["n_failed"] == 4


def test_update_run_counts_accepts_negative_and_large_ints(empty_conn):
    run_id = _fresh_run(empty_conn)
    big = 10 ** 15
    update_run_counts(empty_conn, run_id, n_queries=-5, n_ok=big, n_failed=0)
    row = _run_row(empty_conn, run_id)
    assert row["n_queries"] == -5
    assert row["n_ok"] == big
    assert row["n_failed"] == 0


def test_update_run_counts_arbitrary_status_string_allowed(empty_conn):
    run_id = _fresh_run(empty_conn)
    update_run_counts(empty_conn, run_id, status="partially-done-🤷")
    assert _run_row(empty_conn, run_id)["status"] == "partially-done-🤷"


def test_update_run_counts_nonexistent_run_id_is_silent_noop(empty_conn):
    before = empty_conn.execute("SELECT COUNT(*) FROM runs").fetchone()[0]
    update_run_counts(empty_conn, 7_654_321, n_ok=99, status="done")
    after = empty_conn.execute("SELECT COUNT(*) FROM runs").fetchone()[0]
    assert after == before


def test_update_run_counts_noop_issues_no_write_on_fresh_run(empty_conn):
    run_id = _fresh_run(empty_conn)
    update_run_counts(empty_conn, run_id)
    row = _run_row(empty_conn, run_id)
    assert (row["status"], row["n_queries"], row["n_ok"], row["n_failed"]) == (
        "running",
        0,
        0,
        0,
    )
