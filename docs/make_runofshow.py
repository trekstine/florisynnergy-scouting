"""Florisynergy IPM — demo run-of-show.

An internal document. Every block name, severity, ETL and outcome in here is
read from the seed, not invented, so what the presenter reads matches what the
screen shows.
"""
from datetime import date

from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, Spacer

from docbase import (AMBER, GREEN, NAVY, RED, S, W, Doc, NumberedCanvas,
                     Numbering, cover, note, table, toc)

OUT = "Florisynergy_IPM_demo_run_of_show.pdf"
N = Numbering()
story = []


def h1(t):
    story.append(Paragraph(N.one(t), S["H1"]))


def h2(t):
    story.append(Paragraph(N.two(t), S["H2"]))


def P(t, style="Body"):
    story.append(Paragraph(t, S[style]))


def C(t):
    return Paragraph(t, S["Cell"])


def CB(t):
    return Paragraph(t, S["CellB"])


def CH(t):
    return Paragraph(t, S["CellH"])


def panel(rows, header=True, widths=None):
    story.append(table(rows, widths or [W / len(rows[0])] * len(rows[0]),
                       header=header))
    story.append(Spacer(1, 10))


def callout(title, body, tone=NAVY):
    story.append(note(title, body, tone))
    story.append(Spacer(1, 11))


def steps(items):
    for i, x in enumerate(items, 1):
        story.append(Paragraph(x, S["Step"], bulletText=f"{i}."))
    story.append(Spacer(1, 4))


def say(t):
    story.append(note("Say", f"<i>“{t}”</i>", NAVY))
    story.append(Spacer(1, 11))


# ── Cover ───────────────────────────────────────────────────────────────────
story += cover(
    "Demo&nbsp;Run-of-Show",
    "Florisynergy IPM &mdash; presenter notes",
    [
        ("Document", "Florisynergy IPM — Demo Run-of-Show"),
        ("Version", "1.0"),
        ("Issued", date.today().strftime("%d %B %Y")),
        ("Environment", "Demonstration instance, seeded data"),
        ("Audience", "Internal — presenters only"),
    ],
    classification="INTERNAL. Contains demonstration credentials. Not for "
                   "circulation to clients.",
)

story.append(Paragraph("Contents", S["TocTitle"]))
story.append(toc())
story.append(PageBreak())

# ── 1. Before you begin ─────────────────────────────────────────────────────
h1("Before you begin")
P("This walks the demo environment in the order that tells a story. The farm, the "
  "blocks and the figures throughout are the seeded demonstration data — they are "
  "stable across reseeds, so you can rehearse against them.", "Lead")

h2("Environment and access")
panel([
    [CB("Portal"), C("https://34.122.165.134.nip.io")],
    [CB("Wallboard"), C("https://34.122.165.134.nip.io/tv")],
    [CB("Sign in"), C("Device <b>web-admin</b> &middot; PIN <b>0000</b> (Agronomy Manager)")],
    [CB("Demo farm"), C("Naivasha Rose Estate — 20 greenhouses, 20 beds each, 30 days of scouting")],
], header=False, widths=[34 * mm, W - 34 * mm])

h2("Set-up checklist")
callout(
    "Do this before the room is watching",
    "Open the portal and sign in — the first page load builds several queries and "
    "looks slow. Set the date filter to <b>30 days</b>. Open the wallboard in a second "
    "tab. If you are showing the phone, confirm it is on the same network and already "
    "signed in.",
)

# ── The one-sentence pitch ──────────────────────────────────────────────────
h1("The idea, in one minute")
P("Scouts already walk the blocks and write down what they find. That data usually "
  "dies in a notebook or a spreadsheet. Florisynergy IPM turns each observation into "
  "a decision: it scores pressure per pest and per disease against the farm's own "
  "economic thresholds, raises a recommendation when a threshold is crossed, prices "
  "and compliance-checks the spray that answers it, and then watches the next round "
  "to see whether it worked.")

say("Every number on this screen traces back to a scout standing in a bed. "
    "Nothing here is estimated.")

