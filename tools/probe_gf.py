"""扫一遍 groundFriction，找出"五关仍可解"和"手感够粘"的平衡点。"""
import json
import pathlib
import subprocess

JS = r"""
const fs=require('fs');
const src=fs.readFileSync('prototype/game.js','utf8');
const mod={exports:{}}; new Function('module','exports',src)(mod,mod.exports);
const RAP=mod.exports;
const levels = ['01','02','03','04','05'].map(n => JSON.parse(fs.readFileSync('levels/'+n+'.json','utf8')));
const specs = ['1-1','1-2','1-3','1-4i','1-5n'];

function coast(gf){
  RAP.resetParams({groundFriction: gf});
  const lv = levels[2];
  const b=RAP.newBuild(); RAP.applySpec(lv,b,RAP.SPECS['1-3']);
  const st=RAP.createRun(lv,b);
  st.level = Object.assign({}, lv, {goal:{col:9999,row:0}});
  st.boxes = [];
  st.car.x=20; st.car.y=st.startY; st.car.vx=5;
  let t=0;
  while(t<12 && Math.hypot(st.car.vx,st.car.vy)>0.3){ RAP.step(st,1/60); t+=1/60; }
  return +(st.car.x-20).toFixed(1);
}

function levelPass(gf){
  RAP.resetParams({groundFriction: gf});
  return levels.map((lv,i) => {
    const st = RAP.simulate(lv, RAP.SPECS[specs[i]], {maxTime:70});
    return st.result === 'win' ? 1 : 0;
  });
}

for (const gf of [0.0, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0]) {
  const p = levelPass(gf);
  console.log('groundFriction=' + gf + '\t5m/s 滑行 ' + coast(gf) + ' m\t关卡 ' + p.join(''));
}
RAP.resetParams();
"""

p = pathlib.Path("probe_gf.js")
p.write_text(JS, encoding="utf-8")
out = subprocess.run(["node", str(p)], capture_output=True, text=True, encoding="utf-8")
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
print(out.stdout or out.stderr)
p.unlink()
