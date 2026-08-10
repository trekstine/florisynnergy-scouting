"""Document framework for Florisynergy PDFs.

What separates a document from a styled web page: a cover, a contents page
with real page numbers, numbered sections you can cite, a running header that
tells you where you are, and "Page 3 of 9" so a reader knows if a page is
missing. All of that lives here so the content files stay readable.
"""
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.platypus import (
    BaseDocTemplate, Frame, NextPageTemplate, PageBreak, PageTemplate,
    Paragraph, Spacer, Table, TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents

BRAND_DIR = "/sessions/adoring-hopeful-meitner/mnt/florisynergy_scouting/web/public/brand"
LOCKUP = f"{BRAND_DIR}/florisynergy-logo.png"
MARK = f"{BRAND_DIR}/florisynergy-mark.png"

NAVY = colors.HexColor("#272262")
NAVY_L = colors.HexColor("#4a4490")
GREY = colors.HexColor("#bdbec0")
INK = colors.HexColor("#111827")
BODY = colors.HexColor("#2b3444")
FAINT = colors.HexColor("#6b7280")
LINE = colors.HexColor("#d8dae0")
HAIR = colors.HexColor("#eceef2")
SURFACE = colors.HexColor("#f6f7f9")
GREEN = colors.HexColor("#0f7a52")
AMBER = colors.HexColor("#96601a")
RED = colors.HexColor("#a11d1d")

PAGE = A4
LEFT = 24 * mm
RIGHT = 20 * mm
TOP = 26 * mm
BOTTOM = 22 * mm
W = PAGE[0] - LEFT - RIGHT


# ── Styles ──────────────────────────────────────────────────────────────────
def styles():
    s = getSampleStyleSheet()
    add = s.add

    add(ParagraphStyle("CoverTitle", fontName="Helvetica-Bold", fontSize=32,
                       leading=36, textColor=NAVY, spaceAfter=6))
    add(ParagraphStyle("CoverSub", fontName="Helvetica", fontSize=13.5,
                       leading=19, textColor=FAINT, spaceAfter=4))
    add(ParagraphStyle("TocTitle", fontName="Helvetica-Bold", fontSize=17,
                       leading=21, textColor=NAVY, spaceAfter=12))

    add(ParagraphStyle("H1", fontName="Helvetica-Bold", fontSize=16, leading=20,
                       textColor=NAVY, spaceBefore=2, spaceAfter=9))
    add(ParagraphStyle("H2", fontName="Helvetica-Bold", fontSize=11.5, leading=15,
                       textColor=INK, spaceBefore=14, spaceAfter=5))
    add(ParagraphStyle("H3", fontName="Helvetica-Bold", fontSize=10, leading=14,
                       textColor=BODY, spaceBefore=10, spaceAfter=3))

    add(ParagraphStyle("Body", fontName="Helvetica", fontSize=10, leading=15.5,
                       textColor=BODY, alignment=TA_LEFT, spaceAfter=8))
    add(ParagraphStyle("Lead", fontName="Helvetica", fontSize=11, leading=17,
                       textColor=BODY, spaceAfter=12))
    add(ParagraphStyle("Step", fontName="Helvetica", fontSize=10, leading=15.5,
                       textColor=BODY, leftIndent=16, bulletIndent=3,
                       spaceAfter=5))
    add(ParagraphStyle("Cell", fontName="Helvetica", fontSize=9, leading=13.2,
                       textColor=BODY))
    add(ParagraphStyle("CellB", fontName="Helvetica-Bold", fontSize=9,
                       leading=13.2, textColor=INK))
    add(ParagraphStyle("CellH", fontName="Helvetica-Bold", fontSize=8.4,
                       leading=12, textColor=colors.white))
    add(ParagraphStyle("Note", fontName="Helvetica", fontSize=9.4, leading=14,
                       textColor=BODY, leftIndent=2, rightIndent=2))
    add(ParagraphStyle("NoteH", fontName="Helvetica-Bold", fontSize=8.6,
                       leading=12, textColor=NAVY))
    add(ParagraphStyle("Small", fontName="Helvetica", fontSize=8.2, leading=11.5,
                       textColor=FAINT))
    add(ParagraphStyle("Formula", fontName="Helvetica-Bold", fontSize=11,
                       leading=16, textColor=NAVY, alignment=TA_CENTER))

    # Table-of-contents levels.
    # Tight enough that a 7-section contents fits one page — a contents page
    # that spills four lines onto a second, otherwise-blank page looks careless.
    add(ParagraphStyle("TOC1", fontName="Helvetica-Bold", fontSize=10.5,
                       leading=17, textColor=INK, spaceBefore=4))
    add(ParagraphStyle("TOC2", fontName="Helvetica", fontSize=9.4, leading=13.5,
                       textColor=BODY, leftIndent=14))
    return s


S = styles()


# ── Page furniture ──────────────────────────────────────────────────────────
class NumberedCanvas(pdfcanvas.Canvas):
    """Two-pass canvas so the footer can say "Page 3 of 9"."""

    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self._saved = []

    def showPage(self):
        self._saved.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved)
        for state in self._saved:
            self.__dict__.update(state)
            if getattr(self, "_furniture", None):
                self._furniture(self, total)
            super().showPage()
        super().save()


