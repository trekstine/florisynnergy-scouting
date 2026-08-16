"""Florisynergy IPM — user manual.

Task-based: what each role does, in the order they do it. Field names and
screen names are read from the built application, not paraphrased.
"""
from datetime import date

from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, PageBreak, Paragraph, Spacer

from docbase import (AMBER, GREEN, NAVY, RED, S, W, Doc, Numbering, cover,
                     note, table, toc)

OUT = "Florisynergy_IPM_user_manual.pdf"
N = Numbering()
story = []


def h1(t):
    story.append(Paragraph(N.one(t), S["H1"]))


def h2(t):
    story.append(Paragraph(N.two(t), S["H2"]))


def h3(t):
    story.append(Paragraph(t, S["H3"]))


def p(t, style="Body"):
    story.append(Paragraph(t, S[style]))


def steps(items):
    for i, s in enumerate(items, 1):
        story.append(Paragraph(s, S["Step"], bulletText=f"{i}."))
    story.append(Spacer(1, 4))


def bullets(items):
    for s in items:
        story.append(Paragraph(s, S["Step"], bulletText="•"))
    story.append(Spacer(1, 4))


def tbl(rows, widths, header=True):
    story.append(table(rows, widths, header=header))
    story.append(Spacer(1, 10))


def C(t):
    return Paragraph(t, S["Cell"])


def CB(t):
    return Paragraph(t, S["CellB"])


def CH(t):
    return Paragraph(t, S["CellH"])


def callout(title, body, tone=NAVY):
    story.append(note(title, body, tone))
    story.append(Spacer(1, 11))


# ── Cover ───────────────────────────────────────────────────────────────────
story += cover(
    "User&nbsp;Manual",
    "Florisynergy IPM &mdash; geofenced scouting, spraying and agronomy",
    [
        ("Document", "Florisynergy IPM — User Manual"),
        ("Version", "1.0"),
        ("Issued", date.today().strftime("%d %B %Y")),
        ("Applies to", "Florisynergy IPM portal and mobile application, v1.0"),
        ("Audience", "Scouts, supervisors, farm managers, administrators"),
    ],
    classification="© Florisynergy. Florisynergy and the Florisynergy device are "
                   "registered trademarks.",
)

# ── Contents ────────────────────────────────────────────────────────────────
story.append(Paragraph("Contents", S["TocTitle"]))
story.append(toc())
story.append(PageBreak())

# ── 1. About this manual ────────────────────────────────────────────────────
h1("About this manual")
p("This manual is organised by job rather than by menu. Find your role in the "
  "table below and read that section. Scouts need section 3 only; everything "
  "else is for the office.", "Lead")

tbl([
    [CH("Section"), CH("Who it is for"), CH("What it covers")],
    [CB("3"), C("Scouts"), C("Walking a round and capturing observations on the phone")],
    [CB("4"), C("Supervisors and managers"),
     C("Reading pressure, acting on recommendations, building and approving sprays")],
    [CB("5"), C("Administrators"),
     C("Setting up blocks, beds, people, chemicals and thresholds")],
    [CB("6"), C("Everyone"),
     C("What the numbers mean, a worked example, and a glossary")],
    [CB("7"), C("Everyone"), C("Troubleshooting")],
], [22 * mm, 44 * mm, W - 66 * mm])

h2("Conventions used")
bullets([
    "<b>Bold</b> marks something you see on screen — a button, a field or a page name.",
    "Numbered lists are procedures: follow them in order.",
    "Coloured panels flag something that is easy to get wrong, or that matters for safety.",
])

# ── 2. Getting access ───────────────────────────────────────────────────────
h1("Getting access")
p("There are two ways into the system and they are meant for different people. "
  "Scouts use the phone application. Supervisors and managers use the web "
  "portal. A scout account cannot sign in to the portal — this is deliberate.")

h2("Roles and permissions")
tbl([
    [CH("Role"), CH("Signs in to"), CH("Can do")],
    [CB("Scout"), C("Mobile app"),
     C("Capture observations; review their own records")],
    [CB("Supervisor"), C("Portal"),
     C("Everything a scout sees, plus recommendations, spray programs and all reports")],
    [CB("Administrator"), C("Portal"),
     C("All of the above, plus farm mapping, workforce and reference data")],
], [30 * mm, 30 * mm, W - 60 * mm])

