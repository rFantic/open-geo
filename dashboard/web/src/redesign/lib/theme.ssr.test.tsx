
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeProvider, useTheme } from "./theme";

function ThemeProbe() {
  const { theme } = useTheme();
  return <span data-theme={theme}>{theme}</span>;
}

function renderWithoutWindow(node: React.ReactElement): string {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    // @ts-expect-error
    delete (globalThis as Record<string, unknown>).window;
    return renderToStaticMarkup(node);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
  }
}

describe("getInitialTheme SSR guard (typeof window === 'undefined')", () => {
  afterEach(() => {
    if (typeof window === "undefined") {
      (globalThis as Record<string, unknown>).window = globalThis;
    }
  });

  it("returns 'dark' during server render when there is no window", () => {
    const original = globalThis.window;
    let html = "";
    try {
      // @ts-expect-error
      delete (globalThis as Record<string, unknown>).window;
      expect(typeof window).toBe("undefined");
      html = renderToStaticMarkup(
        <ThemeProvider>
          <ThemeProbe />
        </ThemeProvider>,
      );
    } finally {
      (globalThis as Record<string, unknown>).window = original;
    }
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain(">dark<");
  });

  it("does not throw and yields a dark theme via the helper wrapper", () => {
    const html = renderWithoutWindow(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(html).toContain('data-theme="dark"');
    expect(typeof window).toBe("object");
  });
});
