"""量化验证"车体更硬"：落地后角速度多久归零。"""
import pathlib

p = pathlib.Path("tools/probe_stiff.py")
p.write_text(r'''import json, pathlib, subprocess, sys

JS = r"""
const fs=require('fs');
const src=fs.readFileSync('prototype/game.js','utf8');
const mod={exports:{}}; new Function('module','exports',src)(mod,mod.exports);
const RAP=mod.exports;
const lv=JSON.parse(fs.readFileSync('levels/01.json','utf8'));

function settle(){
  RAP.resetParams();
  const b=RAP.newBuild(); RAP.applySpec(lv,b,RAP.SPECS['1-1']);
  const st=RAP.createRun(lv,b);
  // 给一个明显的前倾角速度，模拟落地
  st.car.a = -0.5; st.car.w = 3.0; st.car.vx = 2;
  const series=[];
  for (let i=0;i<90;i++){ RAP.step(st,1/60); if(i%6===0) series.push(+st.car.w.toFixed(3)); }
  return series;
}
const s = settle();
console.log('落地后角速度序列（每 0.1s）:', s.join(' '));
const idx = s.findIndex(v => Math.abs(v) < 0.3);
console.log('角速度降到 0.3 以下用了:', idx >= 0 ? (idx*0.1).toFixed(1)+'s' : '未在 1.5s 内');
"""

p = pathlib.Path("probe_stiff.js")
p.write_text(JS, encoding="utf-8")
out = subprocess.run(["node", str(p)], capture_output=True, text=True, encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
print(out.stdout or out.stderr)
p.unlink()
''', encoding="utf-8")
print("written")
