const fs=require('fs');
const src=fs.readFileSync('prototype/game.js','utf8');
const mod={exports:{}}; new Function('module','exports',src)(mod,mod.exports);
const RAP=mod.exports;

const SPECS = { '1-1':'1-1','1-2':'1-2','1-3':'1-3','1-4':'1-4i','1-5':'1-5n' };
for (const [lid, spec] of Object.entries(SPECS)) {
  const n = lid.split('-')[1];
  const lv = JSON.parse(fs.readFileSync('levels/0'+n+'.json','utf8'));
  RAP.resetParams();
  const collect = [];
  RAP.Params.collectContacts = collect;
  const b = RAP.newBuild(); RAP.applySpec(lv, b, RAP.SPECS[spec]);
  const st = RAP.createRun(lv, b);
  let k = 0;
  while (st.phase === 'run' && k < 60 * 40) { RAP.step(st, 1/60); k++; }
  const all = collect.filter(v => v > 0.3);
  const buckets = { '0-1':0, '1-3':0, '3-6':0, '6-10':0, '10+':0 };
  for (const v of all) {
    if (v < 1) buckets['0-1']++;
    else if (v < 3) buckets['1-3']++;
    else if (v < 6) buckets['3-6']++;
    else if (v < 10) buckets['6-10']++;
    else buckets['10+']++;
  }
  const maxV = all.length ? Math.max(...all) : 0;
  console.log(lid, (st.result||st.failReason).padEnd(7),
    '| 接触帧', String(all.length).padEnd(5),
    '| 分布', JSON.stringify(buckets),
    '| 最大 vn', maxV.toFixed(1));
}
console.log('');
console.log('说明：vn 是接触法向速度（m/s）。impact 事件阈值 = 6。');