h2("The three claims worth making")
panel([
    [CH("Claim"), CH("Where you prove it")],
    [Paragraph("We catch problems before they cost you a crop", S["Cell"]),
     Paragraph("GH03 &mdash; Spider Mites climbing 1 &rarr; 4 over four weeks, flagged, still unactioned", S["Cell"])],
    [Paragraph("We tell you whether the spray actually worked", S["Cell"]),
     Paragraph("GH06 recovered vs GH09 not responding — same engine, opposite outcomes", S["Cell"])],
    [Paragraph("We keep you compliant without extra paperwork", S["Cell"]),
     Paragraph("The approval sheet, the re-entry holds, the resistance-rotation block", S["Cell"])],
], widths=[W * 0.42, W * 0.58])

# ── The model ───────────────────────────────────────────────────────────────
h1("The scoring model")
P("An agronomist will ask how the number is calculated. The answer is deliberately "
  "simple and it is the farm's own model, not ours:")

panel([
    [CB("Pressure index"),
     Paragraph("Sum of severity across beds &divide; beds scouted, <b>per pest and per disease separately</b>", S["Cell"])],
    [CB("Clean beds"),
     Paragraph("A bed walked with nothing found counts as zero — it dilutes the index, which is the point", S["Cell"])],
    [CB("Hotspot rule"),
     Paragraph("Any single observation at severity 4 or above raises an alert on its own", S["Cell"])],
    [CB("Action required"),
     Paragraph("index ≥ ETL <b>OR</b> any severity ≥ 4 — either alone is enough", S["Cell"])],
], header=False, widths=[36 * mm, W - 36 * mm])

callout(
    "The line that lands",
    "Pests and diseases are never blended into one score. A block can be perfectly "
    "healthy on mites and about to lose a crop to mildew — an average hides that, "
    "so we never take one.",
    tone=GREEN,
)


# ── The stories ─────────────────────────────────────────────────────────────
h1("The five seeded stories")
P("These are the arcs built into the demo data. Run them in this order: the first "
  "shows detection, the middle two show outcome, the last shows the safety layer.")

panel([
    [CH("Block"), CH("Agent"),
     CH("Four-week severity"), CH("What it shows")],
    [CB("Greenhouse 03"), Paragraph("Spider Mites", S["Cell"]),
     Paragraph("1 &rarr; 2 &rarr; 3 &rarr; <b>4</b> &rarr; <b>4</b>", S["Cell"]),
     Paragraph('<font color="#b91c1c"><b>Open, untreated.</b></font> Caught early and climbing. The case for scouting.', S["Cell"])],
    [CB("Greenhouse 06"), Paragraph("Thrips", S["Cell"]),
     Paragraph("2 &rarr; <b>4</b> &rarr; 3 &rarr; 2 &rarr; 1", S["Cell"]),
     Paragraph('<font color="#059669"><b>Resolved.</b></font> Sprayed, and the next rounds show it coming down.', S["Cell"])],
    [CB("Greenhouse 09"), Paragraph("Powdery Mildew", S["Cell"]),
     Paragraph("2 &rarr; <b>4</b> &rarr; <b>4</b> &rarr; <b>4</b> &rarr; <b>4</b>", S["Cell"]),
     Paragraph('<font color="#b45309"><b>Not responding.</b></font> Sprayed and it did not work — escalate.', S["Cell"])],
    [CB("Greenhouse 12"), Paragraph("Botrytis", S["Cell"]),
     Paragraph("1 &rarr; 3 &rarr; <b>4</b> &rarr; 2 &rarr; 0", S["Cell"]),
     Paragraph('<font color="#059669"><b>Resolved.</b></font> Took three weeks — a realistic recovery.', S["Cell"])],
    [CB("Greenhouse 15"), Paragraph("Whitefly", S["Cell"]),
     Paragraph("0 &rarr; 1 &rarr; 1 &rarr; 2 &rarr; <b>4</b>", S["Cell"]),
     Paragraph('<font color="#b91c1c"><b>Just crossed.</b></font> A slow build that only became actionable this week.', S["Cell"])],
], widths=[W * 0.15, W * 0.17, W * 0.24, W * 0.44])

