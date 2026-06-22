
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import {
  DEFAULT_LANG,
  I18nProvider,
  useI18n,
  useT,
  type Locale,
} from "./i18n";


const EN_APP_TITLE = "open-geo";
const EN_LOADING = "Loading…";
const EN_VIS_SOURCES = "Visibility in sources";

const RU_LOADING = "Загрузка…";
const RU_DICT_PARTIAL = {
  common: {
    app_title: "опен-гео",
  },
};

const REGISTRY: Locale[] = [
  { code: "en", name: "English" },
  { code: "ru", name: "Русский" },
  { code: "de", name: "Deutsch" },
];


type RouteResult =
  | { ok: true; json: unknown }
  | { ok: false; status: number }
  | { reject: unknown };

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function stubFetch(routes: Record<string, RouteResult>): ReturnType<typeof vi.fn> {
  const fn = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    const route = Object.entries(routes).find(([path]) => url.endsWith(path))?.[1];
    if (!route) return Promise.resolve(jsonResponse({ detail: "not found" }, false, 404));
    if ("reject" in route) return Promise.reject(route.reject);
    if (route.ok) return Promise.resolve(jsonResponse(route.json));
    return Promise.resolve(jsonResponse({ detail: "err" }, false, route.status));
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}

function Probe({ tKey, vars }: { tKey: string; vars?: Record<string, string | number> }) {
  const { t, lang, locales, setLang } = useI18n();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="locales">{locales.map((l) => l.code).join(",")}</span>
      <span data-testid="t">{t(tKey, vars)}</span>
      <button onClick={() => setLang("ru")}>to-ru</button>
      <button onClick={() => setLang("xx")}>to-xx</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("lang");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});


describe("lookup() via t() resolution", () => {
  it("resolves a single-segment key", async () => {
    stubFetch({ "/api/i18n": { ok: true, json: [] } });
    render(<Probe tKey="common" />, { wrapper });
    await waitFor(() => expect(screen.getByTestId("t")).toHaveTextContent("common"));
  });

  it("resolves a valid deep dotted key to its string", async () => {
    stubFetch({ "/api/i18n": { ok: true, json: [] } });
    render(<Probe tKey="metrics.visibility_in_sources.label" />, { wrapper });
    await waitFor(() =>
      expect(screen.getByTestId("t")).toHaveTextContent(EN_VIS_SOURCES),
    );
  });

  it("returns the key for a missing intermediate path segment", async () => {
    stubFetch({ "/api/i18n": { ok: true, json: [] } });
    render(<Probe tKey="common.nope.deeper" />, { wrapper });
    await waitFor(() =>
      expect(screen.getByTestId("t")).toHaveTextContent("common.nope.deeper"),
    );
  });

  it("returns the key for a missing leaf on an existing branch", async () => {
    stubFetch({ "/api/i18n": { ok: true, json: [] } });
    render(<Probe tKey="common.does_not_exist" />, { wrapper });
    await waitFor(() =>
      expect(screen.getByTestId("t")).toHaveTextContent("common.does_not_exist"),
    );
  });

  it("returns the key when the resolved leaf is a non-string (object)", async () => {
    stubFetch({ "/api/i18n": { ok: true, json: [] } });
    render(<Probe tKey="metrics.overview_coverage" />, { wrapper });
    await waitFor(() =>
      expect(screen.getByTestId("t")).toHaveTextContent("metrics.overview_coverage"),
    );
  });

  it("returns the key when traversal hits a string mid-path (cannot descend further)", async () => {
    stubFetch({ "/api/i18n": { ok: true, json: [] } });
    render(<Probe tKey="common.app_title.child" />, { wrapper });
    await waitFor(() =>
      expect(screen.getByTestId("t")).toHaveTextContent("common.app_title.child"),
    );
  });
});

