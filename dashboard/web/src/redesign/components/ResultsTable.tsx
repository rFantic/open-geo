import type { ResultRow } from "../lib/api";
import { useT } from "../lib/i18n";
import { CheckIcon, MinusIcon } from "./icons";

export function ResultsTable({ rows }: { rows: ResultRow[] }) {
  const t = useT();
  const dash = t("common.dash");
  const ranks = (arr: number[]): string => (arr.length ? arr.join(", ") : dash);

  if (rows.length === 0) {
    return <div className="text-sm text-[var(--muted)]">{t("dashboard.results_empty")}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
            <th scope="col" className="min-w-[260px] py-2 pr-4 font-medium">
              {t("dashboard.results_col_query")}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {t("dashboard.results_col_lens")}
            </th>
            <th scope="col" className="px-3 py-2 text-center font-medium">
              {t("dashboard.results_col_overview")}
            </th>
            <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">
              {t("dashboard.results_col_source_ranks")}
            </th>
            <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">
              {t("dashboard.results_col_citation_ranks")}
            </th>
            <th scope="col" className="min-w-[280px] py-2 pl-3 font-medium">
              {t("dashboard.results_col_sentiment")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-[var(--border)] align-top text-[var(--fg)]"
            >
              <th scope="row" className="py-2.5 pr-4 text-left font-normal">
                {r.query}
              </th>
              <td className="whitespace-nowrap px-3 py-2.5 text-[var(--muted)]">
                {t(`lens.${r.lens}`)}
              </td>
              <td className="px-3 py-2.5 text-center">
                {r.overview_present ? (
                  <span
                    className="inline-flex text-[var(--good)]"
                    aria-label={t("dashboard.results_overview_shown")}
                  >
                    <CheckIcon size={16} />
                  </span>
                ) : (
                  <span
                    className="inline-flex text-[var(--muted)]"
                    aria-label={t("dashboard.results_overview_absent")}
                  >
                    <MinusIcon size={16} />
                  </span>
                )}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {ranks(r.target_source_ranks)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {ranks(r.target_citation_ranks)}
              </td>
              <td className="py-2.5 pl-3">
                {r.sentiment ?? (
                  <span className="italic text-[var(--muted)]">
                    {t("dashboard.results_brand_absent")}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