def _draw_furniture(doc_title):
    def draw(c, total):
        if c._pageNumber == 1:          # cover carries none
            return
        section = getattr(c, "_section", "") or ""

        # Running header
        c.saveState()
        y = PAGE[1] - TOP + 9 * mm
        c.setFont("Helvetica", 8)
        c.setFillColor(FAINT)
        c.drawString(LEFT, y, doc_title)
        c.drawRightString(PAGE[0] - RIGHT, y, section)
        c.setStrokeColor(LINE)
        c.setLineWidth(0.5)
        c.line(LEFT, y - 2.5 * mm, PAGE[0] - RIGHT, y - 2.5 * mm)

        # Running footer
        fy = BOTTOM - 8 * mm
        c.line(LEFT, fy + 5 * mm, PAGE[0] - RIGHT, fy + 5 * mm)
        try:
            c.drawImage(MARK, LEFT, fy - 1 * mm, width=6.5 * mm, height=5 * mm,
                        mask="auto")
        except Exception:
            pass
        c.setFont("Helvetica", 7.6)
        c.setFillColor(FAINT)
        c.drawString(LEFT + 8.5 * mm, fy + 0.6 * mm, "Florisynergy IPM")
        c.drawRightString(PAGE[0] - RIGHT, fy + 0.6 * mm,
                          f"Page {c._pageNumber} of {total}")
        c.restoreState()
    return draw


class Doc(BaseDocTemplate):
    """Cover + body templates, TOC notification, running section name."""

    def __init__(self, filename, title, doc_title, **kw):
        super().__init__(filename, pagesize=PAGE, leftMargin=LEFT,
                         rightMargin=RIGHT, topMargin=TOP, bottomMargin=BOTTOM,
                         title=title, author="Florisynergy", **kw)
        cover_frame = Frame(LEFT, BOTTOM, W, PAGE[1] - TOP - BOTTOM, id="cover")
        body_frame = Frame(LEFT, BOTTOM, W, PAGE[1] - TOP - BOTTOM, id="body")
        self.addPageTemplates([
            PageTemplate(id="cover", frames=[cover_frame]),
            PageTemplate(id="body", frames=[body_frame],
                         onPage=self._stamp),
        ])
        self._doc_title = doc_title
        self._section = ""

    def beforeDocument(self):
        """multiBuild runs the story twice; without this the second pass starts
        with the section name left over from the end of the first, which put
        "7. Troubleshooting" in the header of the contents page."""
        self._section = ""

    def _stamp(self, canvas, doc):
        # Page start: assume the page continues the current section. If a new
        # H1 lands on this page, afterFlowable overwrites it below — the last
        # write before showPage is what gets captured, which is what a reader
        # expects the header to say.
        canvas._section = self._section
        canvas._furniture = _draw_furniture(self._doc_title)

    def afterFlowable(self, flowable):
        """Feed the contents page and the running header."""
        if not isinstance(flowable, Paragraph):
            return
        name = flowable.style.name
        text = flowable.getPlainText()
        if name == "H1":
            self._section = text
            if getattr(self, "canv", None) is not None:
                self.canv._section = text
            self.notify("TOCEntry", (0, text, self.page))
        elif name == "H2":
            self.notify("TOCEntry", (1, text, self.page))