describe("format() placeholder substitution via t(key, vars)", () => {
  it("leaves the string unchanged when no vars are passed", async () => {
    stubFetch({ "/api/i18n": { ok: true, json: [] } });
    render(<Probe tKey="dashboard.run_context_run" />, { wrapper });
    await waitFor(() =>
      expect(screen.getByTestId("t")).toHaveTextContent("Run #{id}"),
    );
  });

  it("substitutes a single named placeholder", async () => {
    stubFetch({ "/api/i18n": { ok: true, json: [] } });
    render(
      <Probe tKey="dashboard.run_context_all" vars={{ n: 7 }} />,
      { wrapper },
    );
    await waitFor(() =>
      expect(screen.getByTestId("t")).toHaveTextContent("completed runs: 7"),
    );
  });

  it("keeps an unmatched placeholder verbatim while filling the matched one", async () => {
    stubFetch({ "/api/i18n": { ok: true, json: [] } });
    render(
      <Probe tKey="dashboard.run_context_run" vars={{ id: 42 }} />,
      { wrapper },
    );
    await waitFor(() => {
      const txt = screen.getByTestId("t").textContent ?? "";
      expect(txt).toContain("Run #42");
      expect(txt).toContain("{datetime}");
      expect(txt).toContain("{status}");
    });
  });

  it("substitutes all placeholders when every var is supplied", async () => {
    stubFetch({ "/api/i18n": { ok: true, json: [] } });
    render(
      <Probe
        tKey="dashboard.run_context_run"
        vars={{ id: 5, datetime: "2026-06-19", status: "done" }}
      />,
      { wrapper },
    );
    await waitFor(() =>
      expect(screen.getByTestId("t")).toHaveTextContent(
        "Run #5 · 2026-06-19 · done",
      ),
    );
  });

  it("returns a placeholder-free string unchanged even when vars are provided", async () => {
    stubFetch({ "/api/i18n": { ok: true, json: [] } });
    render(<Probe tKey="common.loading" vars={{ unused: "x" }} />, { wrapper });
    await waitFor(() => expect(screen.getByTestId("t")).toHaveTextContent(EN_LOADING));
  });
});


describe("getInitialLang() initial language", () => {
  it("defaults to 'en' when localStorage has no stored value", async () => {
    stubFetch({ "/api/i18n": { ok: true, json: [] } });
    render(<Probe tKey="common.app_title" />, { wrapper });
    expect(screen.getByTestId("lang")).toHaveTextContent(DEFAULT_LANG);
    expect(DEFAULT_LANG).toBe("en");
  });

  it("uses the persisted localStorage value when present", async () => {
    localStorage.setItem("og-lang", "ru");
    stubFetch({
      "/api/i18n": { ok: true, json: REGISTRY },
      "/api/i18n/ru": { ok: true, json: RU_DICT_PARTIAL },
    });
    render(<Probe tKey="common.app_title" />, { wrapper });
    expect(screen.getByTestId("lang")).toHaveTextContent("ru");
    await waitFor(() =>
      expect(screen.getByTestId("t")).toHaveTextContent("опен-гео"),
    );
  });
});


describe("getInitialLang() — ?lang= URL override", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("uses ?lang= from the URL when no localStorage value is set", async () => {
    window.history.replaceState({}, "", "/?lang=ru");
    stubFetch({
      "/api/i18n": { ok: true, json: REGISTRY },
      "/api/i18n/ru": { ok: true, json: RU_DICT_PARTIAL },
    });
    render(<Probe tKey="common.app_title" />, { wrapper });
    expect(screen.getByTestId("lang")).toHaveTextContent("ru");
    await waitFor(() =>
      expect(screen.getByTestId("t")).toHaveTextContent("опен-гео"),
    );
  });

  it("lets ?lang= take precedence over a stored localStorage value", async () => {
    localStorage.setItem("og-lang", "en");
    window.history.replaceState({}, "", "/?lang=ru");
    stubFetch({
      "/api/i18n": { ok: true, json: REGISTRY },
      "/api/i18n/ru": { ok: true, json: RU_DICT_PARTIAL },
    });
    render(<Probe tKey="common.app_title" />, { wrapper });
    expect(screen.getByTestId("lang")).toHaveTextContent("ru");
    await waitFor(() =>
      expect(screen.getByTestId("t")).toHaveTextContent("опен-гео"),
    );
  });

  it("falls back to the stored value when ?lang= is empty", async () => {
    window.history.replaceState({}, "", "/?lang=");
    localStorage.setItem("og-lang", "de");
    stubFetch({
      "/api/i18n": { ok: true, json: REGISTRY },
      "/api/i18n/de": { ok: true, json: {} },
    });
    render(<Probe tKey="common.app_title" />, { wrapper });
    expect(screen.getByTestId("lang")).toHaveTextContent("de");
    await waitFor(() =>
      expect(screen.getByTestId("locales")).toHaveTextContent("en,ru,de"),
    );
  });
});


