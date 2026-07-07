from __future__ import annotations

import json
import os
from typing import Any

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_I18N_DIR = os.path.join(_REPO_ROOT, "i18n")

DEFAULT_LANG = "en"


def _i18n_path(name: str) -> str:
    return os.path.join(_I18N_DIR, name)


def _load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _flatten(d: dict[str, Any], prefix: str = "") -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, val in d.items():
        full = f"{prefix}{key}"
        if isinstance(val, dict):
            out.update(_flatten(val, prefix=f"{full}."))
        else:
            out[full] = val
    return out


def available_languages() -> list[dict[str, str]]:
    return _load_json(_i18n_path("locales.json"))


def available_codes() -> list[str]:
    return [entry["code"] for entry in available_languages()]


class Translator:

    def __init__(self, lang: str = DEFAULT_LANG):
        self.lang = lang or DEFAULT_LANG

        merged = _flatten(_load_json(_i18n_path(f"{DEFAULT_LANG}.json")))
        if self.lang != DEFAULT_LANG:
            lang_path = _i18n_path(f"{self.lang}.json")
            if os.path.isfile(lang_path):
                merged.update(_flatten(_load_json(lang_path)))
        self._strings: dict[str, Any] = merged

    def has(self, key: str) -> bool:
        return key in self._strings

    def t(self, key: str, **vars: Any) -> str:
        value = self._strings.get(key, key)
        if not isinstance(value, str):
            return str(value)
        if not vars:
            return value
        try:
            return value.format(**vars)
        except (KeyError, IndexError, ValueError):
            return value


__all__ = [
    "Translator",
    "available_languages",
    "available_codes",
    "DEFAULT_LANG",
]
