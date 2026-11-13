"""统计每关实际发生的接触法向速度分布（不是 impact 事件，而是所有接触）。

目的：看看"普通行驶/落地"时 vn 到底是多少，从而设计分级反馈：
- vn 3~6：轻微落地 → 小尘土 + 轻微音效（无震屏）
- vn 6~10：中度撞击 → 震屏 + 碎片（现有 impact）
- vn > 10：重摔 → 慢动作 + 红暗角
"""
import pathlib

p = pathlib.Path("tools/probe_contacts.js")
p.write_text(r"""const fs=require('fs');
const src=fs.readFileSync('prototype/game.js','utf8');
const mod={exports:{}}; new Function('module','exports',src)(mod,mod.exports);
const RAP=mod.exports;

const SPECS = { '1-1':'1-1','1-2':'1-2','1-3':'1-3','1-4':'1-4i','1-5':'1-5n' };
for (const [lid, spec] of Object.entries(SPECS)) {
  const n = lid.split('-')[1];
  const lv = JSON.parse(fs.readFileSync('levels/0'+n+'.json','utf8'));
  // 直接跑，但手动收集每个子步的 vn（用包装 step 不方便，改成跑完读 events + 采样速度）
  const b = RAP.newBuild(); RAP.applySpec(lv, b, RAP.SPECS[spec]);
  const st = RAP.createRun(lv, b);
  let n2 = 0;
  const vnSamples = [];
  let prevVy = 0;
  while (st.phase === 'run' && n2 < 60 * 40) {
    prevVy = st.car.vy;
    RAP.step(st, 1/60); n2++;
    // 竖直速度突变 = 发生接触
    const dv = st.car.vy - prevVy;
    if (dv > 0.8) vnSamples.push(+(-Math.min(0, prevVy)).toFixed(1));
  }
  const imp = st.events.filter(e => e.indexOf('impact') >= 0);
  const vns = vnSamples.filter(v => v > 0.5);
  console.log(lid, (st.result || st.failReason).padEnd(7),
    '| 落地次数', String(vns.length).padEnd(3),
    '| vn 分布', vns.length ? vns.slice(0, 10).join(',') : '-',
    '| impact 事件', imp.length);
}
""", encoding="utf-8")
print("written")