describe("I18nProvider — default (English) state", () => {
  it("renders English immediately from the bundled dict with NO dict fetch", async () => {
    const fetchFn = stubFetch({ "/api/i18n": { ok: true, json: REGISTRY } });
    render(<Probe tKey="common.app_title" />, { wrapper });

    expect(screen.getByTestId("t")).toHaveTextContent(EN_APP_TITLE);
    expect(screen.getByTestId("lang")).toHaveTextContent("en");

    await waitFor(() =>
      expect(screen.getByTestId("locales")).toHaveTextContent("en,ru,de"),
    );

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const calledUrls = fetchFn.mock.calls.map((c) => String(c[0]));
    expect(calledUrls).toEqual([expect.stringContaining("/api/i18n")]);
    expect(calledUrls.some((u) => u.includes("/api/i18n/en"))).toBe(false);
  });

  it("requests the registry at <API_BASE>/api/i18n", async () => {
    const fetchFn = stubFetch({ "/api/i18n": { ok: true, json: [] } });
    render(<Probe tKey="common.app_title" />, { wrapper });
    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    const expectedBase = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
    expect(String(fetchFn.mock.calls[0][0])).toBe(`${expectedBase}/api/i18n`);
    expect(String(fetchFn.mock.calls[0][0])).toMatch(/\/api\/i18n$/);
  });
});

