import json, pathlib, subprocess, sys

JS = r"""
const fs=require('fs');
const src=fs.readFileSync('prototype/game.js','utf8');
const mod={exports:{}}; new Function('module','exports',src)(mod,mod.exports);
const RAP=mod.exports;
const lv=JSON.parse(fs.readFileSync('levels/03.json','utf8'));

RAP.resetParams();
const b=RAP.newBuild(); RAP.applySpec(lv,b,RAP.SPECS['1-3']);
const st=RAP.createRun(lv,b);
const out=[];
for (let i=0;i<180;i++){
  RAP.step(st,1/60);
  if (i%20===0){
    const odo = st.car.odo || 0;
    const spinRad = odo / 0.5;
    const deg = spinRad * 180 / Math.PI;
    out.push({t:+(st.time).toFixed(2), vx:+st.car.vx.toFixed(1), odo:+odo.toFixed(1),
      deg:+(deg % 360).toFixed(1)});
  }
}
console.log('t     vx    odo   轮子累计角度(360取模)');
for (const r of out) console.log(String(r.t).padEnd(6) + String(r.vx).padEnd(6) + String(r.odo).padEnd(7) + r.deg);
// 频闪检测：每帧转角是否接近 60 的倍数（6 根辐条）
const fps = 60;
const degPerFrame = (12 * fps) / 0.5 * 180 / Math.PI;   // 12 m/s 时
const mod60 = degPerFrame % 60;
console.log('');
console.log('12 m/s 时每帧转角 =', degPerFrame.toFixed(1), '度；对 60 度取模 =', mod60.toFixed(1));
console.log(mod60 < 8 || mod60 > 52 ? '⚠ 有频闪风险（辐条看起来不动）' : '✓ 无频闪');
"""

p = pathlib.Path("probe_spin.js")
p.write_text(JS, encoding="utf-8")
out = subprocess.run(["node", str(p)], capture_output=True, text=True, encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
print(out.stdout or out.stderr)
p.unlink()