callout(
    "If someone asks whether this is real data",
    "Say yes, it's demonstration data — don't dress it up. Then move immediately to "
    "the mechanism: <i>“the arithmetic is the same one that will run on your rounds; "
    "what changes is whose beds are in it.”</i> Offer to load a week of their own "
    "scouting sheets. That offer closes more than the demo does.",
    tone=AMBER,
)

# ── The walkthrough ─────────────────────────────────────────────────────────
h1("The walkthrough")
P("Roughly 20 minutes at a comfortable pace. Each scene has a purpose — if you are "
  "short on time, cut scenes 5 and 7 rather than rushing the rest.")

# 1
h2("Wallboard — set the scene <font size=9 color='#6b7280'>(2 min)</font>")
P("Start here, before the login screen. It's ambient, it needs no explanation, and it "
  "makes the point that this runs the farm rather than sitting in a drawer.")
steps([
    "Open <b>/tv</b> full screen. Let it sit through one or two scenes.",
    "Point at the amber <b>Do not enter</b> strip if it's showing.",
    "Point at a red block tile and read its headline sentence aloud.",
])
say("This lives on the wall in the office. Nobody logs in to read it. "
    "It says which block needs someone today, and which block nobody may walk into.")

# 2
h2("Pressure Map — where the problem is <font size=9 color='#6b7280'>(3 min)</font>")
steps([
    "Sign in, land on the Dashboard, then go to <b>Pressure Map</b>.",
    "Set the range to <b>30 days</b>. The estate colours by pressure.",
    "Click <b>Greenhouse 03</b>. Read the headline in the panel.",
    "Open the <b>Pressure by pest / disease</b> table — this is where the model shows itself.",
    "Point out that Spider Mites is over ETL while everything else in the same block is fine.",
])
say("One block, five different agents, five different verdicts. "
    "That's the distinction an average would have thrown away.")

# 3
h2("One observation — the audit trail <font size=9 color='#6b7280'>(2 min)</font>")
steps([
    "In the panel's <b>Records</b> tab, click any finding to open the record page.",
    "Show the severity strip — every prior reading of that agent on that bed.",
    "Scroll to <b>What happened next</b>: the recommendation, and the spray that answered it.",
])
say("Every observation is traceable forward to what was done about it, "
    "and every spray is traceable back to why.")
callout(
    "Useful detail",
    "Point out the clean-bed toggle in the Records panel: <i>“the scout walked twenty "
    "beds and found something on three. The other seventeen are recorded as zero — "
    "that's what stops one bad bed reading as a farm-wide emergency.”</i>",
)


# 4
h2("Recommendations — did it work? <font size=9 color='#6b7280'>(3 min)</font>")
P("This is the strongest part of the demo. Do not rush it.")
steps([
    "Open <b>Recommendations</b>. Walk the four columns left to right.",
    "Find the <b>Greenhouse 06 / Thrips</b> card — resolved, outcome reads <i>Recovered</i>.",
    "Find the <b>Greenhouse 09 / Powdery Mildew</b> card — actioned, outcome reads <i>Not responding</i>.",
    "Put them side by side and let the contrast do the work.",
])
say("Same engine, same farm, same week — one intervention worked and one didn't. "
    "Most systems can tell you what you sprayed. This one tells you whether it was worth it.")

# 5
h2("Building a spray — the selling point <font size=9 color='#6b7280'>(4 min)</font>")
steps([
    "From an open recommendation, click through to the spray builder.",
    "Show the suggested product arriving pre-filled from the ETL engine.",
    "Enter a water volume and a rate — quantity and cost calculate live.",
    "Add a second product with the <b>same RAC code</b> to trigger the resistance block.",
    "Show the override checkbox and say the reason is recorded on the program.",
])
say("The system suggests. A person decides. And if the person overrides a "
    "resistance rule, that's written into the record, not quietly allowed.")
