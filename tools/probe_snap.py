"""检查"吸附高亮"里的探测是否污染建造数据（tryPlace 会真的写入）。"""
import json
import pathlib
import subprocess
import sys

JS = r"""
const fs=require('fs');
const src=fs.readFileSync('prototype/game.js','utf8');
const mod={exports:{}}; new Function('module','exports',src)(mod,mod.exports);
const RAP=mod.exports;
const lv=JSON.parse(fs.readFileSync('levels/01.json','utf8'));
const b=RAP.newBuild();
RAP.tryPlace(lv,b,'wood_frame',4,1);
// 模拟探测：在空格尝试放木头，然后撤回
function probe(build, part, r, c){
  const res = RAP.tryPlace(lv, build, part, r, c);
  if (res.ok && !res.rotated) {
    const kk = r+','+c;
    if (build.cells[kk] && build.cells[kk].part === part) {
      if (build.cells[kk].inner) build.cells[kk].inner = null;
      else delete build.cells[kk];
      const oi = build.order.lastIndexOf('inner:'+kk); if (oi>=0) build.order.splice(oi,1);
      const oj = build.order.lastIndexOf(kk); if (oj>=0) build.order.splice(oj,1);
    }
  }
  return res;
}
for (let i=0;i<20;i++) probe(b, 'wood_frame', 3, 1);
console.log('cells after 20 probes:', JSON.stringify(b.cells));
console.log('order after 20 probes:', JSON.stringify(b.order));
console.log('budgetLeft wood_frame:', RAP.budgetLeft(lv, 'wood_frame', b));
"""

p = pathlib.Path("probe_snap.js")
p.write_text(JS, encoding="utf-8")
out = subprocess.run(["node", str(p)], capture_output=True, text=True, encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
print(out.stdout or out.stderr)
p.unlink()
