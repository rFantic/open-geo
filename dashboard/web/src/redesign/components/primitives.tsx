import { useId, useState, type ReactNode } from "react";
import { ChevronDownIcon, InfoIcon, MoonIcon, SunIcon } from "./icons";
import { useTheme } from "../lib/theme";
import { useI18n, useT } from "../lib/i18n";

export function InfoTip({ text, label }: { text: string; label?: string }) {
  const t = useT();
  const a11yLabel = label ?? t("dashboard.metric_info_label");
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={a11yLabel}
        aria-describedby={open ? id : undefined}
        className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-[var(--faint)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <InfoIcon size={15} />
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          className="absolute right-0 top-7 z-30 w-64 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs font-normal leading-relaxed text-[var(--fg)] shadow-xl"
        >
          {text}
        </span>
      )}
    </span>
  );
}

export function Panel({
  title,
  info,
  right,
  children,
  className = "",
}: {
  title?: string;
  info?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 ${className}`}
    >
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {title && (
              <h2 className="text-sm font-semibold text-[var(--fg)]">{title}</h2>
            )}
            {info && <InfoTip text={info} />}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <span className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
          {label}
        </span>
      )}
      <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-0.5">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(o.value)}
              className={`inline-flex min-h-[40px] cursor-pointer items-center justify-center rounded-md px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
                active
                  ? "bg-[var(--accent)] font-medium text-[var(--accent-fg)]"
                  : "text-[var(--muted)] hover:text-[var(--fg)]"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FieldSelect<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T | "";
  options: { value: T; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-w-[160px] flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
        {label}
      </span>
      <div className="relative">
        <select
          className="w-full cursor-pointer appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 pr-9 text-sm text-[var(--fg)] outline-none transition-colors focus:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ minHeight: 44 }}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--faint)]"
        />
      </div>
    </label>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-md bg-[var(--surface-2)] ${className}`} />
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const t = useT();
  const isDark = theme === "dark";
  return (
    <IconButton
      label={isDark ? t("dashboard.theme_to_light") : t("dashboard.theme_to_dark")}
      onClick={toggle}
    >
      {isDark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
    </IconButton>
  );
}

export function LanguageSwitcher() {
  const { lang, setLang, locales } = useI18n();
  const t = useT();
  return (
    <label className="flex flex-col gap-1">
      <span className="sr-only">{t("dashboard.language_label")}</span>
      <div className="relative">
        <select
          aria-label={t("dashboard.language_label")}
          className="h-11 cursor-pointer appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-3 pr-9 text-sm text-[var(--fg)] outline-none transition-colors hover:bg-[var(--surface-2)] focus:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          value={lang}
          onChange={(e) => setLang(e.target.value)}
        >
          {locales.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
        <ChevronDownIcon
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--faint)]"
        />
      </div>
    </label>
  );
}
