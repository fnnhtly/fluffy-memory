import pathlib, subprocess, sys

JS = r"""
const fs=require('fs');
const src=fs.readFileSync('prototype/game.js','utf8');
const mod={exports:{}}; new Function('module',exports',src)(mod,mod.exports);
const RAP=mod.exports;
"""

# 上面那行故意写错，改用正确版本
JS = r"""
const fs=require('fs');
const src=fs.readFileSync('prototype/game.js','utf8');
const mod={exports:{}}; new Function('module','exports',src)(mod,mod.exports);
const RAP=mod.exports;
const base=JSON.parse(fs.readFileSync('levels/01.json','utf8'));

function test(bumpH, dropAfter){
  const lv = JSON.parse(JSON.stringify(base));
  const rows = lv.mapRows.map(r => r.split(''));
  const ROWS = rows.length;
  // col 14..16 抬 bumpH 格；之后 dropAfter 为真则每格降 1
  for (let c=14;c<17;c++){
    for (let r=0;r<ROWS;r++) rows[r][c]='.';
    const top = 8 - bumpH;
    for (let r=top;r<ROWS;r++) rows[r][c]='#';
  }
  if (dropAfter){
    for (let c=17;c<24;c++){
      for (let r=0;r<ROWS;r++) rows[r][c]='.';
      const top = Math.min(8, 8 - bumpH + (c-16));
      for (let r=top;r<ROWS;r++) rows[r][c]='#';
    }
  }
  lv.mapRows = rows.map(r=>r.join(''));
  const st = RAP.simulate(lv, RAP.SPECS['1-1'], {maxTime:30});
  const imp = st.events.filter(e=>e.indexOf('impact')>=0);
  return { r: st.result||st.failReason, x:+st.car.x.toFixed(1), n:imp.length };
}
console.log('方案                       结果       x      impact 次数');
for (const [h,d] of [[2,false],[2,true],[1,true]]) {
  const t = test(h,d);
  console.log((h+' 格台阶'+(d?'+后接下坡':'+后接平地')).padEnd(24) + t.r.padEnd(10) + String(t.x).padEnd(7) + t.n);
}
"""

p = pathlib.Path("probe_bump2.js")
p.write_text(JS, encoding="utf-8")
out = subprocess.run(["node", str(p)], capture_output=True, text=True, encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
print(out.stdout or out.stderr)
p.unlink()
