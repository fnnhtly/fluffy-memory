import json
import pathlib
import subprocess
import sys

JS = r"""
const fs=require('fs');
const src=fs.readFileSync('prototype/game.js','utf8');
const mod={exports:{}}; new Function('module','exports',src)(mod,mod.exports);
const RAP=mod.exports;
const lv = JSON.parse(fs.readFileSync('levels/03.json','utf8'));

function trace(gf){
  RAP.resetParams({groundFriction: gf});
  const b=RAP.newBuild(); RAP.applySpec(lv,b,RAP.SPECS['1-3']);
  const st=RAP.createRun(lv,b);
  st.level = Object.assign({}, lv, {goal:{col:9999,row:0}});
  st.boxes = [];
  st.car.x=20; st.car.y=st.startY; st.car.vx=5;
  const out=[];
  for (let i=0;i<180;i++){
    RAP.step(st,1/60);
    if (i%30===0) out.push('t'+ (i/60).toFixed(1) + ' vx=' + st.car.vx.toFixed(2));
  }
  return out.join(' ');
}
console.log('gf=0  : ' + trace(0));
console.log('gf=4  : ' + trace(4));
console.log('gf=20 : ' + trace(20));
RAP.resetParams();
"""

p = pathlib.Path("probe_trace.js")
p.write_text(JS, encoding="utf-8")
out = subprocess.run(["node", str(p)], capture_output=True, text=True, encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
print(out.stdout or out.stderr)
p.unlink()
