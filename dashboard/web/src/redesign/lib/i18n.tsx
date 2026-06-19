import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import enDict from "../../../../../i18n/en.json";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
const STORAGE_KEY = "og-lang";
export const DEFAULT_LANG = "en";

export type Dict = Record<string, unknown>;
export type Locale = { code: string; name: string };

const EN: Dict = enDict as Dict;

function lookup(dict: Dict | null, key: string): string | undefined {
  if (!dict) return undefined;
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in (node as Dict)) {
      node = (node as Dict)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
}

function format(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m,
  );
}

export type TFn = (key: string, vars?: Record<string, string | number>) => string;

type I18nCtx = {
  lang: string;
  setLang: (code: string) => void;
  locales: Locale[];
  t: TFn;
};

const I18nContext = createContext<I18nCtx | null>(null);

function getInitialLang(): string {
  if (typeof window === "undefined") return DEFAULT_LANG;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  } catch {}
  return DEFAULT_LANG;
}

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<string>(getInitialLang);
  const [locales, setLocales] = useState<Locale[]>([
    { code: "en", name: "English" },
  ]);
  const [activeDict, setActiveDict] = useState<Dict | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {}
    document.documentElement.setAttribute("lang", lang);
  }, [lang]);

  useEffect(() => {
    let alive = true;
    fetchJSON<Locale[]>("/api/i18n")
      .then((list) => {
        if (alive && Array.isArray(list) && list.length > 0) setLocales(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    if (lang === DEFAULT_LANG) {
      setActiveDict(null);
      return;
    }
    fetchJSON<Dict>(`/api/i18n/${lang}`)
      .then((d) => {
        if (alive) setActiveDict(d);
      })
      .catch(() => {
        if (alive) setActiveDict(null);
      });
    return () => {
      alive = false;
    };
  }, [lang]);

  const setLang = useCallback((code: string) => setLangState(code), []);

  const t = useCallback<TFn>(
    (key, vars) => {
      const raw = lookup(activeDict, key) ?? lookup(EN, key) ?? key;
      return format(raw, vars);
    },
    [activeDict],
  );

  const value = useMemo<I18nCtx>(
    () => ({ lang, setLang, locales, t }),
    [lang, setLang, locales, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nCtx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an I18nProvider");
  return ctx;
}

export function useT(): TFn {
  return useI18n().t;
}