describe("I18nProvider — locale registry loading", () => {
  it("replaces the fallback registry with the fetched list", async () => {
    stubFetch({ "/api/i18n": { ok: true, json: REGISTRY } });
    render(<Probe tKey="common.app_title" />, { wrapper });
    expect(screen.getByTestId("locales")).toHaveTextContent("en");
    await waitFor(() =>
      expect(screen.getByTestId("locales")).toHaveTextContent("en,ru,de"),
    );
  });

  it("keeps the fallback registry when /api/i18n rejects", async () => {
    stubFetch({ "/api/i18n": { reject: new Error("network down") } });
    render(<Probe tKey="common.app_title" />, { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("locales")).toHaveTextContent("en");
    expect(screen.getByTestId("locales").textContent).toBe("en");
  });

  it("keeps the fallback registry when /api/i18n returns a non-200", async () => {
    stubFetch({ "/api/i18n": { ok: false, status: 500 } });
    render(<Probe tKey="common.app_title" />, { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("locales").textContent).toBe("en");
  });

  it("keeps the fallback registry when the list is empty (length 0)", async () => {
    stubFetch({ "/api/i18n": { ok: true, json: [] } });
    render(<Probe tKey="common.app_title" />, { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("locales").textContent).toBe("en");
  });

  it("keeps the fallback registry when the payload is not an array", async () => {
    stubFetch({ "/api/i18n": { ok: true, json: { not: "an array" } } });
    render(<Probe tKey="common.app_title" />, { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("locales").textContent).toBe("en");
  });
});

describe("I18nProvider — setLang to a real non-English locale (ru)", () => {
  it("fetches /api/i18n/ru and returns RU values, falling back to EN per missing key", async () => {
    const fetchFn = stubFetch({
      "/api/i18n": { ok: true, json: REGISTRY },
      "/api/i18n/ru": { ok: true, json: RU_DICT_PARTIAL },
    });
    const user = userEvent.setup();
    render(<Probe tKey="common.app_title" />, { wrapper });

    expect(screen.getByTestId("t")).toHaveTextContent(EN_APP_TITLE);

    await user.click(screen.getByText("to-ru"));

    await waitFor(() => expect(screen.getByTestId("lang")).toHaveTextContent("ru"));
    await waitFor(() =>
      expect(screen.getByTestId("t")).toHaveTextContent("опен-гео"),
    );

    expect(
      fetchFn.mock.calls.some((c) => String(c[0]).endsWith("/api/i18n/ru")),
    ).toBe(true);
  });

  it("falls back to the bundled EN string for a key absent from the RU dict", async () => {
    stubFetch({
      "/api/i18n": { ok: true, json: REGISTRY },
      "/api/i18n/ru": { ok: true, json: RU_DICT_PARTIAL },
    });
    const user = userEvent.setup();
    render(<Probe tKey="common.loading" />, { wrapper });
    await user.click(screen.getByText("to-ru"));
    await waitFor(() => expect(screen.getByTestId("lang")).toHaveTextContent("ru"));
    await waitFor(() => expect(screen.getByTestId("t")).toHaveTextContent(EN_LOADING));
    expect(screen.getByTestId("t").textContent).not.toBe(RU_LOADING);
  });

  it("substitutes placeholders against the RU dict value when present", async () => {
    stubFetch({
      "/api/i18n": { ok: true, json: REGISTRY },
      "/api/i18n/ru": {
        ok: true,
        json: { dashboard: { run_context_all: "прогонов: {n}" } },
      },
    });
    const user = userEvent.setup();
    render(
      <Probe tKey="dashboard.run_context_all" vars={{ n: 3 }} />,
      { wrapper },
    );
    await user.click(screen.getByText("to-ru"));
    await waitFor(() =>
      expect(screen.getByTestId("t")).toHaveTextContent("прогонов: 3"),
    );
  });
});

describe("I18nProvider — setLang to an unknown locale (404 path)", () => {
  it("leaves activeDict null and keeps English when the dict fetch rejects (404)", async () => {
    stubFetch({
      "/api/i18n": { ok: true, json: REGISTRY },
    });
    const user = userEvent.setup();
    render(<Probe tKey="common.app_title" />, { wrapper });

    await user.click(screen.getByText("to-xx"));

    await waitFor(() => expect(screen.getByTestId("lang")).toHaveTextContent("xx"));
    await waitFor(() =>
      expect(screen.getByTestId("t")).toHaveTextContent(EN_APP_TITLE),
    );
  });

  it("resets activeDict to null when switching from a loaded locale back to a failing one", async () => {
    stubFetch({
      "/api/i18n": { ok: true, json: REGISTRY },
      "/api/i18n/ru": { ok: true, json: RU_DICT_PARTIAL },
    });
    const user = userEvent.setup();
    render(<Probe tKey="common.app_title" />, { wrapper });

    await user.click(screen.getByText("to-ru"));
    await waitFor(() => expect(screen.getByTestId("t")).toHaveTextContent("опен-гео"));

    await user.click(screen.getByText("to-xx"));
    await waitFor(() => expect(screen.getByTestId("lang")).toHaveTextContent("xx"));
    await waitFor(() => expect(screen.getByTestId("t")).toHaveTextContent(EN_APP_TITLE));
  });
});

describe("I18nProvider — unmount race (alive guard) in the dict effect", () => {
  it("ignores a resolved dict fetch after the provider unmounts (then-branch alive=false)", async () => {
    let resolveDict!: (v: unknown) => void;
    const dictPromise = new Promise<unknown>((res) => {
      resolveDict = res;
    });
    const fn = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/i18n/ru")) {
        return dictPromise.then((body) => jsonResponse(body));
      }
      return Promise.resolve(jsonResponse(REGISTRY));
    });
    vi.stubGlobal("fetch", fn);

    localStorage.setItem("og-lang", "ru");
    const { unmount } = render(<Probe tKey="common.app_title" />, { wrapper });

    unmount();
    await act(async () => {
      resolveDict(RU_DICT_PARTIAL);
      await dictPromise;
    });
    expect(fn).toHaveBeenCalled();
  });

  it("ignores a rejected dict fetch after the provider unmounts (catch-branch alive=false)", async () => {
    let rejectDict!: (e: unknown) => void;
    const dictPromise = new Promise((_res, rej) => {
      rejectDict = rej;
    });
    const fn = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/i18n/ru")) {
        return dictPromise as Promise<Response>;
      }
      return Promise.resolve(jsonResponse(REGISTRY));
    });
    vi.stubGlobal("fetch", fn);

    localStorage.setItem("og-lang", "ru");
    const { unmount } = render(<Probe tKey="common.app_title" />, { wrapper });

    unmount();
    await act(async () => {
      rejectDict(new Error("late 404"));
      await dictPromise.catch(() => {});
    });
    expect(fn).toHaveBeenCalled();
  });
});

