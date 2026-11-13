"""把参考视频帧和我们的网页截图拼成一张对照图（上：建造；下：行驶）。"""
import pathlib

from PIL import Image, ImageDraw, ImageFont

REF_BUILD = r"C:\Users\chenyang\.dsh\video-reader\work\frames-2026-11-12T18-38-45-945Z-11744\frame-01-1-09.7.jpg"
REF_RUN = r"C:\Users\chenyang\.dsh\video-reader\work\frames-2026-11-12T18-38-45-945Z-11744\frame-02-0-09.0.jpg"
OUR_BUILD = "records/shots/v2-01-build.png"
OUR_RUN = "records/shots/v2-03-run.png"
OUT = "docs/visual-diff.png"

W = 700
GAP = 14
LABEL_H = 30


def fit(path):
    im = Image.open(path).convert("RGB")
    h = int(im.height * W / im.width)
    return im.resize((W, h), Image.LANCZOS)


def font(size):
    for name in ("msyh.ttc", "msyhbd.ttc", "simhei.ttf"):
        try:
            return ImageFont.truetype("C:/Windows/Fonts/" + name, size)
        except Exception:
            continue
    return ImageFont.load_default()


rows = [
    ("参考视频（BV1ayKTemEEb）建造界面", REF_BUILD, "我们的 HTML 演示 · 建造界面", OUR_BUILD),
    ("参考视频 · 行驶界面", REF_RUN, "我们的 HTML 演示 · 行驶界面", OUR_RUN),
]

tiles = []
for left_label, left_path, right_label, right_path in rows:
    tiles.append((left_label, fit(left_path), right_label, fit(right_path)))

cell_h = max(t[1].height for t in tiles)
canvas = Image.new("RGB", (W * 2 + GAP * 3, (cell_h + LABEL_H) * 2 + GAP * 3), (18, 24, 30))
dr = ImageDraw.Draw(canvas)
f = font(17)
for i, (ll, li, rl, ri) in enumerate(tiles):
    y = GAP + i * (cell_h + LABEL_H + GAP)
    dr.text((GAP, y), ll, fill=(255, 214, 120), font=f)
    dr.text((GAP * 2 + W, y), rl, fill=(150, 225, 140), font=f)
    canvas.paste(li, (GAP, y + LABEL_H))
    canvas.paste(ri, (GAP * 2 + W, y + LABEL_H))
    dr.rectangle([GAP, y + LABEL_H, GAP + W, y + LABEL_H + li.height], outline=(70, 80, 90))
    dr.rectangle([GAP * 2 + W, y + LABEL_H, GAP * 2 + W * 2, y + LABEL_H + ri.height], outline=(70, 80, 90))

pathlib.Path(OUT).parent.mkdir(parents=True, exist_ok=True)
canvas.save(OUT, quality=92)
print("written", OUT, canvas.size)
