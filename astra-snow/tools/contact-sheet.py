"""Render every stop over the City of Barrie 2023 10 cm orthophoto for visual QA.

    python3 tools/contact-sheet.py [first_seq] [last_seq]

Reads private/route.json, writes private/contact/sheet-NN.jpg (git-ignored).
Overlays: parcel (yellow), 2016 driveway polygons (cyan, primary thicker),
driveway entrance (red), stop point on the street (magenta), City address
point (white). The QA question for each cell: does the red dot sit at the
street end of the driveway this customer actually uses?
"""
import io
import json
import math
import os
import sys
import urllib.request
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TILE = "https://gisapps.barrie.ca/image/rest/services/Public/Barrie_Ortho_2023_10cm_Cache_WebMercator/MapServer/tile/{z}/{y}/{x}"
CACHE = os.path.join(ROOT, "private", "tilecache")
OUT = os.path.join(ROOT, "private", "contact")
Z = 20
CELL = 512  # pixels at zoom Z (~55 m across)
THUMB = 400
COLS, ROWS = 4, 3

os.makedirs(CACHE, exist_ok=True)
os.makedirs(OUT, exist_ok=True)


def world_px(lng, lat, z=Z):
    n = 256 * 2 ** z
    x = (lng + 180) / 360 * n
    s = math.sin(math.radians(lat))
    y = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n
    return x, y


def tile(z, x, y):
    p = os.path.join(CACHE, f"{z}_{x}_{y}.jpg")
    if not os.path.exists(p):
        req = urllib.request.Request(TILE.format(z=z, x=x, y=y), headers={"User-Agent": "route-qa/1.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
        with open(p, "wb") as f:
            f.write(data)
    return Image.open(p).convert("RGB")


def render(stop):
    cx, cy = world_px(*stop["target"])
    x0, y0 = cx - CELL / 2, cy - CELL / 2
    img = Image.new("RGB", (CELL, CELL))
    for ty in range(int(y0 // 256), int((y0 + CELL) // 256) + 1):
        for tx in range(int(x0 // 256), int((x0 + CELL) // 256) + 1):
            try:
                img.paste(tile(Z, tx, ty), (int(tx * 256 - x0), int(ty * 256 - y0)))
            except Exception:
                pass
    d = ImageDraw.Draw(img)

    def px(p):
        x, y = world_px(*p)
        return (x - x0, y - y0)

    # Street centrelines with City names, so corner lots can be judged.
    for seg in ROADS:
        for line in seg["lines"]:
            pts = [px(p) for p in line]
            if all(not (-60 < x < CELL + 60 and -60 < y < CELL + 60) for x, y in pts):
                continue
            d.line(pts, fill=(255, 255, 255), width=1)
            mid = pts[len(pts) // 2]
            if 10 < mid[0] < CELL - 120 and 10 < mid[1] < CELL - 20:
                d.text((mid[0] + 3, mid[1] + 3), seg["name"], fill=(0, 0, 0), font=LBL)
                d.text((mid[0] + 2, mid[1] + 2), seg["name"], fill=(255, 255, 160), font=LBL)
    if stop.get("parcel"):
        d.line([px(p) for p in stop["parcel"]], fill=(255, 220, 0), width=2)
    for i, dw in enumerate(stop.get("driveways", [])):
        d.line([px(p) for p in dw["polygon"]], fill=(0, 230, 255), width=4 if i == 0 else 2)
    def dot(p, r, col):
        x, y = px(p)
        d.ellipse([x - r, y - r, x + r, y + r], outline=(0, 0, 0), fill=col, width=2)
    dot(stop["point"], 6, (255, 255, 255))
    dot(stop["stopPoint"], 7, (255, 0, 220))
    dot(stop["target"], 8, (255, 40, 40))
    return img.resize((THUMB, THUMB), Image.LANCZOS)


ROADS = json.load(open(os.path.join(ROOT, "public", "data", "roads.json")))["segments"]
try:
    LBL = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 18)
except Exception:
    LBL = ImageFont.load_default()


def main():
    route = json.load(open(os.path.join(ROOT, "private", "route.json")))
    stops = route["stops"]
    lo = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    hi = int(sys.argv[2]) if len(sys.argv) > 2 else len(stops)
    stops = [s for s in stops if lo <= s["seq"] <= hi]
    if os.environ.get("SEQS"):
        want = {int(x) for x in os.environ["SEQS"].split(",")}
        stops = [s for s in route["stops"] if s["seq"] in want]
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 15)
        small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)
    except Exception:
        font = small = ImageFont.load_default()
    per = COLS * ROWS
    LABEL = 54
    for sheet in range(0, len(stops), per):
        batch = stops[sheet : sheet + per]
        canvas = Image.new("RGB", (COLS * THUMB, ROWS * (THUMB + LABEL)), (12, 14, 18))
        d = ImageDraw.Draw(canvas)
        for i, s in enumerate(batch):
            cx, cy = (i % COLS) * THUMB, (i // COLS) * (THUMB + LABEL)
            canvas.paste(render(s), (cx, cy + LABEL))
            dw = s.get("driveways") or []
            d.text((cx + 6, cy + 4), f"#{s['seq']}  {s['address']}  [{len(dw)} dw → {dw[0]['street'] if dw else 'none'}]", fill=(255, 255, 255), font=font)
            note = (s["note"] or "")[:62]
            iss = "; ".join(i for i in s["issues"] if not i.startswith("street suffix"))[:62]
            d.text((cx + 6, cy + 22), note, fill=(255, 190, 80), font=small)
            d.text((cx + 6, cy + 37), iss, fill=(255, 110, 110), font=small)
        name = os.path.join(OUT, f"sheet-{batch[0]['seq']:03d}-{batch[-1]['seq']:03d}.jpg")
        canvas.save(name, quality=82)
        print(name)


if __name__ == "__main__":
    main()
