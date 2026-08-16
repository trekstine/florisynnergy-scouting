"""The name matcher decides whether a scouting round survives the trip.

Every case here is a spelling that has actually turned up in the field data or
that a scout could plausibly type. A regression in this file means silently
losing observations, so it is worth the specificity.
"""
from __future__ import annotations

from app.services.matching import Resolution, normalise
from app.services.matching import ReferenceResolver, _variants


def _resolver(
    greenhouses: dict[str, int] | None = None,
    pests: dict[str, int] | None = None,
    diseases: dict[str, int] | None = None,
    varieties: dict[str, tuple[int, str]] | None = None,
    aliases: dict[tuple[str, str], int] | None = None,
) -> ReferenceResolver:
    """Build a resolver without a database, keyed the way `load` would."""
    r = ReferenceResolver()
    for text, gid in (greenhouses or {}).items():
        for v in _variants(text):
            r._greenhouses.setdefault(v, gid)
    for text, pid in (pests or {}).items():
        for v in _variants(text):
            r._pests.setdefault(v, pid)
    for text, did in (diseases or {}).items():
        for v in _variants(text):
            r._diseases.setdefault(v, did)
    for text, val in (varieties or {}).items():
        for v in _variants(text):
            r._varieties.setdefault(v, val)
    r._aliases.update(aliases or {})
    return r


# ── normalisation ───────────────────────────────────────────────────────────
def test_normalise_strips_case_space_and_punctuation():
    assert normalise("  Greenhouse-01 ") == "greenhouse01"
    assert normalise("Powdery Mildew") == "powderymildew"
    assert normalise(None) == ""


def test_variants_cover_zero_padding():
    assert "greenhouse1" in _variants("Greenhouse 01")
    assert "gh1" in _variants("GH01")


# ── greenhouses ─────────────────────────────────────────────────────────────
def test_greenhouse_matches_name_code_and_spacing():
    r = _resolver(greenhouses={"Greenhouse 01": 7, "GH01": 7})
    for text in ("Greenhouse 01", "greenhouse 1", "GH01", "gh-1", "  GH 01  "):
        assert r.greenhouse(text) == 7, text


def test_greenhouse_unknown_returns_none():
    r = _resolver(greenhouses={"Greenhouse 01": 7})
    assert r.greenhouse("Packhouse") is None
    assert r.greenhouse("") is None
    assert r.greenhouse(None) is None


def test_alias_beats_everything():
    # `load` stores alias keys already normalised, so the test seeds them the
    # same way — this asserts the lookup, not the spelling of the fixture.
    r = _resolver(
        greenhouses={"Greenhouse 01": 7},
        aliases={("greenhouse", normalise("Block A")): 99},
    )
    assert r.greenhouse("Block A") == 99
    assert r.greenhouse("block-a") == 99


# ── pests and diseases ──────────────────────────────────────────────────────
def test_pest_exact_and_qualified_names():
    r = _resolver(pests={"Thrips": 3, "Spider Mites": 4})
    assert r.pest("thrips") == 3
    assert r.pest("Thrips (western flower)") == 3
    assert r.pest("Spider mites") == 4


def test_ambiguous_containment_is_refused_not_guessed():
    # "mite" appears in two references, so a partial match must not pick one.
    r = _resolver(pests={"Spider Mites": 4, "Broad Mites": 5})
    assert r.pest("mites") is None


def test_short_input_never_partial_matches():
    r = _resolver(pests={"Thrips": 3})
    assert r.pest("th") is None


def test_disease_lookup_is_separate_from_pest():
    r = _resolver(pests={"Thrips": 3}, diseases={"Downy Mildew": 8})
    assert r.disease("downy mildew") == 8
    assert r.disease("Thrips") is None


# ── varieties ───────────────────────────────────────────────────────────────
def test_variety_returns_canonical_code():
    r = _resolver(varieties={"SOLF": (2, "SOLF"), "SolarFlare": (2, "SOLF")})
    assert r.variety("solarflare") == (2, "SOLF")
    assert r.variety("SOLF") == (2, "SOLF")


def test_unknown_variety_keeps_the_text_it_was_given():
    r = _resolver(varieties={"SOLF": (2, "SOLF")})
    assert r.variety(" Mystery Rose ") == (None, "Mystery Rose")


# ── the report of what could not be placed ──────────────────────────────────
def test_resolution_collects_and_dedupes_misses():
    res = Resolution()
    res.miss("pest", "Red Spider")
    res.miss("pest", "Red Spider")
    res.miss("greenhouse", "Block Z")
    res.miss("pest", "")  # empty names are not worth reporting
    assert res.as_dict() == {"pest": ["Red Spider"], "greenhouse": ["Block Z"]}


def test_resolution_is_empty_when_everything_matched():
    assert Resolution().as_dict() == {}