describe("I18nProvider — persistence & <html lang> reflection", () => {
  it("sets <html lang> to the default language on mount", async () => {
    stubFetch({ "/api/i18n": { ok: true, json: [] } });
    render(<Probe tKey="common.app_title" />, { wrapper });
    await waitFor(() =>
      expect(document.documentElement.getAttribute("lang")).toBe("en"),
    );
  });

  it("persists the chosen language to localStorage 'og-lang' and updates <html lang>", async () => {
    stubFetch({
      "/api/i18n": { ok: true, json: REGISTRY },
      "/api/i18n/ru": { ok: true, json: RU_DICT_PARTIAL },
    });
    const user = userEvent.setup();
    render(<Probe tKey="common.app_title" />, { wrapper });

    await waitFor(() => expect(localStorage.getItem("og-lang")).toBe("en"));

    await user.click(screen.getByText("to-ru"));

    await waitFor(() => expect(localStorage.getItem("og-lang")).toBe("ru"));
    await waitFor(() =>
      expect(document.documentElement.getAttribute("lang")).toBe("ru"),
    );
  });
});


describe("module init — API_BASE fallback when VITE_API_BASE is unset", () => {
  it("falls back to an empty base so the path is request-relative", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE", "");
    const fresh = await import("./i18n");

    const fetchFn = vi.fn(() =>
      Promise.resolve(jsonResponse([] as Locale[])),
    );
    vi.stubGlobal("fetch", fetchFn);

    function FreshProbe() {
      const { t } = fresh.useI18n();
      return <span data-testid="ft">{t("common.app_title")}</span>;
    }
    render(
      <fresh.I18nProvider>
        <FreshProbe />
      </fresh.I18nProvider>,
    );

    expect(screen.getByTestId("ft")).toHaveTextContent(EN_APP_TITLE);
    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    expect(String(fetchFn.mock.calls[0][0])).toBe("/api/i18n");

    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

describe("useI18n / useT provider guard", () => {
  it("useI18n throws when rendered outside an I18nProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useI18n())).toThrow(
      "useI18n must be used within an I18nProvider",
    );
    spy.mockRestore();
  });

  it("useT throws when rendered outside an I18nProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useT())).toThrow(
      "useI18n must be used within an I18nProvider",
    );
    spy.mockRestore();
  });

  it("useT returns a working t() inside a provider", async () => {
    stubFetch({ "/api/i18n": { ok: true, json: [] } });
    const { result } = renderHook(() => useT(), { wrapper });
    expect(result.current("common.app_title")).toBe(EN_APP_TITLE);
    expect(result.current("metrics.visibility_in_sources.label")).toBe(EN_VIS_SOURCES);
    await act(async () => {
      await Promise.resolve();
    });
  });
});
