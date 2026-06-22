from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Optional

from pipeline.db import get_conn, init_db, upsert_lens_sentiment

_LENSES = {"general", "branded", "comparative", "all"}


def _read_stdin_object() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        raise ValueError("expected a JSON object on STDIN, got empty input")
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError(
            f"expected a JSON object on STDIN, got {type(data).__name__}"
        )
    return data


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="pipeline.lens_sentiment",
        description="Upsert the per-lens qualitative synthesis for a run (INTERFACES §3.4).",
    )
    parser.add_argument("--run-id", type=int, required=True, help="Run id to write summaries for.")
    parser.add_argument(
        "--db",
        default="data/aeo.db",
        help="SQLite DB path (default: data/aeo.db).",
    )
    args = parser.parse_args(argv)

    conn = get_conn(args.db)
    try:
        init_db(conn)

        run = conn.execute(
            "SELECT id FROM runs WHERE id = ?", (args.run_id,)
        ).fetchone()
        if run is None:
            print(f"lens_sentiment: run {args.run_id} not found", file=sys.stderr)
            return 1

        try:
            data = _read_stdin_object()
        except (ValueError, json.JSONDecodeError) as exc:
            print(f"lens_sentiment: {exc}", file=sys.stderr)
            return 1

        written: list[str] = []
        for lens, summary in data.items():
            if lens not in _LENSES:
                continue
            upsert_lens_sentiment(conn, args.run_id, lens, summary)
            written.append(lens)

        print(
            f"lens_sentiment: run {args.run_id} — {len(written)} written",
            file=sys.stderr,
        )
        print(
            json.dumps({"run_id": args.run_id, "written": written}, ensure_ascii=False)
        )
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
