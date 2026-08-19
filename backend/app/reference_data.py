"""The pests and diseases the farm actually scouts for, and what they get called.

The Credible Blooms app offers seventeen pests and nine diseases from a
hard-coded list. The portal seeded six and four. Anything the app sent that the
portal had no row for arrived with a null foreign key — the name survived only
as a line in the record's note, so it never appeared in a filter, a matrix, a
pressure index or a recommendation. To a farm manager the observation had
simply vanished.

Two things are needed to close that, and they are different:

* **Rows** for every organism the app can report, so the record has something
  to point at.
* **Aliases** for the ways the app spells them, so "White flies", "FCM" and
  "Redspider mites" land on the rows that already exist instead of creating
  four more pests that mean the same thing.

The merges below are deliberately conservative. Only clear spelling and
formatting variants are folded together. Species that share a common name but
not a chemistry — Spodoptera, Helicoverpa and the Farol caterpillar are all
"caterpillars" to a scout — stay separate, because a recommendation that picks
the wrong product for the right-sounding pest is worse than no recommendation.

**Thresholds on the new rows are provisional.** The original six pests carry
economic thresholds somebody chose deliberately; these do not, and nothing here
should be read as agronomic advice. They are seeded `is_provisional=True`,
which keeps them out of the recommendation engine and flags them in the portal
until the farm's agronomist sets a real figure.
"""
from __future__ import annotations

# (canonical name, category, alias spellings the app uses)
#
# The first six match the names already seeded, so this list adds aliases to
# them rather than duplicating them.
PESTS: list[tuple[str, str, list[str]]] = [
    ("Spider Mites", "Mite", ["Mites", "Live mites", "Redspider mites", "Mites damage", "Red spider mites"]),
    ("Thrips", "Insect", ["Thrip"]),
    ("Whitefly", "Insect", ["White flies", "Whiteflies", "White fly"]),
    ("Aphids", "Insect", ["Aphid"]),
    ("False Codling Moth", "Moth", ["FCM", "False codling moth"]),
    ("Caterpillars", "Larvae", ["Caterpillers", "Caterpillar"]),
    # ── Added for parity with the app ──
    # Distinct species that a scout may report as "caterpillars" but which take
    # different products; kept apart on purpose.
    ("Helicoverpa armigera", "Larvae", ["Helcoverpa armigera", "Helicoverpa", "African bollworm", "Bollworm"]),
    ("Spodoptera", "Larvae", ["Spodoptera littoralis", "African armyworm", "Armyworm"]),
    ("Farol Caterpillar", "Larvae", ["Farol caterpillar", "Farol"]),
    ("Leafminers", "Insect", ["Leaf miners", "Leafminer", "Leaf miner"]),
    ("Leaf Borers", "Insect", ["Leaf borers", "Leafborers", "Borers"]),
    ("Mealybugs", "Insect", ["Mealy bugs", "Mealy bug", "Mealybug"]),
    ("Nematodes", "Nematode", ["Nematode", "Root knot nematodes"]),
]

# (canonical name, alias spellings the app uses)
DISEASES: list[tuple[str, list[str]]] = [
    ("Downy Mildew", ["Downey mildew", "Downy mildew"]),
    ("Powdery Mildew", ["Powdery mildew"]),
    ("Botrytis", ["Botrytis cinerea", "Grey mould", "Gray mold"]),
    # Black spot (Diplocarpon rosae) and a generic leaf spot are not the same
    # diagnosis, so the app's "Leaf spot" gets its own row rather than folding
    # into the black spot the portal already had.
    ("Black Spot", ["Blackspot", "Black spot"]),
    # ── Added for parity with the app ──
    ("Leaf Spot", ["Leaf spot", "Leafspot"]),
    ("Rust", ["Rose rust", "Phragmidium"]),
    ("Fusarium", ["Fuserium", "Fusarium wilt"]),
    ("Rhizoctonia", ["Ryzotonia", "Rhizoctonia solani"]),
    ("Agrobacterium", ["Agro bacterium", "Crown gall", "Agrobacterium tumefaciens"]),
    ("Rose Mosaic Virus", ["Rose mosaic", "Rose mosaic virus", "RMV"]),
]

# Names seeded with deliberately chosen thresholds. Everything else added from
# the lists above is provisional until the agronomist rules on it.
TUNED = {
    "Spider Mites",
    "Thrips",
    "Whitefly",
    "Aphids",
    "False Codling Moth",
    "Caterpillars",
    "Downy Mildew",
    "Powdery Mildew",
    "Botrytis",
    "Black Spot",
}
