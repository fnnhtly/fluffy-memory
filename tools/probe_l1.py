import json
import pathlib
import subprocess
import sys

JS = r"""
const fs=require('fs');
const src=fs.readFileSync('prototype/game.js','utf8');
const mod={exports:{}}; new Function('module','exports',src)(mod,mod.exports);
const RAP=mod.exports;
const lv = JSON.parse(fs.readFileSync('levels/01.json','utf8'));

RAP.resetParams();
const b=RAP.newBuild(); RAP.applySpec(lv,b,RAP.SPECS['1-1']);
const st=RAP.createRun(lv,b);
console.log('startY', st.startY.toFixed(2), 'surfaceY@1.5', st.terrain.surfaceY(1.5).toFixed(2));
for (let i=0;i<180;i++){
  RAP.step(st,1/60);
  if (i%15===0) console.log('t='+(i/60).toFixed(2)+' x='+st.car.x.toFixed(2)+' y='+st.car.y.toFixed(2)+
    ' vx='+st.car.vx.toFixed(2)+' vy='+st.car.vy.toFixed(2)+' a='+st.car.a.toFixed(2)+
    ' gap='+(st.car.y-st.terrain.surfaceY(st.car.x)).toFixed(2)+' phase='+st.phase+' fail='+st.failReason);
}
RAP.resetParams();
"""

p = pathlib.Path("probe_l1.js")
p.write_text(JS, encoding="utf-8")
out = subprocess.run(["node", str(p)], capture_output=True, text=True, encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
print(out.stdout or out.stderr)
p.unlink()
