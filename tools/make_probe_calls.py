"""进一步定位：统计每帧的绘制调用数量。

关键嫌疑：
1. 石头纹理 —— 每帧重建 ~400 个多边形（每个 7~10 条边 + 渐变）
2. 丛林 —— 三层，每层 ~30 个圆 + 叶尖
3. 小碎石 —— 每帧按 pts 遍历
"""
import pathlib

p = pathlib.Path("tools/probe_drawcalls.py")
p.write_text(r'''import pathlib, subprocess, sys

JS = r"""
// 在 Node 里模拟统计"每帧大约画多少个图元"
const fs=require('fs');
const html=fs.readFileSync('prototype/index.html','utf8');

// 石头：colsN * rowsN
const m1 = html.match(/const stoneW = ([\d.]+) \* cam\.zoom, stoneH = ([\d.]+) \* cam\.zoom/);
const stoneW = parseFloat(m1[1]), stoneH = parseFloat(m1[2]);
// VIEW_W 1280、zoom 1.5（行驶时）
const zoom = 1.5;
const colsN = Math.ceil(1280 / (stoneW*zoom)) + 4;
const rowsN = Math.ceil((720+200) / (stoneH*zoom)) + 4;
const stones = colsN * rowsN;
// 每块石头：1 主体 + 1 渐变 + 1 描边 + 1 受光弧 ≈ 4~6 次调用
console.log('石头：', colsN, 'x', rowsN, '=', stones, '块 × 约 5 次调用 =', stones*5, '次');

// 小碎石
const pebbles = Math.floor(1280/5*0.3);   // pts 长度 ~ 1280/5，30% 概率
console.log('小碎石：约', pebbles, '个 × 2 次 =', pebbles*2, '次');

// 丛林三层
const canopyCols = 3 * (Math.ceil(1280/(42*1.5))+4);
console.log('丛林：3 层 × 约', Math.ceil(1280/(42*1.5))+4, '个圆 =', canopyCols*2, '次（含叶尖更多）');

// 远山
console.log('远山：约', Math.ceil(1280/190)+3, '个三角形');

// 合计
const total = stones*5 + pebbles*2 + canopyCols*2 + 20;
console.log('');
console.log('每帧估计绘制调用总数 ≈', total, '次');
console.log('60fps 下每秒 ≈', total*60, '次');
"""

p = pathlib.Path("probe_drawcalls.js")
p.write_text(JS, encoding="utf-8")
out = subprocess.run(["node", str(p)], capture_output=True, text=True, encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
print(out.stdout or out.stderr)
p.unlink()
''', encoding="utf-8")
print("written")
