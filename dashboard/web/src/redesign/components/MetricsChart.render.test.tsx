
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../lib/i18n";
import type { TimeseriesPoint } from "../lib/api";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 640, height: 320 }}>{children}</div>
    ),
  };
});

import { MetricsChart } from "./MetricsChart";

function renderChart(points: TimeseriesPoint[]) {
  return render(
    <I18nProvider>
      <MetricsChart points={points} />
    </I18nProvider>,
  );
}

function fullPoint(over: Partial<TimeseriesPoint> = {}): TimeseriesPoint {
  return {
    run_id: 1,
    run_at: "2026-06-18T20:15:00Z",
    status: "completed",
    lens: "all",
    n_queries: 40,
    n_overviews: 30,
    overview_coverage: 0.75,
    visibility_in_sources: 0.5,
    visibility_in_citations: 0.333,
    avg_source_position: 2.4,
    avg_citation_position: 1.8,
    ...over,
  };
}

describe("MetricsChart (real render)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => [],
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("renders the empty state (no chart) when points is empty", () => {
    const { container } = renderChart([]);
    expect(
      screen.getByText("No completed runs to plot a trend."),
    ).toBeInTheDocument();
    expect(container.querySelector(".recharts-wrapper")).toBeNull();
  });

  it("renders the chart (not the empty state) for a single fully-populated point", () => {
    const { container } = renderChart([fullPoint()]);
    expect(
      screen.queryByText("No completed runs to plot a trend."),
    ).not.toBeInTheDocument();
    expect(container.querySelector(".recharts-wrapper")).not.toBeNull();
  });

  it("renders the chart for multiple points (time series)", () => {
    const points = [
      fullPoint({ run_id: 1, run_at: "2026-06-16T10:00:00Z" }),
      fullPoint({ run_id: 2, run_at: "2026-06-17T10:00:00Z", overview_coverage: 0.6 }),
      fullPoint({ run_id: 3, run_at: "2026-06-18T10:00:00Z", overview_coverage: 0.9 }),
    ];
    const { container } = renderChart(points);
    expect(container.querySelector(".recharts-wrapper")).not.toBeNull();
  });

  it("does not crash when metric values are null (gaps in series)", () => {
    const points = [
      fullPoint({ run_id: 1 }),
      fullPoint({
        run_id: 2,
        run_at: "2026-06-19T10:00:00Z",
        overview_coverage: null,
        visibility_in_sources: null,
        visibility_in_citations: null,
        avg_source_position: null,
        avg_citation_position: null,
      }),
    ];
    const { container } = renderChart(points);
    expect(container.querySelector(".recharts-wrapper")).not.toBeNull();
  });

  it("does not crash when metric values are undefined (server omitted fields)", () => {
    const partial: TimeseriesPoint = {
      run_id: 7,
      run_at: "2026-06-19T12:00:00Z",
      status: "completed",
      lens: "branded",
      n_queries: 10,
      n_overviews: 4,
      overview_coverage: undefined,
      visibility_in_sources: undefined,
      visibility_in_citations: undefined,
      avg_source_position: undefined,
      avg_citation_position: undefined,
    };
    const { container } = renderChart([partial]);
    expect(container.querySelector(".recharts-wrapper")).not.toBeNull();
  });

  it("renders even when run_at is an invalid date string (fmtDateShort passthrough)", () => {
    const { container } = renderChart([fullPoint({ run_at: "not-a-date" })]);
    expect(container.querySelector(".recharts-wrapper")).not.toBeNull();
  });
});