callout(
    "The compliance points worth naming",
    "Resistance rotation — the same mode of action can't go on a block twice inside "
    "28 days. Tank-mix conflicts — two products sharing a RAC group in one tank is "
    "blocked. WHO hazard class, pre-harvest interval and re-entry interval are all "
    "carried through to the printed sheet.",
    tone=GREEN,
)

# 6
h2("The approval sheet — the thing they keep <font size=9 color='#6b7280'>(2 min)</font>")
P("Managers respond to paper. This is often the moment the room shifts.")
steps([
    "Go to <b>Spray Programs</b>, expand any program, click <b>Approval sheet</b>.",
    "Point at the scouting report date and the basis for the application.",
    "Point at the three constraint boxes — re-entry, safe-to-harvest, hazard class.",
    "Point at the three signature blocks. Then press <b>Print</b> and let them watch it render.",
])
say("This is what gets signed and filed. It's generated from the same record "
    "the scout created — nobody retypes anything, so nobody mistypes anything.")

# 7
h2("Reports — breadth, briefly <font size=9 color='#6b7280'>(3 min)</font>")
P("Don't tour all twelve tabs. Pick three and move on.")
steps([
    "<b>Trends</b> — per-pest and per-disease lines. “Is it getting better or worse?”",
    "<b>Movement</b> — click a scout, show time spent per bed. This one always gets a reaction from managers.",
    "<b>Cost by chemical</b> — then the printable chemical report.",
])
say("The movement report is not about mistrust. It's about knowing whether a "
    "block was actually walked, or walked past.")


# ── Q&A ─────────────────────────────────────────────────────────────────────
h1("Questions you will get")

qa = [
    ("Does this work offline? Our greenhouses have no signal.",
     "Yes — the app is offline-first. A scout captures a whole round with no "
     "connection; records queue on the device and sync when they reach signal. "
     "Each record carries a device-generated id so a repeated send can't duplicate it."),
    ("Who decides the thresholds?",
     "You do. Every pest and disease has a severity ETL and a pressure ETL, both "
     "editable under Reference data, and you can set tighter values for a specific "
     "variety or block. Every change is written to an audit trail with a reason."),
    ("How do we know the scout was actually in the greenhouse?",
     "Each record is geofenced — it captures GPS inside the block boundary, with a "
     "QR code as fallback where GPS struggles under polythene. The verification "
     "method is stored on every record and shown in the reports."),
    ("What happens when a scout types 30 instead of 3?",
     "It's flagged on ingest. The record is compared against that block's own history "
     "for that agent, and a clear outlier is marked for review rather than silently "
     "skewing the trend."),
    ("Can we get our data out?",
     "Yes. Every report exports to CSV with the full field set, and the chemical "
     "application report and approval sheets print to PDF. Nothing is locked in."),
    ("How long to get running on our farm?",
     "The honest answer is that the software is the fast part. What takes time is "
     "mapping your blocks and beds, loading your chemical register, and agreeing your "
     "thresholds. Offer a pilot on two or three blocks rather than the whole estate."),
]
rows = [[CH("They ask"), CH("You answer")]]
for q, a in qa:
    rows.append([Paragraph(f"<b>{q}</b>", S["Cell"]), Paragraph(a, S["Cell"])])
panel(rows, widths=[W * 0.33, W * 0.67])

callout(
    "If something breaks mid-demo",
    "Don't debug in front of them. Move to the wallboard tab or the printed approval "
    "sheet — both are self-contained. Say you'll follow up, and do. A presenter "
    "calmly moving on reads as competence; a presenter refreshing a broken page "
    "does not.",
    tone=RED,
)

h1("Closing")
P("Ask for one thing, not everything: a week of their real scouting sheets, or two "
  "blocks for a pilot. The demo has already made the argument — the close is just "
  "about making the next step small enough to say yes to.")

# ── Build ───────────────────────────────────────────────────────────────────
doc = Doc(OUT, "Florisynergy IPM — Demo Run-of-Show",
          "Florisynergy IPM · Demo Run-of-Show")
doc.multiBuild(story, canvasmaker=NumberedCanvas)
print("wrote", OUT)
