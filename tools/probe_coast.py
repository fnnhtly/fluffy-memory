"""正确测量：用 createRun 的出生高度（轮子刚好贴地），再给初速度，比较不同 groundGrip 的滑行距离。"""
import json
import pathlib
import subprocess

JS = r"""
const fs=require('fs');
const src=fs.readFileSync('prototype/game.js','utf8');
const mod={exports:{}}; new Function('module','exports',src)(mod,mod.exports);
const RAP=mod.exports;
const lv=JSON.parse(fs.readFileSync('levels/03.json','utf8'));
function coast(mult){
  RAP.resetParams({groundGrip: mult});
  const b=RAP.newBuild(); RAP.applySpec(lv,b,RAP.SPECS['1-3']);
  const st=RAP.createRun(lv,b);
  st.car.x=30; st.car.y=st.startY; st.car.vx=5; st.car.vy=0; st.car.a=0; st.car.w=0;
  const x0=st.car.x; let t=0;
  while(t<15 && Math.hypot(st.car.vx,st.car.vy)>0.25){ RAP.step(st,1/60); t+=1/60; }
  return [ +(st.car.x-x0).toFixed(1), +t.toFixed(2) ];
}
for (const m of [1, 2, 4, 8]) {
  const r = coast(m);
  console.log('groundGrip=' + m + ' → 滑行 ' + r[0] + ' m / ' + r[1] + ' s');
}
RAP.resetParams();
"""

p = pathlib.Path("probe_coast.js")
p.write_text(JS, encoding="utf-8")
out = subprocess.run(["node", str(p)], capture_output=True, text=True, encoding="utf-8")
print(out.stdout or out.stderr)
p.unlink()
