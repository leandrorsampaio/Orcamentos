"""
LAYOUT REFERENCE — Orçamento PDF geometry (Stilus Decora / LVI Planejados)
==========================================================================

This is the REFERENCE implementation of the orçamento layout, written with
reportlab (Python). The production app generates the PDF *in the browser*
(pdf-lib / jsPDF) per BUILD_SPEC §3 — DO NOT ship Python. Port this geometry
faithfully to JS. The generated sample PDFs in this folder are the visual
acceptance target (BUILD_SPEC §11 acceptance criteria).

Page: A4 (595.27 x 841.89 pt). Margins ~2cm (56.7pt). Font: Helvetica.
Text color near-black #1A1A1A. Logo asset: ../logo_final.png (1785x1123 px).

Key geometry notes:
- Header logo: 3.6cm wide, top-left, top edge 2.2cm from top.
- Company text block starts x=6.5cm, top y = H-2.2cm, lines step down 0.45cm.
  Title 13pt bold; body 9.5pt. Bold labels: "Fone:", "Cel:", "E-mail:",
  "Instagram:", plus the title line and the company-name line ("LVI Planejados").
- Body starts ~y=H-7.0cm (single client line) or H-6.6cm (with endereço).
- Centered bold date line: "São Paulo, DD de <mês> de AAAA" (11pt).
- "Cliente:" / "Endereço:" bold labels (omit Endereço line if empty).
- Each item: bold "NN / <descrição>" wrapped to content width (0.55cm leading),
  then a "valor" line: bold "valor" + dotted leader + right-aligned "R$ x.xxx,xx".
- TOTAL line (bold + dotted leader) only when >= 2 items.
- Footer: bold "prazo de entrega:", "cond. de pag.:", "material entregue e
  instalado no local", then two dotted signature lines.
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

W, H = A4
BLACK = HexColor("#1A1A1A")
LOGO_PATH = "../logo_final.png"   # 1785 x 1123 px

# ---- company headers -------------------------------------------------------
HEADERS = {
    "lvi": {  # DEFAULT
        "company_line": "LVI Planejados",
        "doc_line": "CNPJ: 65.440.996/0001-00  Inscrição Estadual: 158.418.630.117",
    },
    "stilus": {  # original, kept available
        "company_line": "J.I. Sampaio Medeiras Ltda-ME",
        "doc_line": "CNPJ: 35.778.591/0001-07  Inscrição Estadual: 128.266.130.111",
    },
}


def _label_val(c, x, y, label, val, size=9.5, gap=0.12 * cm):
    c.setFont("Helvetica-Bold", size); c.drawString(x, y, label)
    x2 = x + c.stringWidth(label, "Helvetica-Bold", size) + gap
    c.setFont("Helvetica", size); c.drawString(x2, y, val)
    return x2 + c.stringWidth(val, "Helvetica", size)


def header(c, header_key="lvi"):
    h = HEADERS[header_key]
    iw, ih = 1785, 1123
    lw = 3.6 * cm; lh = lw * ih / iw
    c.drawImage(ImageReader(LOGO_PATH), 2 * cm, H - 2.2 * cm - lh, width=lw, height=lh,
                mask=[250, 255, 250, 255, 250, 255])
    tx = 6.5 * cm; ty = H - 2.2 * cm
    c.setFillColor(BLACK)
    c.setFont("Helvetica-Bold", 13); c.drawString(tx, ty, "Stilus Decorações")
    ty -= 0.5 * cm; c.setFont("Helvetica", 9.5)
    c.drawString(tx, ty, "Rua Chico Pontes, 812, Vila Guilherme - CEP 02067-002")
    ty -= 0.45 * cm
    x = _label_val(c, tx, ty, "Fone:", "(011) 2978-2067 / "); _label_val(c, x, ty, "Cel:", "(WhatsApp) 9-1096-1541")
    ty -= 0.45 * cm
    x = _label_val(c, tx, ty, "E-mail:", "stilusdecora@gmail.com   "); _label_val(c, x, ty, "Instagram:", "stilus_decora")
    ty -= 0.45 * cm; c.setFont("Helvetica-Bold", 9.5); c.drawString(tx, ty, h["company_line"])
    ty -= 0.45 * cm; c.setFont("Helvetica", 9.5); c.drawString(tx, ty, h["doc_line"])


def _wrap(c, text, x, y, font, size, maxw, leading):
    c.setFont(font, size); line = ""
    for w in text.split():
        t = (line + " " + w).strip()
        if c.stringWidth(t, font, size) <= maxw:
            line = t
        else:
            c.drawString(x, y, line); y -= leading; line = w
    if line:
        c.drawString(x, y, line); y -= leading
    return y


def _dots(c, x, y, label, value, size=11):
    f = "Helvetica-Bold"; c.setFont(f, size); c.drawString(x, y, label)
    lw = c.stringWidth(label, f, size); vw = c.stringWidth(value, f, size); rx = W - 2 * cm
    start = x + lw + 0.1 * cm; end = rx - vw - 0.1 * cm; s = ""
    c.setFont("Helvetica", size)
    while c.stringWidth(s + ".", "Helvetica", size) < (end - start):
        s += "."
    c.drawString(start, y, s); c.setFont(f, size); c.drawString(rx - vw, y, value)


def build(fname, datestr, cliente, endereco, items, prazo, cond_pag,
          total=None, header_key="lvi"):
    """items: list of (descricao, "x.xxx,xx"). total: "x.xxx,xx" or None."""
    c = canvas.Canvas(fname, pagesize=A4)
    header(c, header_key)
    y = (H - 6.6 * cm) if endereco else (H - 7.0 * cm)
    c.setFillColor(BLACK)
    c.setFont("Helvetica-Bold", 11); c.drawCentredString(W / 2, y, datestr); y -= 1.0 * cm
    if cliente:
        c.drawString(2 * cm, y, f"Cliente: {cliente}"); y -= 0.55 * cm
    if endereco:
        c.drawString(2 * cm, y, f"Endereço: {endereco}"); y -= 0.55 * cm
    y -= 0.5 * cm
    for desc, val in items:
        y = _wrap(c, desc, 2 * cm, y, "Helvetica-Bold", 11, W - 4 * cm, 0.52 * cm)
        _dots(c, 2 * cm, y, "valor", "R$  " + val); y -= 0.9 * cm
    if total:
        _dots(c, 2 * cm, y, "TOTAL", "R$  " + total); y -= 1.1 * cm
    c.setFont("Helvetica-Bold", 11)
    if prazo:
        c.drawString(2 * cm, y, f"prazo de entrega: {prazo}"); y -= 0.55 * cm
    if cond_pag:
        c.drawString(2 * cm, y, f"cond. de pag.: {cond_pag}"); y -= 0.55 * cm
    c.drawString(2 * cm, y, "material entregue e instalado no local"); y -= 1.6 * cm
    c.setFont("Helvetica", 11)
    c.drawString(2 * cm, y, "." * 40); c.drawString(10 * cm, y, "." * 40)
    c.save()


if __name__ == "__main__":
    build("sample_out.pdf", "São Paulo, 30 de junho de 2026", "Edson",
          "R. Eugênio de Freitas, 371, Ap. 125, Bloco A",
          [("01 / Armário em MDF branco com portas de correr, com gavetas e sapateira, conforme croqui, med. 2,30 x 1,75 x 0,60.", "6.400,00"),
           ("02 / Armário com duas torres de 40 e um aéreo com gavetas em uma das torres, med. cada torre 2,30 x 0,40 x 0,60.", "4.570,00")],
          "15 dias", "50% de sinal, 50% na entrega", total="10.970,00")
