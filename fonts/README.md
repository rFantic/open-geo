# Bundled report fonts

These OFL fonts let `report.generate` render the **PDF report** in every shipped
locale — including **Chinese (`--lang zh`)** and **Arabic (`--lang ar`)** — without any
system fonts. The dashboard uses browser fonts; only the PDF needs these.

| file | role |
|---|---|
| `NotoSansSC-Regular.ttf`, `NotoSansSC-Bold.ttf` | CJK face for `--lang zh` (also the matplotlib fallback for CJK data in any locale) |
| `NotoNaskhArabic-Regular.ttf`, `NotoNaskhArabic-Bold.ttf` | Arabic face for `--lang ar` (text is reshaped + bidi-reordered before drawing — see `report/textshape.py`) |
| `OFL-NotoSansSC.txt`, `OFL-NotoNaskhArabic.txt` | upstream SIL Open Font License 1.1 texts (required by the license) |
| `build.py` | regenerates the four `.ttf` faces from the upstream variable fonts |

English/Russian keep using **DejaVu Sans** (already bundled with matplotlib); the report
picks the face per `--lang` in `report.generate.register_fonts`.

## Provenance & license

Both families are from [google/fonts](https://github.com/google/fonts) under the
**SIL Open Font License 1.1** (texts above). The committed faces are **subset + instanced**
derivatives of the upstream `wght` variable fonts:

- **Noto Sans SC** — `ofl/notosanssc/NotoSansSC[wght].ttf`. Its OFL carries the Reserved Font
  Name **“Source”** (inherited from Adobe Source Han Sans). The bundled face keeps the upstream
  **“Noto Sans SC”** name, which does **not** use that reserved name, so subsetting is compliant.
- **Noto Naskh Arabic** — `ofl/notonaskharabic/NotoNaskhArabic[wght].ttf` (no reserved name).

The three delta-arrow glyphs the report draws (`▲ ▼ ▬`) are **synthesized geometric shapes**
added during the build (they are outside the Noto subsets); no third-party glyph is copied, so
the modified faces stay OFL-only.

## What `build.py` does

`python fonts/build.py` (needs network + `fonttools`):

1. Downloads the upstream variable fonts + OFL texts into `fonts/.cache/` (git-ignored).
2. Instances each at `wght=400` (Regular) and `wght=700` (Bold).
3. Subsets:
   - **Noto Sans SC → GB2312** (~6,763 common Simplified-Chinese hanzi) **plus** every codepoint
     used by the `i18n/*.json` UI strings, Latin, and punctuation. This keeps the repo light
     (~2 MB/face vs ~18 MB full) while covering the vast majority of real Chinese text. Rare or
     Traditional characters outside GB2312 may render as `notdef`.
   - **Noto Naskh Arabic → full coverage** (it is small), including the Arabic Presentation Forms
     the reshaper emits.
4. Drops OpenType layout, variation, vertical-metrics, and hinting tables — the report
   **pre-shapes** Arabic (reshape → bidi) and renders horizontally, so the font's own shaping is
   not needed.
5. Synthesizes and injects the `▲ ▼ ▬` glyphs, sets clean family/weight names, and writes the
   four faces here.

Re-run it whenever the locale set or `i18n/*.json` chrome changes, then commit the updated `.ttf`
faces.
