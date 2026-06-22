from __future__ import annotations

import json
import os

import pytest

from report import i18n
from report.i18n import (
    DEFAULT_LANG,
    Translator,
    available_codes,
    available_languages,
)

_I18N_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(i18n.__file__))), "i18n"
)


def _load(name: str) -> object:
    with open(os.path.join(_I18N_DIR, name), "r", encoding="utf-8") as fh:
        return json.load(fh)


def _flatten_ref(d: dict, prefix: str = "") -> dict:
    out: dict = {}
    for k, v in d.items():
        full = f"{prefix}{k}"
        if isinstance(v, dict):
            out.update(_flatten_ref(v, prefix=f"{full}."))
        else:
            out[full] = v
    return out


EN_RAW = _load("en.json")
RU_RAW = _load("ru.json")
LOCALES_RAW = _load("locales.json")
EN_FLAT = _flatten_ref(EN_RAW)
RU_FLAT = _flatten_ref(RU_RAW)


def test_flatten_empty_dict():
    assert i18n._flatten({}) == {}


def test_flatten_flat_dict_unchanged():
    src = {"a": "x", "b": "y", "dash": "—"}
    assert i18n._flatten(src) == {"a": "x", "b": "y", "dash": "—"}


def test_flatten_one_level_nesting():
    assert i18n._flatten({"a": {"b": "x"}, "c": "y"}) == {"a.b": "x", "c": "y"}


def test_flatten_deep_nesting():
    src = {"a": {"b": {"c": "deep"}}, "top": "t"}
    assert i18n._flatten(src) == {"a.b.c": "deep", "top": "t"}


def test_flatten_mixed_siblings():
    src = {"ns": {"k1": "1", "k2": "2"}, "leaf": "L"}
    assert i18n._flatten(src) == {"ns.k1": "1", "ns.k2": "2", "leaf": "L"}


def test_flatten_preserves_non_string_leaf_value():
    src = {"a": {"n": 5}, "b": None, "c": ["x"]}
    assert i18n._flatten(src) == {"a.n": 5, "b": None, "c": ["x"]}


def test_flatten_matches_real_en_json():
    assert i18n._flatten(EN_RAW) == EN_FLAT
    assert "report.section_kpi" in i18n._flatten(EN_RAW)


def test_available_languages_matches_locales_json():
    langs = available_languages()
    assert langs == LOCALES_RAW
    assert all(set(entry) == {"code", "name"} for entry in langs)


def test_available_languages_contains_en_and_ru_entries():
    by_code = {e["code"]: e["name"] for e in available_languages()}
    assert by_code["en"] == "English"
    assert by_code["ru"] == "Русский"


def test_available_codes_includes_en_and_ru():
    codes = available_codes()
    assert "en" in codes
    assert "ru" in codes
    assert codes == [e["code"] for e in LOCALES_RAW]


def test_translator_default_is_english():
    t = Translator()
    assert t.lang == DEFAULT_LANG == "en"
    assert t._strings == EN_FLAT


def test_translator_empty_lang_falls_back_to_default():
    t = Translator("")
    assert t.lang == "en"
    assert t._strings == EN_FLAT


def test_translator_en_does_not_overlay_branch():
    t = Translator("en")
    assert t._strings == EN_FLAT


def test_translator_ru_overlays_translations():
    t = Translator("ru")
    assert t.lang == "ru"
    assert t._strings == RU_FLAT


def test_translator_unknown_language_keeps_english_base():
    t = Translator("xx")
    assert t.lang == "xx"
    assert t._strings == EN_FLAT
    assert t.t("common.app_subtitle") == EN_FLAT["common.app_subtitle"]
    assert t.t("common.app_subtitle") != RU_FLAT["common.app_subtitle"]


def test_has_true_for_existing_key():
    assert Translator("en").has("report.section_kpi") is True


def test_has_false_for_missing_key():
    assert Translator("en").has("report.does_not_exist") is False


def test_has_true_for_key_only_present_via_english_base_under_unknown_lang():
    assert Translator("xx").has("report.section_kpi") is True


