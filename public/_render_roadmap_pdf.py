"""Render ROADMAP.md to a styled PDF using markdown-it-py + reportlab.

Pure-Python (no cairo / weasyprint / pandoc needed). Run:
    python public/_render_roadmap_pdf.py
"""
from pathlib import Path
from xml.sax.saxutils import escape as _escape

from markdown_it import MarkdownIt
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.colors import HexColor, white
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
)

ROOT = Path(__file__).resolve().parent.parent
MD = ROOT / "ROADMAP.md"
OUT = ROOT / "public" / "ROADMAP.pdf"

# ---------- Palette ----------
INK = HexColor("#14110D")
INK2 = HexColor("#5A5448")
INK3 = HexColor("#8A8474")
RULE = HexColor("#DCD6C7")
RULE2 = HexColor("#B8B0A0")
ACCENT = HexColor("#B85733")
HEADER_BG = HexColor("#14110D")
ROW_ALT = HexColor("#FAF7EE")
CODE_BG = HexColor("#F1ECDF")

# ---------- Styles ----------
def _ps(name, **kw):
    base = dict(name=name, fontName="Helvetica", fontSize=10, leading=14, textColor=INK, alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(**base)

H1 = _ps("H1", fontName="Helvetica-Bold", fontSize=22, leading=28, textColor=INK, spaceBefore=0, spaceAfter=4)
H1_SUB = _ps("H1Sub", fontSize=10, leading=13, textColor=INK2, spaceAfter=14)
H2 = _ps("H2", fontName="Helvetica-Bold", fontSize=16, leading=22, textColor=ACCENT, spaceBefore=18, spaceAfter=6)
H3 = _ps("H3", fontName="Helvetica-Bold", fontSize=12.5, leading=18, textColor=INK, spaceBefore=14, spaceAfter=4)
H4 = _ps("H4", fontName="Helvetica-Bold", fontSize=10.5, leading=14, textColor=INK, spaceBefore=8, spaceAfter=2)
BODY = _ps("Body", fontSize=10, leading=14, textColor=INK, spaceAfter=6)
LIST = _ps("List", fontSize=10, leading=14, textColor=INK, leftIndent=14, bulletIndent=2, spaceAfter=2)
TH = _ps("TH", fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=white)
TD = _ps("TD", fontSize=9, leading=12, textColor=INK)

# ---------- Markdown -> reportlab markup ----------
md = MarkdownIt("commonmark", {"breaks": False, "html": False}).enable(["table", "strikethrough"])


def render_inline(children) -> str:
    """Convert markdown-it inline children to a ReportLab-Paragraph minihtml string."""
    out = []
    for tok in children or []:
        t = tok.type
        if t == "text":
            out.append(_escape(tok.content))
        elif t == "softbreak":
            out.append(" ")
        elif t == "hardbreak":
            out.append("<br/>")
        elif t == "strong_open":
            out.append("<b>")
        elif t == "strong_close":
            out.append("</b>")
        elif t == "em_open":
            out.append("<i>")
        elif t == "em_close":
            out.append("</i>")
        elif t == "s_open":
            out.append("<strike>")
        elif t == "s_close":
            out.append("</strike>")
        elif t == "code_inline":
            # subtle pill style for inline code
            content = _escape(tok.content)
            out.append(
                f'<font face="Courier" color="#14110D" backColor="#F1ECDF" size="9">'
                f'&nbsp;{content}&nbsp;</font>'
            )
        elif t == "link_open":
            href = ""
            for k, v in (tok.attrs or {}).items() if isinstance(tok.attrs, dict) else (tok.attrs or []):
                if k == "href":
                    href = v
            out.append(f'<link href="{href}"><font color="#B85733"><u>')
        elif t == "link_close":
            out.append("</u></font></link>")
        else:
            # ignore unknown inline tokens
            pass
    return "".join(out)


def parse_table(tokens, i):
    """Consume tokens starting at table_open at index i. Return (table_flowable, next_i)."""
    rows = []
    is_header = False
    i += 1  # past table_open
    while tokens[i].type != "table_close":
        tok = tokens[i]
        if tok.type == "thead_open":
            is_header = True
        elif tok.type == "thead_close" or tok.type == "tbody_open":
            is_header = False if tok.type == "thead_close" else False
        elif tok.type == "tr_open":
            row = []
            row_is_header = is_header
            j = i + 1
            while tokens[j].type != "tr_close":
                if tokens[j].type in ("th_open", "td_open"):
                    inline = tokens[j + 1]
                    text = render_inline(inline.children) if inline.type == "inline" else ""
                    style = TH if (tokens[j].type == "th_open") else TD
                    row.append(Paragraph(text, style))
                    j += 3  # *_open, inline, *_close
                else:
                    j += 1
            rows.append((row_is_header, row))
            i = j  # at tr_close
        i += 1
    # build a single Table out of rows
    data = [r[1] for r in rows]
    n_cols = max(len(r[1]) for r in rows) if rows else 1
    # equal column widths, fitting the writable area
    page_w = A4[0] - 3 * cm  # 1.5cm margins both sides
    col_w = page_w / n_cols
    table = Table(data, colWidths=[col_w] * n_cols, repeatRows=1)
    ts = [
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, RULE2),
        ("GRID", (0, 1), (-1, -1), 0.3, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    # zebra striping on body rows
    for r in range(1, len(data)):
        if r % 2 == 0:
            ts.append(("BACKGROUND", (0, r), (-1, r), ROW_ALT))
    table.setStyle(TableStyle(ts))
    return table, i + 1  # past table_close


def parse_list(tokens, i, ordered=False):
    """Render bullet/ordered list as a sequence of bulleted paragraphs."""
    items = []
    i += 1
    item_idx = 0
    while tokens[i].type != ("ordered_list_close" if ordered else "bullet_list_close"):
        if tokens[i].type == "list_item_open":
            j = i + 1
            buf = []
            while tokens[j].type != "list_item_close":
                if tokens[j].type == "paragraph_open":
                    inline = tokens[j + 1]
                    buf.append(render_inline(inline.children))
                    j += 3
                elif tokens[j].type == "inline":
                    buf.append(render_inline(tokens[j].children))
                    j += 1
                else:
                    j += 1
            bullet = f"{item_idx + 1}." if ordered else "&#8226;"
            text = " ".join(buf)
            items.append(Paragraph(f"{bullet}&nbsp;&nbsp;{text}", LIST))
            item_idx += 1
            i = j  # at list_item_close
        i += 1
    return items, i + 1


def walk(tokens):
    out = []
    i = 0
    n = len(tokens)
    while i < n:
        tok = tokens[i]
        t = tok.type
        if t == "heading_open":
            level = int(tok.tag[1])
            inline = tokens[i + 1]
            text = render_inline(inline.children)
            style = {1: H1, 2: H2, 3: H3, 4: H4, 5: H4, 6: H4}[level]
            out.append(Paragraph(text, style))
            if level == 2:
                out.append(HRFlowable(width="100%", thickness=0.6, color=RULE, spaceBefore=2, spaceAfter=6))
            i += 3
        elif t == "paragraph_open":
            inline = tokens[i + 1]
            text = render_inline(inline.children)
            if text.strip():
                out.append(Paragraph(text, BODY))
            i += 3
        elif t == "bullet_list_open":
            items, i = parse_list(tokens, i, ordered=False)
            out.extend(items)
            out.append(Spacer(1, 4))
        elif t == "ordered_list_open":
            items, i = parse_list(tokens, i, ordered=True)
            out.extend(items)
            out.append(Spacer(1, 4))
        elif t == "table_open":
            table, i = parse_table(tokens, i)
            out.append(table)
            out.append(Spacer(1, 8))
        elif t == "hr":
            out.append(Spacer(1, 6))
            out.append(HRFlowable(width="100%", thickness=0.5, color=RULE2, spaceBefore=2, spaceAfter=8))
            i += 1
        elif t == "fence" or t == "code_block":
            content = _escape(tok.content.rstrip("\n"))
            code_style = ParagraphStyle(
                "Code",
                fontName="Courier",
                fontSize=8.5,
                leading=11,
                textColor=INK,
                backColor=CODE_BG,
                borderPadding=6,
                spaceAfter=8,
            )
            out.append(Paragraph(content.replace("\n", "<br/>"), code_style))
            i += 1
        else:
            i += 1
    return out


# ---------- Page decoration ----------
def _on_page(canvas, doc):
    canvas.saveState()
    # footer
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(INK3)
    page_num = canvas.getPageNumber()
    canvas.drawRightString(A4[0] - 1.5 * cm, 1 * cm, f"{page_num}")
    canvas.drawString(1.5 * cm, 1 * cm, "AfriCred - Technical Roadmap")
    # top hairline
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.4)
    canvas.line(1.5 * cm, A4[1] - 1.2 * cm, A4[0] - 1.5 * cm, A4[1] - 1.2 * cm)
    canvas.restoreState()


# ---------- Main ----------
def main():
    text = MD.read_text(encoding="utf-8")
    tokens = md.parse(text)
    flowables = walk(tokens)

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=1.6 * cm,
        bottomMargin=1.6 * cm,
        title="AfriCred - Technical Roadmap",
        author="AfriCred",
    )
    doc.build(flowables, onFirstPage=_on_page, onLaterPages=_on_page)
    size = OUT.stat().st_size
    print(f"Wrote {OUT} ({size:,} bytes)")


if __name__ == "__main__":
    main()
