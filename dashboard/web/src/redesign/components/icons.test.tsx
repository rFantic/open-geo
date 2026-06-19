
import { render } from "@testing-library/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  DownloadIcon,
  InfoIcon,
  MinusIcon,
  MoonIcon,
  SunIcon,
} from "./icons";

function svgOf(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector("svg");
  if (!svg) throw new Error("expected an <svg> element");
  return svg as SVGSVGElement;
}

const ICONS = [
  { name: "InfoIcon", Comp: InfoIcon, childCount: 3 },
  { name: "SunIcon", Comp: SunIcon, childCount: 2 },
  { name: "MoonIcon", Comp: MoonIcon, childCount: 1 },
  { name: "ArrowUpIcon", Comp: ArrowUpIcon, childCount: 2 },
  { name: "ArrowDownIcon", Comp: ArrowDownIcon, childCount: 2 },
  { name: "MinusIcon", Comp: MinusIcon, childCount: 1 },
  { name: "DownloadIcon", Comp: DownloadIcon, childCount: 3 },
  { name: "ChevronDownIcon", Comp: ChevronDownIcon, childCount: 1 },
  { name: "CheckIcon", Comp: CheckIcon, childCount: 1 },
] as const;

describe("icons", () => {
  describe.each(ICONS)("$name", ({ Comp, childCount }) => {
    it("renders a single <svg> with the shared line-icon attributes", () => {
      const { container } = render(<Comp />);
      const svg = svgOf(container);

      expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
      expect(svg).toHaveAttribute("fill", "none");
      expect(svg).toHaveAttribute("stroke", "currentColor");
      expect(svg).toHaveAttribute("stroke-width", "2");
      expect(svg).toHaveAttribute("stroke-linecap", "round");
      expect(svg).toHaveAttribute("stroke-linejoin", "round");
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("focusable", "false");
    });

    it("defaults width/height to size=18 when no size prop is given", () => {
      const { container } = render(<Comp />);
      const svg = svgOf(container);
      expect(svg).toHaveAttribute("width", "18");
      expect(svg).toHaveAttribute("height", "18");
    });

    it("uses an explicit size for both width and height", () => {
      const { container } = render(<Comp size={32} />);
      const svg = svgOf(container);
      expect(svg).toHaveAttribute("width", "32");
      expect(svg).toHaveAttribute("height", "32");
    });

    it("renders its geometry children inside the <svg>", () => {
      const { container } = render(<Comp />);
      const svg = svgOf(container);
      expect(svg.childElementCount).toBe(childCount);
    });

    it("forwards arbitrary SVG props (className, aria-label, role) via {...props}", () => {
      const { container } = render(
        <Comp className="custom-icon" aria-label="decorative" role="img" />,
      );
      const svg = svgOf(container);
      expect(svg).toHaveClass("custom-icon");
      expect(svg).toHaveAttribute("aria-label", "decorative");
      expect(svg).toHaveAttribute("role", "img");
    });
  });

  it("renders distinct geometry per icon (sanity: not all the same path)", () => {
    const info = svgOf(render(<InfoIcon />).container).innerHTML;
    const check = svgOf(render(<CheckIcon />).container).innerHTML;
    expect(info).not.toBe(check);
  });
});
