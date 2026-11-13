import pathlib, subprocess, sys

JS = r"""
const fs=require('fs');
const src=fs.readFileSync('prototype/game.js','utf8');
const mod={exports:{}}; new Function('module','exports',src)(mod,mod.exports);
const RAP=mod.exports;
const base=JSON.parse(fs.readFileSync('levels/01.json','utf8'));

// 在 col 15..16 放不同高度的硬台阶，并给不同初速度，看哪种组合触发 impact
function test(stepH, startVx){
  const lv = JSON.parse(JSON.stringify(base));
  const rows = lv.mapRows.map(r=>r.split(''));
  const ROWS = rows.length;
  for (let c=15;c<17;c++){
    for (let r=0;r<ROWS;r++) rows[r][c]='.';
    for (let r=8-stepH;r<ROWS;r++) rows[r][c]='#';
  }
  for (let c=17;c<26;c++){
    for (let r=0;r<ROWS;r++) rows[r][c]='.';
    for (let r=8;r<ROWS;r++) rows[r][c]='#';
  }
  lv.mapRows = rows.map(r=>r.join(''));
  if (stepH > 0) lv.hardCols = [15,16];

  RAP.resetParams();
  const b=RAP.newBuild(); RAP.applySpec(lv,b,RAP.SPECS['1-1']);
  const st=RAP.createRun(lv,b);
  st.car.vx = startVx;
  let n=0;
  while(st.phase==='run' && n<60*25){ RAP.step(st,1/60); n++; }
  const imp = st.events.filter(e=>e.indexOf('impact')>=0);
  const mx = imp.length ? Math.max(...imp.map(e=>parseFloat((e.match(/v=([\d.]+)/)||[0,0])[1]))) : 0;
  return { r: st.result||st.failReason, x:+st.car.x.toFixed(1), n:imp.length, maxV:mx };
}
console.log('台阶高  初速度   结果       x       impacts  最大法向速度');
for (const h of [1, 2]) {
  for (const v of [3, 6, 9]) {
    const t = test(h, v);
    console.log(String(h).padEnd(8) + String(v).padEnd(9) + t.r.padEnd(10) +
      String(t.x).padEnd(8) + String(t.n).padEnd(9) + t.maxV);
  }
}
"""

p = pathlib.Path("probe_calc.js")
p.write_text(JS, encoding="utf-8")
out = subprocess.run(["node", str(p)], capture_output=True, text=True, encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
print(out.stdout or out.stderr)
p.unlink()