def toc():
    t = TableOfContents()
    t.levelStyles = [S["TOC1"], S["TOC2"]]
    t.dotsMinLevel = 0
    return t


# ── Content helpers ─────────────────────────────────────────────────────────
class Numbering:
    """1., 1.1, 1.2 — so a reader can say "see 2.3" and be understood."""

    def __init__(self):
        self.h1 = 0
        self.h2 = 0

    def one(self, text):
        self.h1 += 1
        self.h2 = 0
        return f"{self.h1}.&nbsp;&nbsp;{text}"

    def two(self, text):
        self.h2 += 1
        return f"{self.h1}.{self.h2}&nbsp;&nbsp;{text}"


def table(rows, widths, header=True, zebra=True, align_first_bold=True):
    """A document table: solid navy header, hairline rows, generous padding."""
    t = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
    st = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6.5),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, HAIR),
        ("LINEBELOW", (0, -1), (-1, -1), 0.7, LINE),
    ]
    if header:
        st += [
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("LINEBELOW", (0, 0), (-1, 0), 0, NAVY),
            ("TOPPADDING", (0, 0), (-1, 0), 7),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 7),
        ]
        if zebra:
            for i in range(2, len(rows), 2):
                st.append(("BACKGROUND", (0, i), (-1, i), SURFACE))
    else:
        st.append(("LINEABOVE", (0, 0), (-1, 0), 0.7, LINE))
        if zebra:
            for i in range(1, len(rows), 2):
                st.append(("BACKGROUND", (0, i), (-1, i), SURFACE))
    t.setStyle(TableStyle(st))
    return t


def note(title, body, tone=NAVY):
    inner = Table(
        [[Paragraph(f'<font color="{tone.hexval()}">{title.upper()}</font>', S["NoteH"])],
         [Paragraph(body, S["Note"])]],
        colWidths=[W - 6 * mm],
    )
    inner.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, 0), 0),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 3),
        ("TOPPADDING", (0, 1), (-1, 1), 0),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 0),
    ]))
    outer = Table([[inner]], colWidths=[W])
    outer.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SURFACE),
        ("LINEBEFORE", (0, 0), (0, -1), 2.5, tone),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return outer


def cover(title, subtitle, meta_rows, classification=None):
    """Full-page cover: mark, title block, and a document-control table."""
    from reportlab.platypus import Image
    out = [
        Spacer(1, 26 * mm),
        Image(LOCKUP, width=62 * mm, height=28.7 * mm, hAlign="LEFT"),
        Spacer(1, 30 * mm),
        Paragraph(title, S["CoverTitle"]),
        Paragraph(subtitle, S["CoverSub"]),
        Spacer(1, 4 * mm),
    ]
    bar = Table([[""]], colWidths=[38 * mm], rowHeights=[2.4])
    bar.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), NAVY)]))
    out += [bar, Spacer(1, 62 * mm)]

    rows = [[Paragraph(f"<b>{k}</b>", S["Cell"]), Paragraph(v, S["Cell"])]
            for k, v in meta_rows]
    out.append(table(rows, [38 * mm, W - 38 * mm], header=False, zebra=False))
    if classification:
        out += [Spacer(1, 5 * mm), Paragraph(classification, S["Small"])]
    out += [NextPageTemplate("body"), PageBreak()]
    return out