h2("Signing in")
p("Everyone signs in with a <b>device identifier</b> and a <b>four-digit PIN</b> "
  "rather than an email address and password. The device identifier ties an "
  "account to one phone, which is how the farm knows whose round a set of "
  "records belongs to. If a scout changes phone, an administrator updates the "
  "identifier under <b>Settings &rarr; Workforce</b>.")

callout(
    "Leavers",
    "Deactivate an account rather than deleting it. A deleted person takes their "
    "history with them; a deactivated one cannot sign in but their past records "
    "stay attributed and auditable.",
)


# ── 3. Scouts ───────────────────────────────────────────────────────────────
h1("For scouts: walking a round")
p("Your job in the app is to record what you find, bed by bed. The app is built "
  "to work with no signal — capture the whole round, and it sends itself when "
  "you get back into coverage.", "Lead")

h2("Before you start")
bullets([
    "Sign in once. The app remembers you.",
    "You do not need signal. Walk the round first and worry about sending afterwards.",
    "Record <b>every bed you walk</b>, including the clean ones.",
])

callout(
    "Why clean beds matter",
    "The farm's pressure score is the total severity divided by the number of beds "
    "scouted. If you record only the beds where you found something, three bad "
    "beds look like the whole block is in trouble. Recording the clean ones keeps "
    "the numbers honest — and it is the record that proves the block was walked.",
    tone=GREEN,
)

h2("Capturing an observation")
steps([
    "From the home screen, tap <b>New scouting</b>.",
    "Under <b>Location</b>, choose the <b>Greenhouse</b>, then the <b>Bed / Bay</b>. "
    "The app confirms by GPS that you are inside the block boundary. Where GPS "
    "struggles under polythene, scan the greenhouse <b>QR code</b> instead.",
    "Choose the <b>Scouting Type</b> — Pest, Disease, Lure or Sticky Trap. The form "
    "changes to suit.",
    "Complete the details for that type (see 3.3).",
    "Set the <b>severity</b> on the 0–5 scale (see 3.4).",
    "Add <b>Notes</b> where a number and a photograph will not convey it.",
    "Add a <b>Photo</b> for anything unusual, from the camera or the gallery.",
    "Add the entry. It joins the queue for this round.",
    "Repeat for each bed, then <b>submit the round</b>. Add an overall comment if "
    "something affected the whole walk — weather, irrigation running, and so on.",
])

h2("What each scouting type asks for")
tbl([
    [CH("Type"), CH("You record")],
    [CB("Pest"), C("Variety &middot; Pest &middot; Stage (egg, larva, nymph, adult) "
                   "&middot; Where on the plant &middot; Severity &middot; Beneficials seen")],
    [CB("Disease"), C("Variety &middot; Disease &middot; Where on the plant &middot; Severity")],
    [CB("Lure"), C("Lure ID &middot; Count caught &middot; Severity")],
    [CB("Sticky trap"), C("Trap ID &middot; Count on the card &middot; Severity")],
], [30 * mm, W - 30 * mm])

h2("The severity scale")
p("Use the same scale every time. Consistency between scouts matters more than "
  "precision, because the system compares this week to last week on the same bed.")
tbl([
    [CH("Score"), CH("Meaning")],
    [CB("0"), C("Nothing found. The bed was walked and it is clean.")],
    [CB("1"), C("Trace. One or two plants, barely there.")],
    [CB("2"), C("Light. Present but not spreading.")],
    [CB("3"), C("Moderate. Established, worth acting on.")],
    [CB("4"), C("Heavy. Raises an alert on its own, wherever it is found.")],
    [CB("5"), C("Severe. Crop at risk.")],
], [22 * mm, W - 22 * mm])

callout(
    "Severity 4 is a hard line",
    "Any single reading of 4 or above raises an alert immediately, even where the "
    "rest of the block is clean. Do not round down to avoid causing a fuss, and do "
    "not round up to make a point — the office is comparing your number against the "
    "same bed last week.",
    tone=AMBER,
)

h2("Sending your round")
bullets([
    "Records queue on the phone until there is signal, then send themselves.",
    "Sending twice cannot create duplicates — each record carries its own identifier.",
    "You can carry on working while a queue is sending.",
    "Tap any record in your list to review what you captured.",
])


# ── 4. Supervisors and managers ─────────────────────────────────────────────
h1("For supervisors and managers")
p("The portal is organised as a loop: see the pressure, open the recommendation "
  "it raised, build the spray that answers it, then check whether it worked.", "Lead")

h2("Where things are")
tbl([
    [CH("Page"), CH("What it is for")],
    [CB("Dashboard"), C("The morning overview — headline numbers and the farm map")],
    [CB("Pressure Map"), C("The estate coloured by pressure; select a block for detail")],
    [CB("Scouting"), C("Every observation, filterable; select one for its full record")],
    [CB("Recommendations"), C("What the thresholds have raised, and what became of it")],
    [CB("Spray Programs"), C("Applications, dosing, cost and pre-harvest compliance")],
    [CB("Analytics"), C("Twelve reports across scouting and spray")],
    [CB("Settings"), C("Farm mapping, workforce and reference data (section 5)")],
], [40 * mm, W - 40 * mm])

h2("Reading a block")
steps([
    "Open <b>Pressure Map</b> and set the date range.",
    "Select a block. The panel gives a headline sentence naming the worst active issue.",
    "Open <b>Pressure by pest / disease</b>. Each agent carries its own index, its "
    "own threshold and its own verdict; they are never averaged together.",
    "The <b>Records</b> tab lists findings first, worst severity at the top. Beds "
    "walked with nothing found sit behind a toggle.",
    "Select any record to open its full page: the round it belongs to, every earlier "
    "reading of that agent on that bed, and what was done about it.",
])

h2("The recommendations board")
p("Recommendations move left to right through four columns. The board is the "
  "record of what the farm decided, not merely what the system suggested.")
tbl([
    [CH("Column"), CH("Meaning")],
    [CB("Open"), C("Raised by a threshold breach or a severity-4 hotspot. Nobody has acted.")],
    [CB("Planned"), C("Someone has decided to act; the spray has not yet gone out.")],
    [CB("Actioned"), C("A spray program has been created against it.")],
    [CB("Resolved"), C("A later round found the agent below its threshold.")],
], [30 * mm, W - 30 * mm])

h3("Outcome verdicts")
p("Once a program has been applied, the next scouting round decides the outcome "
  "on its own. One of three verdicts appears on the card:")
bullets([
    "<b>Recovered</b> — the next reading came in below the threshold.",
    "<b>Recovering</b> — falling, but not yet below the line.",
    "<b>Not responding</b> — still at or above the threshold after the intervention. "
    "This is the one to escalate; consider a different mode of action.",
])

callout(
    "Recurrence reopens automatically",
    "Where an agent breaches its threshold again on a block that was previously "
    "resolved, the recommendation reopens and is marked as a recurrence. Problems "
    "that keep returning do not quietly disappear from the board.",
)


h2("Building a spray program")
p("The engine suggests; a person decides. Nothing is written until you commit it.")
steps([
    "From an open recommendation, start a program — or use <b>New program</b> on the "
    "Spray Programs page for a routine application.",
    "<b>Location</b> — greenhouse, bed or bay, partition, variety, and the scouting "
    "report date this application answers.",
    "<b>Application</b> — type (foliar, drench, fogging, dusting, drip), coverage "
    "(full or top), re-entry hours, volume of water, start date and time.",
    "<b>Add a product</b> — select it and enter the rate per 100 litres. The quantity "
    "calculates as you type.",
    "Add further products for a tank mix. Each carries its own rate.",
    "Read the <b>Compliance</b> panel before committing (see 4.5).",
    "Check the total cost and the safe-to-harvest date, then <b>Create program</b>.",
])

story.append(KeepTogether([
    Paragraph("How the quantity is calculated", S["H3"]),
    Spacer(1, 2),
    table([[Paragraph("quantity &nbsp;=&nbsp; volume of water &nbsp;&times;&nbsp; rate "
                      "&nbsp;&divide;&nbsp; 100,000", S["Formula"])]],
          [W], header=False, zebra=False),
    Spacer(1, 5),
    Paragraph("Rate is millilitres or grams of product per 100 litres of water, as "
              "written on the spray sheet. A 1,000 litre tank at a rate of 50 needs "
              "0.5 litres of product.", S["Body"]),
]))

callout(
    "Change the tank volume and everything re-prices",
    "Quantity and cost for every product in the mix recalculate when you change the "
    "water volume. What you see before committing is what gets saved.",
)

h2("What the compliance panel checks")
tbl([
    [CH("Check"), CH("Level"), CH("Meaning")],
    [C("Resistance rotation"), CB('<font color="#a11d1d">Blocks</font>'),
     C("The same RAC mode-of-action group has gone onto this block within 28 days")],
    [C("Tank-mix conflict"), CB('<font color="#a11d1d">Blocks</font>'),
     C("Two products in this tank share a RAC group — no resistance benefit")],
    [C("Target fit"), CB('<font color="#96601a">Warns</font>'),
     C("The product is not labelled for the pest or disease being targeted")],
    [C("WHO hazard class"), CB('<font color="#96601a">Warns</font>'),
     C("Class II or above — confirm PPE and authorisation")],
    [C("PHI and REI"), C("Informs"),
     C("Pre-harvest and re-entry intervals carried onto the record")],
], [W * 0.27, W * 0.15, W * 0.58])

p("A blocking issue can be overridden, but you must tick the override box and the "
  "reason is written onto the program permanently. That is the audit trail; it is "
  "meant to be visible rather than convenient.")

h2("The approval sheet")
p("Every program has a printable one-page authorisation, opened from the Spray "
  "Programs page or from <b>Analytics &rarr; Programs</b>. It carries:")
bullets([
    "The scouting report date, and what the application is answering.",
    "Block, bed, partition, variety, application method, coverage, tank volume and block area.",
    "Every product with its active ingredient, target, WHO class, RAC group, rate, "
    "quantity, unit price and line cost, with a total.",
    "Re-entry hours, safe-to-harvest date, and a hazard warning naming the products.",
    "Signature blocks for the agronomist, the farm manager and the spray operator.",
])

h2("Reports worth knowing")
tbl([
    [CH("Report"), CH("Answers")],
    [CB("Trends"), C("Severity over time, one line per pest and per disease. Is it improving?")],
    [CB("Movement"), C("Select a scout to see their walk bed by bed, with time spent on each")],
    [CB("Coverage"), C("Which blocks received full cover and which only a top pass")],
    [CB("Cost by chemical"), C("Spend, then quantity used, then how often applied")],
    [CB("Programs"), C("Expand a row for the tank mix; exports to CSV and to a printable report")],
], [40 * mm, W - 40 * mm])


# ── 5. Administrators ───────────────────────────────────────────────────────
h1("For administrators: setting the farm up")
p("Everything configuration-related sits under <b>Settings</b>. Work through "
  "these in order — the later steps depend on the earlier ones.", "Lead")

h2("Farm mapping")
steps([
    "Draw each greenhouse boundary on the satellite map, as a rectangle or a "
    "freeform shape. This boundary is what geofences the scouts.",
    "Generate the beds. Use bulk generate for “Bed 1 … Bed N”, or add them individually.",
    "Note the QR code for each block and print it for the greenhouse door.",
])

callout(
    "Register every bed",
    "The pressure index divides by the number of beds scouted. A block whose beds are "
    "only half registered reports pressure roughly twice as high as it should. This "
    "is the most common and most damaging setup error.",
    tone=RED,
)

h2("Workforce")
bullets([
    "Add each person with a role: scout, supervisor or administrator.",
    "Give each a device identifier and a four-digit PIN.",
    "Deactivate rather than delete when someone leaves.",
])

h2("Reference data")
bullets([
    "<b>Varieties</b> — the crop varieties scouts can choose from.",
    "<b>Pests and diseases</b> — each with a severity ETL and a pressure ETL.",
    "<b>Chemicals</b> — the register: product, price, WHO class, RAC group, rate, "
    "pre-harvest and re-entry intervals.",
    "<b>ETL override rules</b> — tighter thresholds for a particular variety or block, "
    "for instance where a market demands it. Every change is recorded with a reason.",
])

h2("Setting thresholds")
p("Two numbers per pest and per disease, doing different jobs:")
tbl([
    [CH("Threshold"), CH("What it does")],
    [CB("Severity ETL"),
     C("A single reading at or above this raises a recommendation on its own. "
       "Typically 2 to 4, depending on how aggressive the agent is.")],
    [CB("Pressure ETL"),
     C("The block-wide index threshold. These are naturally small numbers: one "
       "severity-3 bed in a twenty-bed block gives an index of 0.15.")],
], [36 * mm, W - 36 * mm])


# ── 6. What the numbers mean ────────────────────────────────────────────────
h1("What the numbers mean")

h2("The pressure index")
p("For one pest or one disease, in one block, over the chosen date range:")
story.append(table(
    [[Paragraph("pressure index &nbsp;=&nbsp; total severity across beds "
                "&nbsp;&divide;&nbsp; beds scouted", S["Formula"])]],
    [W], header=False, zebra=False))
story.append(Spacer(1, 10))
bullets([
    "Beds walked with nothing found count as zero, and pull the index down.",
    "Pests and diseases are scored separately and never averaged together.",
    "<b>Action is required when the index reaches the ETL, or any single reading "
    "reaches severity 4.</b> Either condition alone is sufficient.",
])

h2("Worked example")
p("A twenty-bed block, all twenty walked. Powdery Mildew is found on four beds at "
  "severities 4, 3, 2 and 1; the remaining sixteen are clean.")
tbl([
    [CH("Step"), CH("Value")],
    [C("Total severity"), CB("4 + 3 + 2 + 1 = 10")],
    [C("Beds scouted"), CB("20")],
    [C("Pressure index"), CB("10 &divide; 20 = 0.50")],
    [C("Pressure ETL for Powdery Mildew"), CB("0.20")],
    [C("Verdict"), CB('<font color="#a11d1d">Action required</font> — the index is over '
                      'ETL, and the severity-4 bed is a hotspot in its own right')],
], [W * 0.42, W * 0.58])

h2("Glossary")
tbl([
    [CH("Term"), CH("Meaning")],
    [CB("ETL"), C("Economic threshold level — the point at which acting costs less than not acting")],
    [CB("PHI"), C("Pre-harvest interval — days after spraying before the block may be cut")],
    [CB("REI"), C("Re-entry interval — hours after spraying before anyone may enter")],
    [CB("RAC group"), C("Mode-of-action code. Rotating groups is what prevents resistance")],
    [CB("WHO class"), C("Acute hazard classification. Class II and above requires full PPE")],
    [CB("Hotspot"), C("Any single observation at severity 4 or above")],
    [CB("Program"), C("One spray event, which may contain several tank-mixed products")],
    [CB("Round"), C("One scout's walk of a block, submitted together as a batch")],
    [CB("Dwell cap"), C("45 minutes. A longer gap between two records is counted as a "
                        "break, not as time spent on a bed, so the movement report is "
                        "not inflated by lunch")],
], [32 * mm, W - 32 * mm])


# ── 7. Troubleshooting ──────────────────────────────────────────────────────
h1("Troubleshooting")
tbl([
    [CH("Symptom"), CH("What to do")],
    [CB("A scout's records have not appeared"),
     C("They are queued on the phone awaiting signal. Open the app in coverage and "
       "they send themselves. Sending twice cannot duplicate them.")],
    [CB("The app will not accept a location"),
     C("GPS cannot confirm the scout is inside the boundary, which is common under "
       "polythene. Scan the greenhouse QR code instead.")],
    [CB("A block reports impossibly high pressure"),
     C("Almost always missing beds. Check under <b>Settings &rarr; Farm Mapping</b> that "
       "every bed in that block is registered.")],
    [CB("A spray is blocked and should not be"),
     C("Read the reason given. Where it is resistance rotation, choose a different RAC "
       "group — the check is doing its job. Override only with a stated reason.")],
    [CB("A record looks wrong"),
     C("Obvious outliers are flagged automatically against the block's own history and "
       "appear marked in the reports. Open the record to see why it was flagged.")],
    [CB("The wallboard says data may be stale"),
     C("It has not refreshed for five minutes. Check the display's network connection, "
       "then reload the page.")],
    [CB("A cost looks wrong on a program"),
     C("Check the tank volume and the rate per 100 litres. Quantity, and therefore cost, "
       "is derived from both.")],
], [W * 0.34, W * 0.66])

p("If a problem is not listed here, note what you were doing, what you expected and "
  "what happened, and pass it to your system administrator with the date and time.",
  "Body")

# ── Build ───────────────────────────────────────────────────────────────────
doc = Doc(OUT, "Florisynergy IPM — User Manual", "Florisynergy IPM · User Manual")
from docbase import NumberedCanvas  # noqa: E402
doc.multiBuild(story, canvasmaker=NumberedCanvas)
print("wrote", OUT)
