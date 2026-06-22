import type { MetricRow } from "../lib/api";
import { useT } from "../lib/i18n";

const LENS_ORDER = ["general", "branded", "comparative"] as const;

export function LensSentiment({ rows }: { rows: MetricRow[] }) {
  const t = useT();

  if (rows.length === 0) {
    return <div className="text-sm text-[var(--muted)]">{t("dashboard.lens_empty")}</div>;
  }

  const byLens = new Map(rows.map((r) => [r.lens, r]));
  const allSummary = byLens.get("all")?.sentiment_summary;

  return (
    <div className="flex flex-col gap-3">
      {allSummary && (
        <p className="text-sm leading-relaxed text-[var(--fg)]">{allSummary}</p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {LENS_ORDER.map((lens) => {
          const summary = byLens.get(lens)?.sentiment_summary;
          return (
            <div
              key={lens}
              className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                {t(`lens.${lens}`)}
              </span>
              {summary ? (
                <p className="text-sm leading-relaxed text-[var(--fg)]">{summary}</p>
              ) : (
                <p className="text-sm leading-relaxed text-[var(--faint)]">
                  {t("dashboard.sentiment_lens_empty")}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
