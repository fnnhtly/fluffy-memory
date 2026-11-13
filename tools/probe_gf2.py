import json
import pathlib
import subprocess
import sys

JS = r"""
const fs=require('fs');
const src=fs.readFileSync('prototype/game.js','utf8');
const mod={exports:{}}; new Function('module','exports',src)(mod,mod.exports);
const RAP=mod.exports;
const lv = JSON.parse(fs.readFileSync('levels/01.json','utf8'));   // 1-1 没有马达

function coast(gf){
  RAP.resetParams({groundFriction: gf});
  const b=RAP.newBuild(); RAP.applySpec(lv,b,RAP.SPECS['1-1']);
  const st=RAP.createRun(lv,b);
  st.level = Object.assign({}, lv, {goal:{col:9999,row:0}});
  st.boxes = [];
  st.car.x=12; st.car.y=st.terrain.surfaceY(12)+0.7; st.car.vx=5; st.car.vy=0;
  const x0=st.car.x; let t=0;
  while(t<12 && Math.hypot(st.car.vx,st.car.vy)>0.3){ RAP.step(st,1/60); t+=1/60; }
  return [+(st.car.x-x0).toFixed(1), +t.toFixed(2)];
}

function levelPass(gf){
  RAP.resetParams({groundFriction: gf});
  const lvs = ['01','02','03','04','05'].map(n => JSON.parse(fs.readFileSync('levels/'+n+'.json','utf8')));
  const specs = ['1-1','1-2','1-3','1-4i','1-5n'];
  return lvs.map((l,i) => RAP.simulate(l, RAP.SPECS[specs[i]], {maxTime:70}).result === 'win' ? '1' : '0').join('');
}

for (const gf of [0, 2, 4, 6, 8]) {
  const c = coast(gf);
  console.log('groundFriction=' + gf + '\t5m/s coast ' + c[0] + ' m / ' + c[1] + ' s\tlevels ' + levelPass(gf));
}
RAP.resetParams();
"""

p = pathlib.Path("probe_gf2.js")
p.write_text(JS, encoding="utf-8")
out = subprocess.run(["node", str(p)], capture_output=True, text=True, encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
print(out.stdout or out.stderr)
p.unlink()
