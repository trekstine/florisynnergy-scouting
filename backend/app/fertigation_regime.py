"""The farm's standard tank make-up, exactly as the Fertigation Report gives it.

This is the part of the report that genuinely is fixed. The set count is not —
"there is no predefined number of sets (this is the volume used, can be 5 or
6)" — and the m³/ha figure is not, it is whatever the day's water came to. But
the *recipe*, the quantity of each salt per tank-full, is the regime the farm
works to, and re-typing fifteen lines every morning is how a wrong number gets
into a sheet.

Each tank's quantities are per its **own** volume: Tanks A and B are made up in
1,000 L, Tank C in 500 L. That is why the set count is derived per tank rather
than shared — a day needing 6,000 L of fertiliser stock and 2,000 L of acid is
six make-ups of A and B, and four of C.

Potassium nitrate appears in both A and B, at different rates. That is not a
mistake in the transcription; it is what the sheet says.

The figures below are the report's. The printed regime photograph disagrees in
places — 145 kg of calcium nitrate against 132 — so this is a starting point an
agronomist adjusts, not a fact. Whatever is on a sheet when it is signed is
what that sheet keeps.
"""
from __future__ import annotations

# (tank code, made-up volume in litres, [(fertiliser code, quantity per tank-full)])
REGIME: list[tuple[str, float, list[tuple[str, float]]]] = [
    (
        "A",
        1000.0,
        [
            ("CANO3", 132.0),
            ("KNO3", 38.0),
            ("FE", 5.9),
            ("SUPERLINK", 1.0),  # the one item dosed by volume
        ],
    ),
    (
        "B",
        1000.0,
        [
            ("MGSO4", 74.0),
            ("MGNO3", 8.8),
            ("MKP", 44.0),
            ("KNO3", 36.0),
            ("NA2MO2", 0.22),
            ("CUSO4", 0.22),
            ("ZNSO4", 0.31),
            ("BORAX", 0.37),
            ("MNSO4", 0.79),
        ],
    ),
    (
        "C",
        500.0,  # the acid tank is made up in half the volume
        [
            ("H2SO4", 24.0),
            ("H3PO4", 5.8),  # the report writes H₂PO₄; phosphoric acid is H₃PO₄
        ],
    ),
]

# What the report schedules, so a sheet's activity is not free text.
SCHEDULE = {
    "fertigation": ["Monday", "Tuesday", "Saturday"],
    "drenching": ["Wednesday", "Thursday"],
    "flushing": ["Sunday"],
}
