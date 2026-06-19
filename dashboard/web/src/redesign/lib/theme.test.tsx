
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./theme";

const STORAGE_KEY = "og-theme";

function fakeMatchMedia(matches: boolean) {
  return (query: string): MediaQueryList =>
    ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

const ORIGINAL_MATCH_MEDIA = window.matchMedia;

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove("dark");
  window.matchMedia = ORIGINAL_MATCH_MEDIA;
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.documentElement.classList.remove("dark");
  window.matchMedia = ORIGINAL_MATCH_MEDIA;
});

describe("getInitialTheme via ThemeProvider mount", () => {
  it("uses stored 'light' when localStorage has og-theme=light", () => {
    window.localStorage.setItem(STORAGE_KEY, "light");
    window.matchMedia = fakeMatchMedia(true);
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    expect(result.current.theme).toBe("light");
  });

  it("uses stored 'dark' when localStorage has og-theme=dark", () => {
    window.localStorage.setItem(STORAGE_KEY, "dark");
    window.matchMedia = fakeMatchMedia(false);
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    expect(result.current.theme).toBe("dark");
  });

  it("ignores an invalid stored value and falls through to matchMedia (dark)", () => {
    window.localStorage.setItem(STORAGE_KEY, "purple");
    window.matchMedia = fakeMatchMedia(true);
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    expect(result.current.theme).toBe("dark");
  });

  it("ignores an invalid stored value and falls through to matchMedia (light)", () => {
    window.localStorage.setItem(STORAGE_KEY, "");
    window.matchMedia = fakeMatchMedia(false);
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    expect(result.current.theme).toBe("light");
  });

  it("defaults to 'dark' when no stored value and prefers-color-scheme: dark matches", () => {
    window.matchMedia = fakeMatchMedia(true);
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    expect(result.current.theme).toBe("dark");
  });

  it("defaults to 'light' when no stored value and prefers-color-scheme does NOT match", () => {
    window.matchMedia = fakeMatchMedia(false);
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    expect(result.current.theme).toBe("light");
  });

  it("falls back to 'light' when window.matchMedia is undefined (optional chaining)", () => {
    // @ts-expect-error
    delete window.matchMedia;
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    expect(result.current.theme).toBe("light");
  });

  it("falls through to matchMedia when localStorage.getItem throws (catch path)", () => {
    const spy = vi
      .spyOn(window.localStorage.__proto__, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    window.matchMedia = fakeMatchMedia(true);
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    expect(result.current.theme).toBe("dark");
    expect(spy).toHaveBeenCalledWith(STORAGE_KEY);
  });
});

describe("ThemeProvider mount effect (class + persistence)", () => {
  it("adds the 'dark' class to <html> and persists 'dark' when theme is dark", () => {
    window.matchMedia = fakeMatchMedia(true);
    renderHook(() => useTheme(), { wrapper: ThemeProvider });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("dark");
  });

  it("removes the 'dark' class from <html> and persists 'light' when theme is light", () => {
    document.documentElement.classList.add("dark");
    window.matchMedia = fakeMatchMedia(false);
    renderHook(() => useTheme(), { wrapper: ThemeProvider });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("light");
  });

  it("swallows a localStorage.setItem failure without throwing (effect catch path)", () => {
    window.matchMedia = fakeMatchMedia(false);
    const spy = vi
      .spyOn(window.localStorage.__proto__, "setItem")
      .mockImplementation(() => {
        throw new Error("quota exceeded");
      });
    expect(() =>
      renderHook(() => useTheme(), { wrapper: ThemeProvider }),
    ).not.toThrow();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(spy).toHaveBeenCalled();
  });
});

describe("setTheme / toggle behavior", () => {
  it("setTheme('light') forces light and clears the dark class", () => {
    window.matchMedia = fakeMatchMedia(true);
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    expect(result.current.theme).toBe("dark");

    act(() => result.current.setTheme("light"));

    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("light");
  });

  it("setTheme('dark') forces dark and adds the dark class", () => {
    window.matchMedia = fakeMatchMedia(false);
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    expect(result.current.theme).toBe("light");

    act(() => result.current.setTheme("dark"));

    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("dark");
  });

  it("toggle() flips dark -> light", () => {
    window.matchMedia = fakeMatchMedia(true);
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    expect(result.current.theme).toBe("dark");

    act(() => result.current.toggle());

    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("toggle() flips light -> dark", () => {
    window.matchMedia = fakeMatchMedia(false);
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    expect(result.current.theme).toBe("light");

    act(() => result.current.toggle());

    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("toggle() twice returns to the original theme", () => {
    window.matchMedia = fakeMatchMedia(false);
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    act(() => result.current.toggle());
    act(() => result.current.toggle());

    expect(result.current.theme).toBe("light");
  });
});

describe("useTheme guard", () => {
  it("throws when called outside a ThemeProvider", () => {
    expect(() => renderHook(() => useTheme())).toThrow(
      "useTheme must be used within a ThemeProvider",
    );
  });
});
