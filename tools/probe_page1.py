"""取第二页探针：只抽 107280 以后与 108~112 段（看有没有场景/背景素材）。"""
import pathlib
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import make_image_probe as m  # noqa: E402

ids = []
for lo, hi in m.RANGES:
    if lo < 107280:
        continue
    stride = max(1, (hi - lo) // 12)
    for v in range(lo, hi + 1, stride):
        ids.append(v)
ids = ids[:70]
print("ids:", ids)
subprocess.run([sys.executable, "tools/make_image_probe.py", "1", "--ids", ",".join(map(str, ids))], check=True)
