import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { LensSentiment } from "./LensSentiment";
import { I18nProvider } from "../lib/i18n";
import type { MetricRow } from "../lib/api";


function renderWithProviders(ui: ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

function makeRow(over: Partial<MetricRow> = {}): MetricRow {
  return {
    lens: "general",
    n_queries: 40,
    n_overviews: 30,
    overview_coverage: 0.75,
    n_in_sources: 12,
    visibility_in_sources: 0.4,
    n_cited: 9,
    visibility_in_citations: 0.3,
    avg_source_position: 2.5,
    avg_citation_position: 3.125,
    relative_citation: 0.75,
    sentiment_summary: null,
    ...over,
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});


describe("LensSentiment — empty data", () => {
  it("renders the empty-state message when rows is empty", () => {
    renderWithProviders(<LensSentiment rows={[]} />);

    expect(screen.getByText("No metrics for the selected run.")).toBeInTheDocument();
  });
});


describe("LensSentiment — lens cards", () => {
  it("renders one card per lens in the fixed general/branded/comparative order", () => {
    const rows = [
      makeRow({ lens: "all" }),
      makeRow({ lens: "comparative" }),
      makeRow({ lens: "branded" }),
      makeRow({ lens: "general" }),
    ];
    renderWithProviders(<LensSentiment rows={rows} />);

    const labels = screen.getAllByText(/^(General|Branded|Comparative)$/);
    expect(labels.map((n) => n.textContent)).toEqual([
      "General",
      "Branded",
      "Comparative",
    ]);
  });

  it("shows the summary text for a lens when present", () => {
    const rows = [
      makeRow({ lens: "general", sentiment_summary: "Recommended as a top pick." }),
      makeRow({ lens: "branded", sentiment_summary: "Described in a positive light." }),
      makeRow({ lens: "comparative", sentiment_summary: "Beats rivals on price." }),
    ];
    renderWithProviders(<LensSentiment rows={rows} />);

    expect(screen.getByText("Recommended as a top pick.")).toBeInTheDocument();
    expect(screen.getByText("Described in a positive light.")).toBeInTheDocument();
    expect(screen.getByText("Beats rivals on price.")).toBeInTheDocument();
  });

  it("shows the muted fallback for a lens whose summary is null", () => {
    const rows = [
      makeRow({ lens: "general", sentiment_summary: "Recommended as a top pick." }),
      makeRow({ lens: "branded", sentiment_summary: null }),
      makeRow({ lens: "comparative", sentiment_summary: null }),
    ];
    renderWithProviders(<LensSentiment rows={rows} />);

    expect(screen.getByText("Recommended as a top pick.")).toBeInTheDocument();
    expect(screen.getAllByText("Not mentioned in this lens.")).toHaveLength(2);
  });

  it("shows the fallback for an empty-string summary too", () => {
    const rows = [makeRow({ lens: "general", sentiment_summary: "" })];
    renderWithProviders(<LensSentiment rows={rows} />);

    expect(screen.getAllByText("Not mentioned in this lens.")).toHaveLength(3);
  });

  it("falls back for lenses missing from the rows entirely", () => {
    renderWithProviders(
      <LensSentiment rows={[makeRow({ lens: "general", sentiment_summary: "Only general." })]} />,
    );

    expect(screen.getByText("Only general.")).toBeInTheDocument();
    expect(screen.getAllByText("Not mentioned in this lens.")).toHaveLength(2);
  });
});


describe("LensSentiment — aggregate lead line", () => {
  it("renders the all-row summary as a lead line when present", () => {
    const rows = [
      makeRow({ lens: "all", sentiment_summary: "Broadly positive across all query types." }),
      makeRow({ lens: "general", sentiment_summary: "Recommended." }),
    ];
    renderWithProviders(<LensSentiment rows={rows} />);

    expect(
      screen.getByText("Broadly positive across all query types."),
    ).toBeInTheDocument();
  });

  it("omits the lead line when the all row has no summary", () => {
    const rows = [
      makeRow({ lens: "all", sentiment_summary: null }),
      makeRow({ lens: "general", sentiment_summary: "Recommended." }),
    ];
    renderWithProviders(<LensSentiment rows={rows} />);

    expect(screen.getByText("Recommended.")).toBeInTheDocument();
    expect(screen.getAllByText("Not mentioned in this lens.")).toHaveLength(2);
  });
});
