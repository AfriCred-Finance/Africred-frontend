"""Render the AfriCred system architecture as a PNG using PIL.

Mirrors the layout of architecture.svg but rendered through Pillow so it works
on Windows without cairo. 2x density for crisp slides / Retina.
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT = Path(__file__).parent / "architecture.png"
W, H = 1280, 1060
SCALE = 2  # 2x for retina-crisp output

# Palette (AfriCred light theme)
BG     = (245, 241, 232)
WHITE  = (255, 255, 255)
SURF   = (250, 247, 238)
INK    = (20, 17, 13)
INK2   = (90, 84, 72)
INK3   = (138, 132, 116)
RULE   = (220, 214, 199)
ACCENT = (184, 87, 51)

img = Image.new("RGB", (W * SCALE, H * SCALE), BG)
d = ImageDraw.Draw(img)

# Fonts: prefer Inter/Segoe UI on Windows
FONT_DIR = Path("C:/Windows/Fonts")

def font(name_candidates, size):
    for name in name_candidates:
        p = FONT_DIR / name
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size * SCALE)
            except Exception:
                pass
    return ImageFont.load_default()

f_h1     = font(["seguisb.ttf", "segoeuib.ttf", "arialbd.ttf"], 22)
f_title  = font(["seguisb.ttf", "segoeuib.ttf", "arialbd.ttf"], 14)
f_title2 = font(["seguisb.ttf", "segoeuib.ttf", "arialbd.ttf"], 13)
f_sub    = font(["segoeui.ttf",  "arial.ttf"], 11)
f_mini   = font(["segoeui.ttf",  "arial.ttf"], 10)
f_eyebrow= font(["consolab.ttf", "consola.ttf", "courbd.ttf"], 10)
f_label  = font(["consola.ttf",  "courbd.ttf"], 10)
f_atitle = font(["seguisb.ttf", "segoeuib.ttf", "arialbd.ttf"], 13)
f_asub   = font(["segoeui.ttf",  "arial.ttf"], 10)


def s(v):
    return v * SCALE


def text(x, y, txt, fnt, color):
    d.text((s(x), s(y)), txt, font=fnt, fill=color)


def rect(x, y, w, h, fill=WHITE, stroke=RULE, sw=1, r=6):
    d.rounded_rectangle(
        (s(x), s(y), s(x + w), s(y + h)),
        radius=s(r),
        fill=fill,
        outline=stroke,
        width=max(1, int(sw * SCALE)),
    )


def line(x1, y1, x2, y2, color=INK2, w=1.2, arrow=True, accent=False):
    if accent:
        color = ACCENT
        w = 1.4
    d.line((s(x1), s(y1), s(x2), s(y2)), fill=color, width=max(1, int(w * SCALE)))
    if arrow:
        arrowhead(x2, y2, x1, y1, color)


def arrowhead(x, y, fromx, fromy, color):
    """Draw a 7px triangle at (x, y) pointing away from (fromx, fromy)."""
    import math
    dx, dy = x - fromx, y - fromy
    length = math.hypot(dx, dy) or 1
    ux, uy = dx / length, dy / length
    size = 5
    px, py = -uy, ux
    p1 = (s(x), s(y))
    p2 = (s(x - ux * size + px * size * 0.6), s(y - uy * size + py * size * 0.6))
    p3 = (s(x - ux * size - px * size * 0.6), s(y - uy * size - py * size * 0.6))
    d.polygon([p1, p2, p3], fill=color)


def wrap_text(txt, fnt, max_width_pt):
    """Break txt into lines whose pixel width fits max_width_pt (in unscaled points)."""
    words = txt.split()
    lines, current = [], []
    for word in words:
        candidate = " ".join(current + [word])
        bbox = fnt.getbbox(candidate)
        width_px = bbox[2] - bbox[0]
        if width_px <= max_width_pt * SCALE or not current:
            current.append(word)
        else:
            lines.append(" ".join(current))
            current = [word]
    if current:
        lines.append(" ".join(current))
    return lines


def text_block(x, y, txt, fnt, color, max_width_pt, line_h_pt):
    """Word-wrap txt and draw it line-by-line. Returns the y after the last line."""
    yy = y
    for ln in wrap_text(txt, fnt, max_width_pt):
        text(x, yy, ln, fnt, color)
        yy += line_h_pt
    return yy


def curve(points, color=INK2, accent=False):
    """Simplified curve: just draw a polyline through the control points."""
    w = 1.2
    if accent:
        color = ACCENT
        w = 1.4
    flat = []
    for (x, y) in points:
        flat.append(s(x))
        flat.append(s(y))
    d.line(flat, fill=color, width=max(1, int(w * SCALE)), joint="curve")
    # arrow at last segment
    arrowhead(points[-1][0], points[-1][1], points[-2][0], points[-2][1], color)


# =================== Title ===================
text(40, 40, "AfriCred - System Architecture", f_h1, INK)
text(40, 72, "On-chain credit vaults for African SME finance. Base Sepolia testnet.", f_sub, INK2)

# =================== Actors ===================
text(40, 112, "// ACTORS", f_eyebrow, INK3)

actors = [
    (40,   128, "Admin",         "Factory owner. Originates loans, holds the loan NFT, services repayments."),
    (340,  128, "Allocator",     "Takes custody, deploys to SME off-chain, returns principal + interest."),
    (640,  128, "LP",            "Deposits USDC during funding and redeems shares after settlement."),
    (940,  128, "Borrower (SME)","Submits a loan request and repays per schedule off-chain."),
]
ACTOR_H = 84
for (x, y, t, sub) in actors:
    w = 280 if x != 940 else 300
    d.rounded_rectangle((s(x), s(y), s(x + w), s(y + ACTOR_H)), radius=s(6), fill=INK)
    text(x + 20, y + 14, t, f_atitle, (245, 241, 232))
    text_block(x + 20, y + 36, sub, f_asub, (200, 195, 180), max_width_pt=w - 36, line_h_pt=14)

# =================== Frontend group ===================
text(40, 228, "// FRONTEND  -  Next.js 14 on Vercel", f_eyebrow, INK3)
rect(40, 244, 900, 220, fill=SURF, stroke=RULE)
text(60, 256, "af-frontend", f_title, INK)
text(60, 276, "App Router - React 18 - TypeScript - Tailwind - wagmi v2 + viem - TanStack Query", f_sub, INK2)

# Pages strip
rect(60, 302, 860, 48)
text(76, 312, "Pages", f_title2, INK)
text(76, 330, "/  -  /vaults  -  /vault/[address]  -  /admin  -  /borrow", f_sub, INK2)

# wagmi
rect(60, 362, 420, 86)
text(76, 372, "wagmi v2 + viem", f_title2, INK)
text(76, 392, "Injected connector (MetaMask, Rabby, Phantom)", f_sub, INK2)
text(76, 408, "Auto-switches to Base Sepolia on connect", f_sub, INK2)
text(76, 424, "One-click Approve+Deposit / Approve+Repay flows", f_sub, INK2)

# API
rect(500, 362, 420, 86)
text(516, 372, "API routes (serverless)", f_title2, INK)
text(516, 392, "/api/ipfs - pin dossier files (wrapWithDirectory)", f_sub, INK2)
text(516, 408, "/api/ipfs/list - enumerate pinned files", f_sub, INK2)
text(516, 424, "/api/loan-request - pin borrower JSON", f_sub, INK2)

# =================== Pinata sidecar ===================
rect(970, 244, 270, 220, fill=SURF, stroke=RULE)
text(990, 256, "Pinata", f_title, INK)
text(990, 276, "IPFS pinning service", f_sub, INK2)

rect(990, 302, 230, 146)
text(1006, 312, "PINATA_JWT (server-only)", f_title2, INK)
text(1006, 334, "Dossier PDFs pinned under", f_sub, INK2)
text(1006, 350, "CID/dossier/<original-name>", f_sub, INK2)
text(1006, 374, "Borrower JSON records via", f_sub, INK2)
text(1006, 390, "pinJSONToIPFS", f_sub, INK2)
text(1006, 420, "// CID RETURNED TO UI", f_eyebrow, INK3)

# =================== Bridge band ===================
line(220, 490, 220, 540, accent=True)
text(232, 510, "writeContract", f_label, INK2)
line(720, 490, 720, 540, accent=True)
text(732, 510, "readContract / poll", f_label, INK2)

# =================== Chain group ===================
# 4 columns (Router | Factory | LoanRegistryNFT | USDC) x 3 rows:
#   Row 1 (y=600): AfriCredRouter   AfriCredFactory   LoanRegistryNFT   (empty)
#   Row 2 (y=730): IDexAdapter      VaultDeployer     AfriCredVault     USDC
#   Row 3 (y=920):                                    LayerZero
text(40, 560, "// ON-CHAIN  -  af-contracts on Base Sepolia (chain id 84532)", f_eyebrow, INK3)
rect(40, 572, 1200, 460, fill=SURF, stroke=RULE)

# --- Row 1 ---
# Router (col 1)
rect(60, 600, 260, 100)
text(76, 612, "AfriCredRouter", f_title, INK)
text(76, 634, "Single LP entry point", f_sub, INK2)
text(76, 650, "deposit / redeem - zapAndDeposit", f_sub, INK2)
text(76, 666, "Validates target via factory.isVault[]", f_sub, INK2)
text(76, 684, "ReentrancyGuard, no user funds between calls", f_mini, INK3)

# Factory (col 2, accent)
rect(360, 600, 260, 100, fill=WHITE, stroke=ACCENT, sw=1.4)
text(376, 612, "AfriCredFactory", f_title, INK)
text(376, 634, "Owner-only registry & deployer", f_sub, INK2)
text(376, 650, "createLoanVault(loanParams, vaultParams)", f_sub, INK2)
text(376, 666, "isVault[] - whitelistedAssets[]", f_sub, INK2)
text(376, 684, "Ownable (multisig in prod)", f_mini, INK3)

# LoanRegistryNFT (col 3)
rect(660, 600, 260, 100)
text(676, 612, "LoanRegistryNFT", f_title, INK)
text(676, 634, "ERC721, one token per loan", f_sub, INK2)
text(676, 650, "terms - schedule - status - dossier URI", f_sub, INK2)
text(676, 666, "restructureLoan - setStatus", f_sub, INK2)
text(676, 684, "NFT holder = vault admin", f_mini, INK3)

# --- Row 2 ---
# IDexAdapter (col 1)
rect(60, 730, 260, 100)
text(76, 742, "IDexAdapter (interface)", f_title, INK)
text(76, 764, "Pluggable swap router", f_sub, INK2)
text(76, 782, "Zaps non-USDC stable into USDC", f_sub, INK2)
text(76, 808, "Wired through AfriCredRouter", f_mini, INK3)

# VaultDeployer (col 2)
rect(360, 730, 260, 100)
text(376, 742, "VaultDeployer", f_title, INK)
text(376, 764, "Stateless creation-bytecode carrier", f_sub, INK2)
text(376, 782, "Keeps Factory under 24,576-byte limit", f_sub, INK2)
text(376, 808, "deploy(args) -> new AfriCredVault", f_mini, INK3)

# Vault (col 3, accent, prominent)
rect(660, 730, 260, 160, fill=WHITE, stroke=ACCENT, sw=1.4)
text(676, 742, "AfriCredVault", f_title, INK)
text(676, 762, "ERC4626 + LayerZero OFTCore", f_sub, INK2)
text(676, 782, "Lifecycle: Closed -> Funding ->", f_sub, INK2)
text(676, 798, "             Custody -> OpenWithdrawal", f_sub, INK2)
text(676, 818, "Frozen NAV while custodied", f_sub, INK2)
text(676, 836, "Optional senior/junior tranche buffer", f_sub, INK2)
text(676, 852, "Optional depositor whitelist", f_sub, INK2)
text(676, 872, "owner() defers to loan NFT holder", f_mini, INK3)

# USDC (col 4)
rect(960, 730, 260, 100)
text(976, 742, "USDC (asset)", f_title, INK)
text(976, 764, "MockUSDC on testnet", f_sub, INK2)
text(976, 782, "Circle USDC on mainnet", f_sub, INK2)
text(976, 808, "Faucet-able for demo flows", f_mini, INK3)

# --- Row 3 ---
# LayerZero (col 3, below Vault)
rect(660, 920, 260, 100)
text(676, 932, "LayerZero EndpointV2", f_title, INK)
text(676, 954, "Shared testnet endpoint", f_sub, INK2)
text(676, 972, "Lock / unlock OFT model", f_sub, INK2)
text(676, 988, "(home-chain totalSupply preserved)", f_sub, INK2)
text(676, 1008, "Peers off by default until audit", f_mini, INK3)

# =================== Edges ===================
# Labels for row-1 horizontal arrows are floated up into the eyebrow band so they
# don't sit on top of card titles.

# Router -> Factory (validates)
line(320, 650, 356, 650)
text(323, 590, "validates", f_label, INK2)

# Factory -> LoanNFT (mints)
line(620, 650, 656, 650)
text(630, 590, "mints", f_label, INK2)

# Factory -> VaultDeployer (delegates) -- vertical down in col 2
line(490, 700, 490, 727)
text(498, 710, "delegates", f_label, INK2)

# VaultDeployer -> Vault (new) -- short label fits inside the col-2/col-3 gap at y=780
line(620, 780, 656, 780)
text(630, 770, "new", f_label, INK2)

# Vault -> LoanNFT (owner) -- vertical up in col 3
line(790, 730, 790, 703, accent=True)
text(798, 712, "owner()", f_label, INK2)

# Vault -> USDC (pulls / holds) -- label floated above the row to clear USDC content
line(920, 780, 956, 780)
text(924, 718, "pulls / holds", f_label, INK2)

# Vault -> LayerZero (OFT bridge) -- vertical down in col 3
line(790, 890, 790, 917, accent=True)
text(798, 900, "OFT bridge", f_label, INK2)

# Router -> IDexAdapter (zap) -- vertical down in col 1
line(190, 700, 190, 727)
text(198, 710, "zap", f_label, INK2)

# Router -> Vault (deposit / redeem) -- routed through the gap between row 1 and row 2
curve([(320, 720), (656, 720), (656, 760)], accent=True)
text(400, 706, "deposit / redeem", f_label, INK2)

# Actors -> Frontend pages (4)
for x in (180, 480, 780, 1090):
    line(x, 128 + ACTOR_H, x, 244)

# API -> Pinata
line(920, 405, 990, 405)
text(924, 394, "pin / list", f_label, INK2)

# =================== Save ===================
img.save(OUT, "PNG", optimize=True)
import os
print(f"Wrote {OUT} ({os.path.getsize(OUT):,} bytes, {img.size[0]}x{img.size[1]} px)")