def test_t_returns_real_english_value():
    t = Translator("en")
    val = t.t("report.section_kpi")
    assert val == EN_FLAT["report.section_kpi"] == "Key metrics"
    assert val and val != "report.section_kpi"


def test_t_unknown_key_returns_key_verbatim():
    t = Translator("en")
    assert t.t("totally.unknown.key") == "totally.unknown.key"


def test_t_unknown_key_with_vars_still_returns_key():
    t = Translator("en")
    assert t.t("missing.key", n=3) == "missing.key"


def test_t_substitutes_named_placeholders():
    t = Translator("en")
    out = t.t("report.card_coverage_sub", n_overviews=3, n_queries=5)
    assert "3" in out
    assert "5" in out
    assert out == EN_FLAT["report.card_coverage_sub"].format(
        n_overviews=3, n_queries=5
    )
    assert "{" not in out and "}" not in out


def test_t_vars_on_template_without_placeholders_returns_template():
    t = Translator("en")
    assert t.t("report.section_kpi", unused="ignored") == "Key metrics"


def test_t_no_vars_returns_template_unformatted():
    t = Translator("en")
    raw = EN_FLAT["dashboard.run_context_run"]
    assert t.t("dashboard.run_context_run") == raw
    assert "{id}" in raw


def test_t_missing_placeholder_var_does_not_raise():
    t = Translator("en")
    template = EN_FLAT["dashboard.run_context_all"]
    assert "{n}" in template
    out = t.t("dashboard.run_context_all", wrong=1)
    assert out == template
    assert "{n}" in out


def test_t_stray_brace_value_error_is_caught():
    t = Translator("en")
    t._strings = dict(t._strings)
    t._strings["test.bad_template"] = "hello {unterminated"
    out = t.t("test.bad_template", unterminated="x")
    assert out == "hello {unterminated"


def test_t_index_error_is_caught_for_positional_placeholder():
    t = Translator("en")
    t._strings = dict(t._strings)
    t._strings["test.positional"] = "value: {0}"
    out = t.t("test.positional", x=1)
    assert out == "value: {0}"


def test_t_ru_returns_russian_value_when_translated():
    t = Translator("ru")
    assert EN_FLAT["common.app_subtitle"] != RU_FLAT["common.app_subtitle"]
    assert t.t("common.app_subtitle") == RU_FLAT["common.app_subtitle"]


def test_t_ru_value_used_for_key_identical_in_both_locales():
    t = Translator("ru")
    assert EN_FLAT["report.delta_zero"] == RU_FLAT["report.delta_zero"] == "0"
    assert t.t("report.delta_zero") == "0"


def test_t_per_key_fallback_to_english_for_untranslated_key():
    t = Translator("xx")
    assert t.t("metrics.overview_coverage.label") == (
        EN_FLAT["metrics.overview_coverage.label"]
    )
    assert t.t("metrics.overview_coverage.label") != (
        RU_FLAT["metrics.overview_coverage.label"]
    )


def test_t_ru_partial_overlay_fallback_via_monkeypatched_strings():
    t = Translator("ru")
    t._strings = dict(t._strings)
    del t._strings["metrics.overview_coverage.label"]
    assert t.t("metrics.overview_coverage.label") == "metrics.overview_coverage.label"
    t._strings["metrics.overview_coverage.label"] = EN_FLAT[
        "metrics.overview_coverage.label"
    ]
    assert t.t("metrics.overview_coverage.label") == (
        EN_FLAT["metrics.overview_coverage.label"]
    )


def test_t_non_string_value_is_stringified():
    t = Translator("en")
    t._strings = dict(t._strings)
    t._strings["test.int_value"] = 42
    t._strings["test.list_value"] = [1, 2]
    assert t.t("test.int_value") == "42"
    assert t.t("test.int_value", n=99) == "42"
    assert t.t("test.list_value") == "[1, 2]"


def test_t_non_string_none_value_is_stringified():
    t = Translator("en")
    t._strings = dict(t._strings)
    t._strings["test.none_value"] = None
    assert t.t("test.none_value") == "None"


