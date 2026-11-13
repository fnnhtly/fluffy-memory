"""上一次测错了：车其实滑到终点关卡就结束了，不是"一直在滑"。
这次把终点判断绕开，纯粹测摩擦减速度。
"""
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
  st.level = Object.assign({}, lv, {goal:{col:9999,row:0}, boxes:[]});   // 去掉终点，纯测滑行
  st.boxes = [];
  st.car.x=20; st.car.y=st.startY; st.car.vx=5; st.car.vy=0; st.car.a=0; st.car.w=0;
  let x0=st.car.x, t=0;
  const v0=Math.hypot(st.car.vx,st.car.vy);
  while(t<12 && Math.hypot(st.car.vx,st.car.vy)>0.3){ RAP.step(st,1/60); t+=1/60; }
  const v1=Math.hypot(st.car.vx,st.car.vy);
  return { dist:+(st.car.x-x0).toFixed(1), t:+t.toFixed(2), decel:+(((v0*v0-v1*v1)/(2*Math.max(0.01,st.car.x-x0)))).toFixed(2) };
}
for (const m of [1, 1.5, 2, 3, 5]) {
  const r = coast(m);
  console.log('groundGrip=' + m + '\t滑行 ' + r.dist + ' m\t' + r.t + ' s\t等效减速度 ' + r.decel + ' m/s²');
}
RAP.resetParams();
"""

p = pathlib.Path("probe_coast2.js")
p.write_text(JS, encoding="utf-8")
out = subprocess.run(["node", str(p)], capture_output=True, text=True, encoding="utf-8")
print(out.stdout or out.stderr)
p.unlink()
