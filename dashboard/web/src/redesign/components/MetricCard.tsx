import type { ReactNode } from "react";
import type { MetricDef } from "../lib/metrics";
import type { MetricRow } from "../lib/api";
import { delta as fmtDelta, num, pct } from "../lib/format";
import { useT } from "../lib/i18n";
import { InfoTip, Skeleton } from "./primitives";
import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "./icons";

export function MetricCard({
  def,
  row,
  loading,
}: {
  def: MetricDef;
  row: MetricRow | null;
  loading?: boolean;
}) {
  const t = useT();
  const raw = row ? def.value(row) : null;
  const valueStr = def.asPct ? pct(raw, t("common.dash")) : num(raw, 2, t("common.dash"));
  const d = row ? def.delta(row) : null;
  const sub = row
    ? def.subRender
      ? def.subRender(row, t)
      : t(def.subKey, def.subVars ? def.subVars(row) : undefined)
    : " ";

  let badge: ReactNode = null;
  if (d !== null && d !== undefined) {
    const flat = Math.abs(d) < 1e-9;
    const improved = def.higherIsBetter ? d > 0 : d < 0;
    const color = flat
      ? "text-[var(--muted)]"
      : improved
        ? "text-[var(--good)]"
        : "text-[var(--bad)]";
    const Icon = flat ? MinusIcon : d > 0 ? ArrowUpIcon : ArrowDownIcon;
    badge = (
      <span
        className={`inline-flex items-center gap-0.5 rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-xs font-medium ${color}`}
        title={t("dashboard.delta_title")}
      >
        <Icon size={13} /> {fmtDelta(d, def.asPct, t("common.pp"))}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--border-strong)]">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
          {t(def.labelKey)}
        </span>
        <InfoTip text={t(def.infoKey)} />
      </div>
      {loading && !row ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <div className="flex items-end justify-between gap-2">
          <span className="text-2xl font-semibold tabular-nums text-[var(--fg)]">
            {valueStr}
          </span>
          {badge}
        </div>
      )}
      <span className="text-[11px] text-[var(--faint)]">{sub}</span>
    </div>
  );
}
