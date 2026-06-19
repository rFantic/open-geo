from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from datetime import datetime, timezone
from typing import Any, Optional

from pipeline.db import get_conn, init_db

_LENS_ORDER = ["general", "branded", "comparative"]


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_in_sources(result: sqlite3.Row) -> list[int]:
    raw = result["target_source_ranks_json"]
    if not raw:
        return []
    try:
        ranks = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return []
    return [int(r) for r in ranks] if isinstance(ranks, list) else []


def _row_citation_ranks(result: sqlite3.Row) -> list[int]:
    raw = result["target_citation_ranks_json"]
    if not raw:
        return []
    try:
        ranks = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return []
    return [int(r) for r in ranks] if isinstance(ranks, list) else []


def _compute_scope(results: list[sqlite3.Row]) -> dict[str, Any]:
    n_queries = len(results)
    overview_rows = [r for r in results if int(r["overview_present"] or 0) == 1]
    n_overviews = len(overview_rows)

    source_ranks = [(r, _row_in_sources(r)) for r in overview_rows]
    citation_ranks = [(r, _row_citation_ranks(r)) for r in overview_rows]
    in_sources_best = [min(ranks) for _, ranks in source_ranks if ranks]
    cited_best = [min(ranks) for _, ranks in citation_ranks if ranks]
    n_in_sources = len(in_sources_best)
    n_cited = len(cited_best)

    overview_coverage: Optional[float] = (
        n_overviews / n_queries if n_queries > 0 else None
    )
    visibility_in_sources: Optional[float] = (
        n_in_sources / n_overviews if n_overviews > 0 else None
    )
    visibility_in_citations: Optional[float] = (
        n_cited / n_overviews if n_overviews > 0 else None
    )
    avg_source_position: Optional[float] = (
        sum(in_sources_best) / n_in_sources if n_in_sources > 0 else None
    )
    avg_citation_position: Optional[float] = (
        sum(cited_best) / n_cited if n_cited > 0 else None
    )
    relative_citation: Optional[float] = (
        n_cited / n_in_sources if n_in_sources > 0 else None
    )

    return {
        "n_queries": n_queries,
        "n_overviews": n_overviews,
        "overview_coverage": overview_coverage,
        "n_in_sources": n_in_sources,
        "visibility_in_sources": visibility_in_sources,
        "n_cited": n_cited,
        "visibility_in_citations": visibility_in_citations,
        "avg_source_position": avg_source_position,
        "avg_citation_position": avg_citation_position,
        "relative_citation": relative_citation,
    }


def compute_run_metrics(conn: sqlite3.Connection, run_id: int) -> list[dict[str, Any]]:
    run = conn.execute(
        "SELECT id, brand_id, engine FROM runs WHERE id = ?", (run_id,)
    ).fetchone()
    if run is None:
        raise ValueError(f"run {run_id} not found")

    results = conn.execute(
        "SELECT * FROM results WHERE run_id = ?", (run_id,)
    ).fetchall()

    by_lens: dict[str, list[sqlite3.Row]] = {}
    for r in results:
        by_lens.setdefault(r["lens"], []).append(r)

    present = list(by_lens.keys())
    ordered_lenses = [lns for lns in _LENS_ORDER if lns in by_lens]
    ordered_lenses += sorted(lns for lns in present if lns not in _LENS_ORDER)

    rows: list[dict[str, Any]] = []
    all_row = {"lens": "all"}
    all_row.update(_compute_scope(results))
    rows.append(all_row)

    for lens in ordered_lenses:
        lens_row = {"lens": lens}
        lens_row.update(_compute_scope(by_lens[lens]))
        rows.append(lens_row)

    return rows


def aggregate_run(conn: sqlite3.Connection, run_id: int) -> dict[str, Any]:
    run = conn.execute(
        "SELECT id, brand_id, engine FROM runs WHERE id = ?", (run_id,)
    ).fetchone()
    if run is None:
        raise ValueError(f"run {run_id} not found")

    brand_id = run["brand_id"]
    engine = run["engine"]

    metric_rows = compute_run_metrics(conn, run_id)

    computed_at = _utcnow_iso()
    conn.execute("DELETE FROM metrics WHERE run_id = ?", (run_id,))
    for m in metric_rows:
        conn.execute(
            """
            INSERT INTO metrics (
                run_id, brand_id, engine, lens,
                n_queries, n_overviews, overview_coverage,
                n_in_sources, visibility_in_sources,
                n_cited, visibility_in_citations,
                avg_source_position, avg_citation_position,
                relative_citation,
                computed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                brand_id,
                engine,
                m["lens"],
                m["n_queries"],
                m["n_overviews"],
                m["overview_coverage"],
                m["n_in_sources"],
                m["visibility_in_sources"],
                m["n_cited"],
                m["visibility_in_citations"],
                m["avg_source_position"],
                m["avg_citation_position"],
                m["relative_citation"],
                computed_at,
            ),
        )
    conn.commit()

    return {
        "run_id": run_id,
        "brand_id": brand_id,
        "engine": engine,
        "metrics": metric_rows,
    }


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="pipeline.aggregate",
        description="Compute per-lens + 'all' metrics for a run (INTERFACES §3.3/§4).",
    )
    parser.add_argument("--run-id", type=int, required=True, help="Run id to aggregate.")
    parser.add_argument(
        "--db",
        default="data/aeo.db",
        help="SQLite DB path (default: data/aeo.db).",
    )
    args = parser.parse_args(argv)

    conn = get_conn(args.db)
    try:
        init_db(conn)
        try:
            summary = aggregate_run(conn, args.run_id)
        except ValueError as exc:
            print(f"aggregate: {exc}", file=sys.stderr)
            return 1
    finally:
        conn.close()

    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
