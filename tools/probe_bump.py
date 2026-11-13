import pathlib, subprocess, sys

JS = r"""
const fs=require('fs');
const src=fs.readFileSync('prototype/game.js','utf8');
const mod={exports:{}}; new Function('module','exports',src)(mod,mod.exports);
const RAP=mod.exports;
const base=JSON.parse(fs.readFileSync('levels/01.json','utf8'));

function test(h){
  // 复制 1-1，把 col 14..15 的台阶改成 h 格高
  const lv = JSON.parse(JSON.stringify(base));
  const rows = lv.mapRows.map(r => r.split(''));
  for (let c=14;c<16;c++){
    for (let r=0;r<rows.length;r++) rows[r][c] = '.';
    for (let r=8-h;r<rows.length;r++) rows[r][c] = '#';
  }
  lv.mapRows = rows.map(r=>r.join(''));
  const st = RAP.simulate(lv, RAP.SPECS['1-1'], {maxTime:30});
  const imp = st.events.filter(e=>e.indexOf('impact')>=0);
  const maxV = imp.length ? Math.max(...imp.map(e=>parseFloat((e.match(/v=([\d.]+)/)||[0,0])[1]))) : 0;
  return { r: st.result||st.failReason, x: +st.car.x.toFixed(1), n: imp.length, maxV };
}
for (const h of [1,2,3]) {
  const t = test(h);
  console.log(h + ' 格台阶 → ' + t.r + ' x=' + t.x + ' impacts=' + t.n + ' 最大法向速度=' + t.maxV);
}
"""

p = pathlib.Path("probe_bump.js")
p.write_text(JS, encoding="utf-8")
out = subprocess.run(["node", str(p)], capture_output=True, text=True, encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
print(out.stdout or out.stderr)
p.unlink()
