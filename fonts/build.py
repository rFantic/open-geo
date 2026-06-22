from __future__ import annotations

import os
import urllib.request

from fontTools import subset
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
I18N_DIR = os.path.join(os.path.dirname(HERE), "i18n")

SOURCES = {
    "NotoSansSC-VF.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf",
    "NotoNaskhArabic-VF.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/notonaskharabic/NotoNaskhArabic%5Bwght%5D.ttf",
    "OFL-NotoSansSC.txt": "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/OFL.txt",
    "OFL-NotoNaskhArabic.txt": "https://raw.githubusercontent.com/google/fonts/main/ofl/notonaskharabic/OFL.txt",
}

ASCII_LATIN = set(range(0x20, 0x100))
PUNCT = set(range(0x2010, 0x2030)) | set(range(0x3000, 0x3040)) | set(range(0xFF00, 0xFFF0))
SYMBOLS = {0x2014, 0x2013, 0x2212, 0x2022, 0x00B7, 0x2026, 0x2018, 0x2019, 0x201C, 0x201D, 0x2192}
KEEP_TABLES = {"cmap", "glyf", "loca", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "GlyphOrder"}

ARROW_ADVANCE = 940
ARROW_CONTOURS = {
    0x25B2: [[(490, 690), (840, 130), (140, 130)]],
    0x25BC: [[(490, 130), (840, 690), (140, 690)]],
    0x25AC: [[(120, 470), (860, 470), (860, 300), (120, 300)]],
}


def fetch(name: str) -> str:
    os.makedirs(CACHE, exist_ok=True)
    dst = os.path.join(CACHE, name)
    if not os.path.isfile(dst):
        print(f"  download {name}")
        urllib.request.urlretrieve(SOURCES[name], dst)
    return dst


def chrome_codepoints() -> set[int]:
    cps: set[int] = set()
    for name in ("en.json", "ru.json", "zh.json", "ar.json"):
        with open(os.path.join(I18N_DIR, name), encoding="utf-8") as fh:
            cps |= {ord(ch) for ch in fh.read()}
    return cps


def gb2312_hanzi() -> set[int]:
    out: set[int] = set()
    for cp in range(0x4E00, 0xA000):
        try:
            chr(cp).encode("gb2312")
            out.add(cp)
        except UnicodeEncodeError:
            pass
    return out


def instanced(vf_path: str, wght: int) -> TTFont:
    return instancer.instantiateVariableFont(TTFont(vf_path), {"wght": wght}, inplace=False)


def subset_to(font: TTFont, unicodes: set[int]) -> None:
    opts = subset.Options()
    opts.glyph_names = False
    opts.name_IDs = ["*"]
    opts.name_legacy = True
    opts.recalc_bounds = True
    opts.layout_features = []
    opts.hinting = False
    opts.notdef_outline = True
    sub = subset.Subsetter(options=opts)
    sub.populate(unicodes=sorted(unicodes))
    sub.subset(font)


def slim(font: TTFont) -> TTFont:
    for tag in list(font.keys()):
        if tag not in KEEP_TABLES:
            del font[tag]
    return font


def _synth_glyph(font: TTFont, contours: list[list[tuple[int, int]]]):
    pen = TTGlyphPen(None)
    for contour in contours:
        pen.moveTo(contour[0])
        for pt in contour[1:]:
            pen.lineTo(pt)
        pen.closePath()
    glyph = pen.glyph()
    glyph.recalcBounds(font["glyf"])
    return glyph


def inject_arrows(font: TTFont) -> list[int]:
    have = set(font.getBestCmap().keys())
    injected: list[int] = []
    for cp, contours in ARROW_CONTOURS.items():
        if cp in have:
            continue
        gn = f"arrow{cp:04X}"
        font["glyf"][gn] = _synth_glyph(font, contours)
        lsb = min(pt[0] for contour in contours for pt in contour)
        font["hmtx"][gn] = (ARROW_ADVANCE, lsb)
        for st in font["cmap"].tables:
            if st.platformID in (0, 3):
                st.cmap[cp] = gn
        injected.append(cp)
    return injected


def set_names(font: TTFont, family: str, bold: bool) -> None:
    sub = "Bold" if bold else "Regular"
    full = f"{family} {sub}" if bold else family
    ps = family.replace(" ", "") + ("-Bold" if bold else "-Regular")
    name = font["name"]
    for nid, val in ((1, family), (2, sub), (4, full), (6, ps), (16, family), (17, sub)):
        name.setName(val, nid, 3, 1, 0x409)
        name.setName(val, nid, 1, 0, 0)
    os2 = font["OS/2"]
    os2.usWeightClass = 700 if bold else 400
    if bold:
        os2.fsSelection = (os2.fsSelection & ~0x40) | 0x20
        font["head"].macStyle |= 0x01
    else:
        os2.fsSelection = (os2.fsSelection & ~0x20) | 0x40
        font["head"].macStyle &= ~0x01


def build_family(vf_name: str, family: str, stem: str, unicodes: set[int]) -> None:
    vf = fetch(vf_name)
    for wght, bold, suffix in ((400, False, "Regular"), (700, True, "Bold")):
        f = slim(instanced(vf, wght))
        subset_to(f, unicodes)
        slim(f)
        injected = inject_arrows(f)
        set_names(f, family, bold)
        out = os.path.join(HERE, f"{stem}-{suffix}.ttf")
        f.save(out)
        print(f"  {stem}-{suffix}.ttf: {os.path.getsize(out) // 1024} KB  arrows={[hex(c) for c in injected]}")


def copy_licenses() -> None:
    for name in ("OFL-NotoSansSC.txt", "OFL-NotoNaskhArabic.txt"):
        with open(fetch(name), "rb") as fh:
            data = fh.read()
        with open(os.path.join(HERE, name), "wb") as fh:
            fh.write(data)


def main() -> int:
    chrome = chrome_codepoints()
    base = ASCII_LATIN | PUNCT | SYMBOLS | chrome
    cjk_unicodes = base | gb2312_hanzi()
    print(f"Noto Sans SC -> GB2312 + chrome ({len(cjk_unicodes)} target codepoints)")
    build_family("NotoSansSC-VF.ttf", "Noto Sans SC", "NotoSansSC", cjk_unicodes)
    arabic_full = set(TTFont(fetch("NotoNaskhArabic-VF.ttf")).getBestCmap().keys())
    print(f"Noto Naskh Arabic -> full coverage ({len(arabic_full | base)} target codepoints)")
    build_family("NotoNaskhArabic-VF.ttf", "Noto Naskh Arabic", "NotoNaskhArabic", arabic_full | base)
    copy_licenses()
    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
