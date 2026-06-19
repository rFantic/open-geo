import { describe, it, expect } from "vitest";
import { pct, num, delta, fmtDateTime, fmtDateShort } from "./format";

describe("pct", () => {
  it("returns the default em dash for null", () => {
    expect(pct(null)).toBe("—");
  });

  it("returns the default em dash for undefined", () => {
    expect(pct(undefined)).toBe("—");
  });

  it("returns a custom dash for null when provided", () => {
    expect(pct(null, "n/a")).toBe("n/a");
  });

  it("returns a custom dash for undefined when provided", () => {
    expect(pct(undefined, "—-")).toBe("—-");
  });

  it("formats 0.5 as one-decimal percent", () => {
    expect(pct(0.5)).toBe("50.0%");
  });

  it("formats 1 as 100.0%", () => {
    expect(pct(1)).toBe("100.0%");
  });

  it("formats 0 as 0.0% (not treated as a missing value)", () => {
    expect(pct(0)).toBe("0.0%");
  });

  it("rounds to one decimal place", () => {
    expect(pct(0.12345)).toBe("12.3%");
  });
});

describe("num", () => {
  it("returns the default em dash for null", () => {
    expect(num(null)).toBe("—");
  });

  it("returns the default em dash for undefined", () => {
    expect(num(undefined)).toBe("—");
  });

  it("returns a custom dash when provided", () => {
    expect(num(null, 2, "?")).toBe("?");
  });

  it("formats with default digits = 2", () => {
    expect(num(3.14159)).toBe("3.14");
  });

  it("formats with explicit digits = 2", () => {
    expect(num(3.14159, 2)).toBe("3.14");
  });

  it("formats with digits = 0 (no decimals, rounded)", () => {
    expect(num(3.14159, 0)).toBe("3");
  });

  it("rounds up at digits = 0", () => {
    expect(num(3.6, 0)).toBe("4");
  });

  it("formats zero with default digits", () => {
    expect(num(0)).toBe("0.00");
  });
});

describe("delta", () => {
  it("returns an empty string for null", () => {
    expect(delta(null, false)).toBe("");
  });

  it("returns an empty string for undefined", () => {
    expect(delta(undefined, true)).toBe("");
  });

  it("prefixes a positive value with + (asPct, default unit)", () => {
    expect(delta(0.05, true)).toBe("+5.0 pp");
  });

  it("does NOT prefix a negative value (asPct, default unit)", () => {
    expect(delta(-0.05, true)).toBe("-5.0 pp");
  });

  it("uses a custom pp unit when supplied (asPct)", () => {
    expect(delta(0.05, true, "п.п.")).toBe("+5.0 п.п.");
  });

  it("renders zero without a + sign (asPct)", () => {
    expect(delta(0, true)).toBe("0.0 pp");
  });

  it("renders two decimals with no unit when asPct is false (positive)", () => {
    expect(delta(1.5, false)).toBe("+1.50");
  });

  it("renders two decimals with no unit when asPct is false (negative)", () => {
    expect(delta(-1.5, false)).toBe("-1.50");
  });

  it("renders zero without a + sign when asPct is false", () => {
    expect(delta(0, false)).toBe("0.00");
  });

  it("ignores the ppUnit argument entirely when asPct is false", () => {
    expect(delta(2, false, "pp")).toBe("+2.00");
  });
});

describe("fmtDateTime", () => {
  it("returns the default em dash for null", () => {
    expect(fmtDateTime(null)).toBe("—");
  });

  it("returns the default em dash for undefined", () => {
    expect(fmtDateTime(undefined)).toBe("—");
  });

  it("returns the default em dash for an empty string (falsy)", () => {
    expect(fmtDateTime("")).toBe("—");
  });

  it("returns a custom dash for a falsy input when provided", () => {
    expect(fmtDateTime(null, "—")).toBe("—");
    expect(fmtDateTime("", "no date")).toBe("no date");
  });

  it("returns an unparseable string verbatim", () => {
    expect(fmtDateTime("nope")).toBe("nope");
  });

  it("formats a valid ISO instant in en-GB dd/mm/yyyy, hh:mm shape", () => {
    const iso = "2026-06-18T12:00:00Z";
    const out = fmtDateTime(iso);
    expect(out).toMatch(/^\d{2}\/\d{2}\/\d{4},\s\d{2}:\d{2}$/);
    expect(out).toContain("18/06/2026");
  });

  it("matches the en-GB toLocaleString oracle exactly (host-timezone agnostic)", () => {
    const iso = "2026-01-02T09:30:00Z";
    const expected = new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    expect(fmtDateTime(iso)).toBe(expected);
  });
});

describe("fmtDateShort", () => {
  it("returns an unparseable string verbatim", () => {
    expect(fmtDateShort("nope")).toBe("nope");
  });

  it("formats a valid ISO instant as dd/mm", () => {
    const iso = "2026-06-18T12:00:00Z";
    const out = fmtDateShort(iso);
    expect(out).toMatch(/^\d{2}\/\d{2}$/);
    expect(out).toContain("18/06");
  });

  it("matches the en-GB date-only oracle exactly (host-timezone agnostic)", () => {
    const iso = "2026-12-31T23:59:00Z";
    const expected = new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
    });
    expect(fmtDateShort(iso)).toBe(expected);
  });
});