def test_t_unicode_russian_preserved():
    t = Translator("ru")
    val = t.t("report.section_kpi")
    assert val == "Ключевые показатели"
    assert any("Ѐ" <= ch <= "ӿ" for ch in val)


def test_default_lang_constant_and_exports():
    assert DEFAULT_LANG == "en"
    assert set(i18n.__all__) == {
        "Translator",
        "available_languages",
        "available_codes",
        "DEFAULT_LANG",
    }


def test_flatten_empty_nested_dict_collapses_to_nothing():
    assert i18n._flatten({"a": {}}) == {}


def test_flatten_empty_nested_dict_mixed_with_leaf():
    assert i18n._flatten({"a": {}, "b": "x"}) == {"b": "x"}


def test_flatten_deep_empty_nested_collapses():
    assert i18n._flatten({"a": {"b": {}}}) == {}


def test_flatten_does_not_mutate_input():
    src = {"a": {"b": "x"}, "c": "y"}
    snapshot = {"a": {"b": "x"}, "c": "y"}
    _ = i18n._flatten(src)
    assert src == snapshot
    assert src["a"] == {"b": "x"}


def test_flatten_falsy_string_leaf_preserved():
    assert i18n._flatten({"a": {"k": ""}, "b": ""}) == {"a.k": "", "b": ""}


def test_available_codes_derives_from_languages_and_is_stable():
    langs = available_languages()
    assert available_codes() == [e["code"] for e in langs]
    assert available_languages() == available_languages()
    assert available_codes() == available_codes()


def test_available_languages_returns_fresh_object_each_call():
    first = available_languages()
    first.append({"code": "zz", "name": "Bogus"})
    first[0]["name"] = "MUTATED"
    second = available_languages()
    assert {"code": "zz", "name": "Bogus"} not in second
    assert second[0]["name"] == "English"


def test_translator_none_lang_falls_back_to_default():
    t = Translator(None)
    assert t.lang == "en"
    assert t._strings == EN_FLAT


def test_translator_instances_do_not_share_strings():
    a = Translator("en")
    b = Translator("en")
    a._strings["injected.key"] = "x"
    assert "injected.key" not in b._strings
    assert b.t("injected.key") == "injected.key"


def test_translator_ru_strings_not_aliased_to_en_base():
    en = Translator("en")
    ru = Translator("ru")
    assert en._strings is not ru._strings
    assert en.t("common.app_subtitle") != ru.t("common.app_subtitle")


def test_en_ru_have_identical_key_sets():
    assert set(EN_FLAT) == set(RU_FLAT)


def test_every_registered_code_builds_complete_translator():
    for code in available_codes():
        t = Translator(code)
        assert set(t._strings) >= set(EN_FLAT)
        val = t.t("report.section_kpi")
        assert val and val != "report.section_kpi"


def test_zh_and_ar_have_identical_key_sets_to_en():
    zh = _flatten_ref(_load("zh.json"))
    ar = _flatten_ref(_load("ar.json"))
    assert set(zh) == set(EN_FLAT)
    assert set(ar) == set(EN_FLAT)


def test_no_registered_locale_has_keys_outside_en_contract():
    en_keys = set(EN_FLAT)
    for code in available_codes():
        flat = _flatten_ref(_load(f"{code}.json"))
        extra = set(flat) - en_keys
        assert not extra, f"{code}.json has keys not in en.json: {sorted(extra)}"


def test_zh_ar_are_translated_with_brand_nouns_kept_verbatim():
    zh = _flatten_ref(_load("zh.json"))
    ar = _flatten_ref(_load("ar.json"))
    assert zh["common.app_subtitle"] != EN_FLAT["common.app_subtitle"]
    assert ar["common.app_subtitle"] != EN_FLAT["common.app_subtitle"]
    for loc in (zh, ar):
        assert loc["common.app_title"] == "open-geo"
        assert loc["report.cover_brandline"] == EN_FLAT["report.cover_brandline"]
        assert loc["dashboard.footer"] == EN_FLAT["dashboard.footer"]


