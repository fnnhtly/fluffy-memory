"""验证"撞击演出是否可达"：用最极端的方式制造撞击。

思路：直接把车从高处扔下来（改 createRun 后的 y 值），必然触发落地撞击。
这样可以确认：演出代码本身是好的，只是关卡里没有触发机会。
"""
import pathlib

p = pathlib.Path("tools/probe_impact_reach.py")
p.write_text(r'''import pathlib, subprocess, sys

JS = r"""
const fs=require('fs');
const src=fs.readFileSync('prototype/game.js','utf8');
const mod={exports:{}}; new Function('module','exports',src)(mod,mod.exports);
const RAP=mod.exports;
const lv=JSON.parse(fs.readFileSync('levels/03.json','utf8'));

function dropFrom(height){
  RAP.resetParams();
  const b=RAP.newBuild(); RAP.applySpec(lv,b,RAP.SPECS['1-3']);
  const st=RAP.createRun(lv,b);
  st.car.y += height;        // 抬高 → 自由落体
  const evs=[];
  for (let i=0;i<240;i++){
    RAP.step(st,1/60);
    st.events.forEach(e=>{ if(e.indexOf('impact')>=0 && evs.indexOf(e)<0) evs.push(e); });
  }
  return evs;
}
for (const h of [0.5, 1, 2, 4, 8]) {
  const evs = dropFrom(h);
  console.log('抬高 ' + h + ' m → impact 事件: ' + (evs.length ? evs.slice(0,3).join(' | ') : '无'));
}
"""

p = pathlib.Path("probe_impact.js")
p.write_text(JS, encoding="utf-8")
out = subprocess.run(["node", str(p)], capture_output=True, text=True, encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
print(out.stdout or out.stderr)
p.unlink()
''', encoding="utf-8")
print("written")
