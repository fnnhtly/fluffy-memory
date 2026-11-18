/* 反向验证 test_drive_variety.js（第 97 轮，第三版 —— 最强变异）。
 *
 * ── 前两版为什么都拆不动 ──
 *
 *   ① 只改 1-2 的配色 → 仍然全绿。因为行驶期画面 = 配色 + **地形** + **镜头**，
 *      1-2 与 1-7 的长度/落差/zoom 本来就不同。
 *   ② 统一八关的 skyTop → 仍然全绿。因为天空只占上半屏，
 *      下半是岩石，而 rock 没改。
 *
 * ── 第三版：把**所有视觉层的颜色**统一 ──
 *
 * 用运行期手段做最强变异：把 `BIOMES` 里每个 biome 的
 * `rock / skyTop / skyMid / skyLow / hill / jungle / grass*` **全指向同一套**。
 * 那就等于八关共用一个 biome，只剩地形和镜头不同。
 *
 * 如果这样 A 还不红，那 A 就不是在量"配色可辨"——
 * 它是在量地形和镜头的差异，而那是 B/E 的职责。
 *
 * 做法：在页面里直接覆盖 BIOMES 的每个键（运行期，改完立刻量）。
 * 不走源码替换，因为源码里八个 biome 的文本各不相同，容易漏。
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SPEC_OF = require('./lib/specmap.js').SPEC_OF;

(async () => {
  const PORT = 9800 + Math.floor(Math.random() * 30);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'edgeRV97-' + Date.now()),
    '--window-size=1280,760', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    await sleep(250);
    try {
      const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl;
    } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map();
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) {
      const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
  };
  const send = (method, params) => new Promise((res, rej) => {
    const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(900);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value;
  };
  await ev('(()=>{const t=window.__rap.state; t.welcome=0; t.introT=1; return 1;})()');
  await sleep(300);

  const LEVELS = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8'];
  const GW = 16, GH = 8;

  /* 采一次八关行驶期平均色（和 test_drive_variety 同一套逻辑，精简版） */
  async function sampleAll() {
    const rows = [];
    for (let i = 0; i < LEVELS.length; i++) {
      const key = SPEC_OF[LEVELS[i]];
      await ev(`(()=>{const R=window.__rap, S=R.state;
        R.startLevel(${i}); S.welcome=0; S.introT=1; S.phase='build'; S.run=null;
        S.paused=false; S.helpOpen=false; S.levelSelect=false; S.hintOpen=false;
        const spec = R.RAP.SPECS[${JSON.stringify(key)}];
        R.RAP.applySpec(R.level(), S.build, spec);
        R.launch(); S.runBanner=0;
        const acts=[];
        ((spec._presses)||[]).forEach(a=>acts.push({t:a.t,k:a.k||'press'}));
        ((spec._seeds)||[]).forEach(a=>acts.push({t:a.t,k:'seed',kind:a.kind}));
        acts.sort((a,b)=>a.t-b.t);
        S.run.actScript=acts;
        const c0=R.level().start.col, c1=R.level().goal.col;
        const target=c0+(c1-c0)*0.4;
        let guard=0;
        while(S.run.phase==='run'&&S.run.car&&S.run.car.x<target&&guard++<60*40){
          const ps=S.run.actScript;
          while(ps.length&&ps[0].t<=S.run.time){
            const a=ps.shift();
            if(a.k==='seed') R.RAP.triggerSeed(S.run,a.kind);
            else R.RAP.pressInteract(S.run,a.n||1);
          }
          R.RAP.step(S.run,1/60);
        }
        S.__freezeRun=true; S.shake=0; S.flash=0; S.vignette=0;
        return 1;})()`);
      await sleep(900);
      const stat = JSON.parse(await ev(`(()=>{
        const R=window.__rap, S=R.state;
        const cv=document.getElementById('cv'), g=cv.getContext('2d');
        const v=window.__view, W=cv.width, H=cv.height;
        const d=g.getImageData(0,0,W,H).data;
        const k=W/v.W;
        const masks=[];
        const pr=R.runProgressRect(), tr=R.runTimeRects(), cr=R.runChallengeRect();
        masks.push(pr.panel,tr.timer,tr.box,tr.frame,cr);
        ['pause','restartRun','help','seed','interact'].forEach(nm=>{
          const r=R.btnRect(nm); if(r) masks.push(r);
        });
        masks.push({x:0,y:0,w:1280,h:60},{x:0,y:700,w:1280,h:20});
        const masked=(dx,dy)=>!masks.some(m=>dx>=m.x&&dx<m.x+m.w&&dy>=m.y&&dy<m.y+m.h);
        let r=0,gg=0,b=0,n=0;
        const acc=[];
        for(let gy=0;gy<${GH};gy++) for(let gx=0;gx<${GW};gx++) acc.push([0,0,0,0]);
        for(let y=0;y<H;y+=2) for(let x=0;x<W;x+=2){
          const dx=(x/k)+v.offX, dy=(y/k)+v.offY;
          if(dy<0||dy>=720) continue;
          if(!masked(dx,dy)) continue;
          const j=(y*W+x)*4;
          r+=d[j]; gg+=d[j+1]; b+=d[j+2]; n++;
          const gx=Math.min(${GW}-1,Math.floor(dx/1280*${GW}));
          const gy2=Math.min(${GH}-1,Math.floor(dy/720*${GH}));
          const a=acc[gy2*${GW}+gx];
          a[0]+=d[j]; a[1]+=d[j+1]; a[2]+=d[j+2]; a[3]++;
        }
        const sig=acc.map(a=>a[3]?[Math.round(a[0]/a[3]),Math.round(a[1]/a[3]),Math.round(a[2]/a[3])]:[0,0,0]);
        return JSON.stringify({avg:[Math.round(r/n),Math.round(gg/n),Math.round(b/n)],sig:sig});})()`));
      rows.push({ id: LEVELS[i], avg: stat.avg, sig: stat.sig });
      await ev('(()=>{const S=window.__rap.state; S.__freezeRun=false; S.phase="build"; S.run=null; return 1;})()');
    }
    return rows;
  }

  function summary(rows) {
    const avgDist = (a, b) => Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])+Math.abs(a[2]-b[2]);
    function sigDiff(a, b) {
      let sum = 0, cnt = 0;
      for (let i = 0; i < a.length; i++) {
        if (a[i][0]===0&&a[i][1]===0&&a[i][2]===0&&b[i][0]===0&&b[i][1]===0&&b[i][2]===0) continue;
        sum += Math.abs(a[i][0]-b[i][0])+Math.abs(a[i][1]-b[i][1])+Math.abs(a[i][2]-b[i][2]);
        cnt++;
      }
      return cnt ? sum/(cnt*765)*100 : 0;
    }
    let minAvg = 1e9, minSig = 1e9, pa = '', pb = '', sa = '', sb = '';
    for (let i = 0; i < rows.length; i++) for (let j = i+1; j < rows.length; j++) {
      const ad = avgDist(rows[i].avg, rows[j].avg);
      const sd = sigDiff(rows[i].sig, rows[j].sig);
      if (ad < minAvg) { minAvg = ad; pa = rows[i].id+'/'+rows[j].id; }
      if (sd < minSig) { minSig = sd; sa = rows[i].id+'/'+rows[j].id; }
    }
    return { minAvg, minSig, pa, sa };
  }

  const before = summary(await sampleAll());
  console.log('基线：平均色最小 ' + before.minAvg + '（' + before.pa +
    '）  签名最小 ' + before.minSig.toFixed(1) + '%（' + before.sa + '）');

  /* ── 最强变异：让所有 biome 指向同一套颜色（运行期覆盖） ── */
  const mutated = await ev(`(()=>{
    /* BIOMES 是模块内的常量，但每个 biome 对象是**可变**的 ——
     * 把所有 biome 的字段逐项覆盖成 field 的那一套。
     * 这是运行期手段，不需要改源码，也不会漏掉某个 biome。 */
    const src = window.__rap.BIOMES;
    if (!src) return 'no BIOMES export';
    const keys = Object.keys(src);
    const base = src.field;
    keys.forEach(k => {
      const b = src[k];
      b.rock = base.rock.slice();
      b.grass = base.grass; b.grass2 = base.grass2; b.grass3 = base.grass3;
      b.edge = base.edge;
      b.skyTop = base.skyTop; b.skyMid = base.skyMid; b.skyLow = base.skyLow;
      b.hill = base.hill;
      b.jungle = base.jungle.slice();
      b.dim = base.dim;
    });
    return 'ok:' + keys.length;})()`);
  console.log('变异:', mutated);

  if (String(mutated).startsWith('ok')) {
    const after = summary(await sampleAll());
    console.log('变异后：平均色最小 ' + after.minAvg + '（' + after.pa +
      '）  签名最小 ' + after.minSig.toFixed(1) + '%（' + after.sa + '）');
    const turned = after.minAvg < 18 || after.minSig < 6;
    console.log('');
    console.log(turned
      ? '✓ 统一全部配色后判据会红 —— 它量的是配色可辨'
      : '✗ 统一全部配色后判据仍绿 —— 它量的其实是地形/镜头，不是配色');
    process.exit(turned ? 0 : 1);
  } else {
    console.log('⚠ BIOMES 没有导出，改用源码替换（本轮不实施）');
    process.exit(1);
  }

  try { ws.close(); } catch (e) {}
  try { require('./lib/asserts.js').killTree(child); } catch (e) {}
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });
