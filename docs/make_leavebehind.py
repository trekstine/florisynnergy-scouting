"""Florisynergy IPM — client leave-behind.

For the person who was not in the room. Four pages: the problem, the loop,
what it produces, and what a pilot looks like. No screenshots yet, so the
document has to carry itself on structure and plain argument.
"""
from datetime import date

from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image, KeepTogether, PageBreak, Paragraph, Spacer, Table, TableStyle,
)

from docbase import (AMBER, BODY, FAINT, GREEN, HAIR, INK, LINE, LOCKUP, NAVY,
                     RED, S, SURFACE, W, Doc, NumberedCanvas, note, table)

OUT = "Florisynergy_IPM_overview.pdf"
story = []


def P(t, style="Body"):
    story.append(Paragraph(t, S[style]))


def C(t):
    return Paragraph(t, S["Cell"])


def CB(t):
    return Paragraph(t, S["CellB"])


def CH(t):
    return Paragraph(t, S["CellH"])


def h1(t):
    story.append(Paragraph(t, S["H1"]))


def h2(t):
    story.append(Paragraph(t, S["H2"]))


def gap(n=8):
    story.append(Spacer(1, n))


def loop_diagram():
    """Observe → Score → Act → Verify, as four boxes with arrows between.

    Drawn as a table rather than vector art so it reflows and prints cleanly
    at any scale.
    """
    steps = [
        ("1", "Observe", "A scout records every bed walked, on the phone, "
                         "with or without signal."),
        ("2", "Score", "Pressure is scored per pest and per disease against "
                       "your own thresholds."),
        ("3", "Act", "A breach raises a recommendation; the spray that answers "
                     "it is priced and compliance-checked."),
        ("4", "Verify", "The next round decides whether it worked — recovered, "
                        "recovering, or not responding."),
    ]
    cells = []
    for n, title, body in steps:
        inner = Table([
            [Paragraph(f'<font color="white" size="13"><b>{n}</b></font>', S["Cell"])],
            [Paragraph(f'<b>{title}</b>', S["CellB"])],
            [Paragraph(body, S["Cell"])],
        ], colWidths=[(W - 18) / 4 - 12])
        inner.setStyle(TableStyle([
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, 0), 0),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 5),
            ("TOPPADDING", (0, 1), (-1, 1), 0),
            ("BOTTOMPADDING", (0, 1), (-1, 1), 3),
            ("TOPPADDING", (0, 2), (-1, 2), 0),
            ("BOTTOMPADDING", (0, 2), (-1, 2), 0),
            # The number sits in a navy chip.
            ("BACKGROUND", (0, 0), (0, 0), NAVY),
            ("ALIGN", (0, 0), (0, 0), "CENTER"),
            ("LEFTPADDING", (0, 0), (0, 0), 6),
            ("RIGHTPADDING", (0, 0), (0, 0), 6),
            ("TOPPADDING", (0, 0), (0, 0), 3),
        ]))
        cells.append(inner)

    row = []
    for i, cell in enumerate(cells):
        row.append(cell)
        if i < len(cells) - 1:
            row.append(Paragraph('<font color="#bdbec0" size="14"><b>&rarr;</b></font>',
                                 S["Cell"]))
    widths = []
    for i in range(len(row)):
        widths.append(6 * mm if i % 2 else (W - 18 * mm) / 4)
    t = Table([row], colWidths=widths)
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("BACKGROUND", (0, 0), (0, 0), SURFACE),
        ("BACKGROUND", (2, 0), (2, 0), SURFACE),
        ("BACKGROUND", (4, 0), (4, 0), SURFACE),
        ("BACKGROUND", (6, 0), (6, 0), SURFACE),
        ("BOX", (0, 0), (0, 0), 0.6, LINE),
        ("BOX", (2, 0), (2, 0), 0.6, LINE),
        ("BOX", (4, 0), (4, 0), 0.6, LINE),
        ("BOX", (6, 0), (6, 0), 0.6, LINE),
        ("ALIGN", (1, 0), (1, 0), "CENTER"),
        ("ALIGN", (3, 0), (3, 0), "CENTER"),
        ("ALIGN", (5, 0), (5, 0), "CENTER"),
        ("VALIGN", (1, 0), (1, 0), "MIDDLE"),
        ("VALIGN", (3, 0), (3, 0), "MIDDLE"),
        ("VALIGN", (5, 0), (5, 0), "MIDDLE"),
    ]))
    return t


# ── Cover ───────────────────────────────────────────────────────────────────
story += [
    Spacer(1, 30 * mm),
    Image(LOCKUP, width=68 * mm, height=31.4 * mm, hAlign="LEFT"),
    Spacer(1, 34 * mm),
    Paragraph("Integrated Pest Management,<br/>built on what your scouts<br/>already do",
              S["CoverTitle"]),
    Spacer(1, 4),
    Paragraph("An overview of Florisynergy IPM", S["CoverSub"]),
]
bar = Table([[""]], colWidths=[38 * mm], rowHeights=[2.4])
bar.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), NAVY)]))
story += [bar, Spacer(1, 56 * mm)]
story.append(table(
    [[Paragraph("<b>Prepared for</b>", S["Cell"]), Paragraph("[Client name]", S["Cell"])],
     [Paragraph("<b>Date</b>", S["Cell"]),
      Paragraph(date.today().strftime("%d %B %Y"), S["Cell"])],
     [Paragraph("<b>Contact</b>", S["Cell"]), Paragraph("[Your name · email · phone]", S["Cell"])]],
    [38 * mm, W - 38 * mm], header=False, zebra=False))
story += [
    Spacer(1, 5 * mm),
    Paragraph("© Florisynergy. Florisynergy and the Florisynergy device are registered "
              "trademarks.", S["Small"]),
    PageBreak(),
]

# ── Page 2: the problem and the loop ────────────────────────────────────────
h1("The problem")
P("Scouts already walk the blocks every week and write down what they find. On "
  "most farms that record ends its useful life in a notebook or a spreadsheet: it "
  "is filed rather than acted on, it cannot be compared week to week, and by the "
  "time a pattern is obvious in the crop it is too late to be cheap.", "Lead")

P("Three costs follow from that, and farms tend to carry all three at once.")
gap(2)
story.append(table([
    [CH("What happens"), CH("What it costs")],
    [CB("Problems are found late"),
     C("Intervention moves from a spot treatment to a block-wide spray, or to lost stems.")],
    [CB("Nobody knows whether a spray worked"),
     C("The same product goes on again because there is no evidence either way — and "
       "resistance builds quietly.")],
    [CB("Compliance is reconstructed after the fact"),
     C("Re-entry intervals, pre-harvest intervals and hazard classes live in people's "
       "heads and in paper files, and an audit becomes an archaeology exercise.")],
], [W * 0.34, W * 0.66]))
gap(14)

h1("What Florisynergy IPM does")
P("It closes the loop between the observation and the decision. Four steps, each "
  "of which already happens on your farm — the platform connects them and keeps "
  "the record.", "Lead")
gap(4)
story.append(loop_diagram())
gap(16)

story.append(note(
    "The part that changes behaviour",
    "Step 4 is the one most systems skip. Because the next scouting round is compared "
    "against the reading that triggered the spray, every intervention gets a verdict: "
    "<b>recovered</b>, <b>recovering</b>, or <b>not responding</b>. A product that is "
    "not working stops being repeated.",
    tone=GREEN))

story.append(PageBreak())

# ── Page 3: the model and what it produces ──────────────────────────────────
h1("How pressure is scored")
P("The arithmetic is deliberately simple, because a number a manager cannot "
  "explain is a number they will not trust.", "Lead")

story.append(table(
    [[Paragraph("pressure index &nbsp;=&nbsp; total severity across beds "
                "&nbsp;&divide;&nbsp; beds scouted", S["Formula"])]],
    [W], header=False, zebra=False))
gap(10)

story.append(table([
    [CH("Principle"), CH("Why it matters")],
    [CB("Scored per pest and per disease"),
     C("Never blended into one figure. A block can be clean on mites and about to lose "
       "a crop to mildew; an average hides exactly that.")],
    [CB("Clean beds count as zero"),
     C("A bed walked with nothing found pulls the index down. This is what stops three "
       "bad beds reading as a farm-wide emergency — and it proves the block was walked.")],
    [CB("Your thresholds, not ours"),
     C("Every pest and disease carries an economic threshold you set, and you can set "
       "tighter values for a particular variety or block. Changes are recorded with a reason.")],
    [CB("A severe finding always escalates"),
     C("Any single reading at severity 4 or above raises an alert on its own, however "
       "healthy the rest of the block looks.")],
], [W * 0.30, W * 0.70]))
gap(14)

h1("What it produces")
P("Output that replaces paperwork rather than adding to it.", "Lead")
story.append(table([
    [CH("Output"), CH("Who uses it")],
    [CB("Spray authorisation sheet"),
     C("A signable one-page document per application: block, tank mix, dose, cost, "
       "hazard class, re-entry and safe-to-harvest dates, with signature blocks for "
       "the agronomist, manager and operator.")],
    [CB("Chemical application report"),
     C("Every application over any period, one line each with the full detail set. "
       "For the audit file and for the accountant.")],
    [CB("Office wallboard"),
     C("A display for the office television: which blocks need someone today, and "
       "which blocks nobody may enter or cut.")],
    [CB("Twelve reports"),
     C("Pressure trends per pest and per disease, cost by block, chemical and variety, "
       "coverage, and scout movement. All export to spreadsheet.")],
], [W * 0.30, W * 0.70]))

story.append(PageBreak())

# ── Page 4: compliance, adoption, pilot ─────────────────────────────────────
h1("Compliance, built in")
P("The checks run before a spray is committed, not after it has gone out.", "Lead")
story.append(table([
    [CH("Check"), CH("Behaviour")],
    [CB("Resistance rotation"),
     C("The same mode-of-action group cannot go onto a block twice within 28 days.")],
    [CB("Tank-mix conflict"),
     C("Two products sharing a mode of action in one tank is blocked — there is no "
       "resistance benefit in it.")],
    [CB("Hazard and intervals"),
     C("WHO hazard class, pre-harvest and re-entry intervals are carried from the "
       "chemical register onto every record and every printed sheet.")],
    [CB("Overrides are recorded"),
     C("A block can be overridden by an authorised person, but the reason is written "
       "onto the program permanently.")],
], [W * 0.30, W * 0.70]))
gap(11)

h1("What changes for your team")
story.append(table([
    [CH("Role"), CH("Before"), CH("After")],
    [CB("Scout"), C("Paper sheet, transcribed later"),
     C("Phone, works without signal, syncs itself. Same walk, no double entry.")],
    [CB("Supervisor"), C("Chases sheets, retypes into a spreadsheet"),
     C("Records arrive already structured; builds the spray from the recommendation.")],
    [CB("Farm manager"), C("Asks how the blocks are doing"),
     C("Sees which blocks need a decision, and whether the last one worked.")],
    [CB("Auditor"), C("Reconstructs the year from paper files"),
     C("Every spray already traceable to the observation that justified it.")],
], [W * 0.20, W * 0.32, W * 0.48]))
story.append(PageBreak())

h1("Getting started")
P("The software is the fast part. What takes time is mapping your blocks and beds, "
  "loading your chemical register, and agreeing your thresholds — so we suggest "
  "starting narrow.", "Lead")
story.append(table([
    [CH("Step"), CH("What it involves"), CH("Typical")],
    [CB("1 · Pilot scope"), C("Two or three blocks, one or two scouts"), C("Half a day")],
    [CB("2 · Farm setup"), C("Boundaries drawn, beds registered, people added"), C("1–2 days")],
    [CB("3 · Agronomy"), C("Chemical register loaded, thresholds agreed with your agronomist"),
     C("1 day")],
    [CB("4 · Run and review"),
     C("Scouts capture their normal rounds; nothing else changes. We review what it "
       "caught with you at the end and decide on the wider rollout"), C("2–4 weeks")],
], [W * 0.22, W * 0.56, W * 0.22]))
gap(9)

story.append(note(
    "The one thing we would ask for",
    "A week of your existing scouting sheets. We will load them and show you the same "
    "analysis on your own blocks — which is a far better test of whether this is "
    "useful to you than any demonstration on our data.",
    tone=NAVY))

gap(8)
P("[Your name] · [email] · [phone]", "Small")

# ── Build ───────────────────────────────────────────────────────────────────
doc = Doc(OUT, "Florisynergy IPM — Overview", "Florisynergy IPM · Overview")
doc.multiBuild(story, canvasmaker=NumberedCanvas)
print("wrote", OUT)
