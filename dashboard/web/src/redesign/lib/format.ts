export function pct(v: number | null | undefined, dash = "—"): string {
  if (v === null || v === undefined) return dash;
  return `${(v * 100).toFixed(1)}%`;
}

export function num(v: number | null | undefined, digits = 2, dash = "—"): string {
  if (v === null || v === undefined) return dash;
  return v.toFixed(digits);
}

export function delta(
  v: number | null | undefined,
  asPct: boolean,
  ppUnit = "pp",
): string {
  if (v === null || v === undefined) return "";
  const sign = v > 0 ? "+" : "";
  if (asPct) return `${sign}${(v * 100).toFixed(1)} ${ppUnit}`;
  return `${sign}${v.toFixed(2)}`;
}

export function fmtDateTime(iso: string | null | undefined, dash = "—"): string {
  if (!iso) return dash;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" });
}
