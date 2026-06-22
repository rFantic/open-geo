from __future__ import annotations

from typing import Optional

RTL_LANGS = {"ar"}

try:
    import arabic_reshaper

    try:
        from bidi.algorithm import get_display
    except ImportError:  # pragma: no cover
        from bidi import get_display

    _SHAPING = True
except Exception:  # pragma: no cover
    _SHAPING = False


def is_rtl(lang: Optional[str]) -> bool:
    return (lang or "") in RTL_LANGS


def shaping_available() -> bool:
    return _SHAPING


def shape(text: str, lang: Optional[str]) -> str:
    if not _SHAPING:  # pragma: no cover
        return text
    if not text or not is_rtl(lang):
        return text
    return get_display(arabic_reshaper.reshape(text))


__all__ = ["RTL_LANGS", "is_rtl", "shape", "shaping_available"]
