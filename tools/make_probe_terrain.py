"""结论性验证：地形平滑会把 1 格台阶"抹平"，所以 1 格台阶永远不可能触发撞击。

测试：直接看 makeTerrain 后 col14 附近的高度场，确认台阶是否还存在。
"""
import pathlib

p = pathlib.Path("tools/probe_terrain.py")
p.write_text(r'''import pathlib, subprocess, sys

JS = r"""
const fs=require('fs');
const src=fs.readFileSync('prototype/game.js','utf8');
const mod={exports:{}}; new Function('module','exports',src)(mod,mod.exports);
const RAP=mod.exports;
const lv=JSON.parse(fs.readFileSync('levels/01.json','utf8'));
const ter=RAP.makeTerrain(lv);
console.log('col  原始地表行  高度场  斜率');
for (let c=11;c<22;c++){
  const hf = ter.heightField ? ter.heightField[c] : null;
  console.log(String(c).padEnd(5) + String(ter.topRow ? ter.topRow[c] : '?').padEnd(12) +
    (hf!==null ? hf.toFixed(2).padEnd(8) : '?'.padEnd(8)) +
    (ter.surfaceSlope ? ter.surfaceSlope(c).toFixed(3) : '?'));
}
console.log('');
console.log('heightField 存在 =', !!ter.heightField, '| surfaceSlope 存在 =', !!ter.surfaceSlope);
"""

p = pathlib.Path("probe_terrain.js")
p.write_text(JS, encoding="utf-8")
out = subprocess.run(["node", str(p)], capture_output=True, text=True, encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
print(out.stdout or out.stderr)
p.unlink()
''', encoding="utf-8")
print("written")