def test_zh_ar_registered_in_locales_with_native_names():
    by_code = {e["code"]: e["name"] for e in available_languages()}
    assert by_code["zh"] == "中文"
    assert by_code["ar"] == "العربية"


def test_t_ru_placeholder_substitution_uses_russian_template():
    t = Translator("ru")
    out = t.t("report.card_coverage_sub", n_overviews=3, n_queries=5)
    assert out == RU_FLAT["report.card_coverage_sub"].format(
        n_overviews=3, n_queries=5
    )
    assert "3" in out and "5" in out and "из" in out
    assert "{" not in out and "}" not in out


def test_t_multiple_distinct_placeholders_all_filled():
    t = Translator("en")
    out = t.t("dashboard.run_context_run", id=7, datetime="2026-06-19", status="done")
    assert out == "Run #7 · 2026-06-19 · done"


def test_t_extra_unused_var_is_ignored_on_real_template():
    t = Translator("en")
    out = t.t("report.card_coverage_sub", n_overviews=1, n_queries=2, bogus="zzz")
    assert out == "1 of 2 queries"


def test_t_partial_vars_raises_keyerror_caught_returns_template():
    t = Translator("en")
    raw = EN_FLAT["report.card_coverage_sub"]
    out = t.t("report.card_coverage_sub", n_overviews=3)
    assert out == raw
    assert "{n_overviews}" in out and "{n_queries}" in out


def test_t_swallows_double_close_brace_value_error():
    t = Translator("en")
    t._strings = dict(t._strings)
    t._strings["test.lone_close"] = "ok } bad"
    assert t.t("test.lone_close", x=1) == "ok } bad"


def test_t_swallows_bad_format_spec_value_error():
    t = Translator("en")
    t._strings = dict(t._strings)
    t._strings["test.bad_spec"] = "{x:zzz}"
    assert t.t("test.bad_spec", x=5) == "{x:zzz}"


def test_t_swallows_unknown_conversion_value_error():
    t = Translator("en")
    t._strings = dict(t._strings)
    t._strings["test.bad_conv"] = "{x!q}"
    assert t.t("test.bad_conv", x=5) == "{x!q}"


def test_t_does_NOT_swallow_typeerror_from_subscript_template():
    t = Translator("en")
    t._strings = dict(t._strings)
    t._strings["test.subscript"] = "{x[0]}"
    with pytest.raises(TypeError):
        t.t("test.subscript", x=5)


def test_t_does_NOT_swallow_attributeerror_from_attr_template():
    t = Translator("en")
    t._strings = dict(t._strings)
    t._strings["test.attr"] = "{x.foo}"
    with pytest.raises(AttributeError):
        t.t("test.attr", x=5)


def test_t_subscript_template_with_no_vars_is_safe():
    t = Translator("en")
    t._strings = dict(t._strings)
    t._strings["test.subscript_safe"] = "{x[0]}"
    assert t.t("test.subscript_safe") == "{x[0]}"


def test_t_non_string_bool_and_float_stringified():
    t = Translator("en")
    t._strings = dict(t._strings)
    t._strings["test.bool_value"] = True
    t._strings["test.float_value"] = 3.5
    t._strings["test.dict_value"] = {"k": "v"}
    assert t.t("test.bool_value") == "True"
    assert t.t("test.float_value") == "3.5"
    assert t.t("test.dict_value") == "{'k': 'v'}"


def test_t_non_string_value_with_placeholderish_vars_does_not_format():
    t = Translator("en")
    t._strings = dict(t._strings)
    t._strings["test.numlike"] = 7
    assert t.t("test.numlike", x="ignored") == "7"


def test_has_false_for_empty_string_key():
    assert Translator("en").has("") is False


def test_has_reflects_injected_non_string_leaf_key():
    t = Translator("en")
    t._strings = dict(t._strings)
    t._strings["test.injected_nonstr"] = 0
    assert t.has("test.injected_nonstr") is True
    assert t.has("test.definitely_absent") is False


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(pytest.main([__file__, "-q"]))
