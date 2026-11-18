/* 八关**行驶期**的可辨识度（第 97 轮）。
 *
 * ── 接上一轮 ──
 *
 * 第 96 轮量了建造页（遮掉 UI 之后）—— 八关两两可辨。
 * 但玩家真正盯着看的是**行驶期**：地形起伏、障碍、终点旗、背景山。
 * 这一轮按同一套方法量行驶画面。
 *
 * ── 另外还量一样建造页量不到的东西 ──
 *
 * **地形剖面**。建造页的"可辨"很大程度上是配色，而两关可能
 * "配色不同、地形一样"。这一条把 `surfaceY` 沿 [起点..终点] 归一化采样，
 * 两两比形状。
 *
 * ⚠ 这里有个必须诚实对待的地方：**形状相同不等于关卡相同**。
 * 1-6 与 1-8 的归一化剖面差只有 0.048（都是"平地起跑 → 结尾上坡"），
 * 但它们的绝对高度是 3.8~7.5 与 16.0~19.9，而且玩法一个是浮力、一个是风场。
 * 所以剖面这一条**不设"必须不同"的硬门槛**，只记录并报告最像的一对 ——
 * 强行要求八关地形形状两两不同，会逼着去改关卡设计，那是本末倒置。
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const OUT = path.join(ROOT, 'records', 'shots');
const SPEC_OF = require('./lib/specmap.js').SPEC_OF;

let pass = 0, fail = 0;
const lines = [];
function chk(label, cond, extra) {
  if (cond) { pass++; lines.push('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; lines.push('✗ ' + label + '  ' + (extra || '')); }
}

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const PORT = 9760 + Math.floor(Math.random() * 40);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'edgeDrv97-' + Date.now()),
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
  const errs = [];
  ws.addEventListener('message', e2 => {
    try {
      const m = JSON.parse(e2.data);
      if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text);
    } catch (e) {}
  });
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value;
  };
  const shot = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(s.data, 'base64'));
  };
  await ev('(()=>{const t=window.__rap.state; t.welcome=0; t.introT=1; return 1;})()');
  await sleep(300);

  const LEVELS = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8'];

  /* 行驶期要遮掉的 UI（和建造页不同：这边是 HUD 三块 + 左上两钮 +
   * 交互键 + 种子键 + 右上帮助）。都从页面自己的几何函数读，不写死。 */
  const GW = 16, GH = 8;

  /* ───────── A 地形剖面（纯 Node 算，不需要浏览器） ───────── */
  const profs = JSON.parse(await ev(`(()=>{const R=window.__rap;
    const N=24;
    return JSON.stringify(R.levels.map(L=>{
      const t=R.RAP.makeTerrain(L);
      const c0=L.start.col, c1=L.goal.col;
      const raw=[];
      for(let k=0;k<N;k++){ raw.push(t.surfaceY(c0+(c1-c0)*k/(N-1)+0.5)); }
      const lo=Math.min(...raw), hi=Math.max(...raw);
      const span=Math.max(0.001, hi-lo);
      return { id:L.levelId, raw:raw.map(y=>+y.toFixed(2)),
        norm: raw.map(y=>+((y-lo)/span).toFixed(3)),
        drop:+(hi-lo).toFixed(2), cols:c1-c0 };
    }));})()`));

  console.log('=== 地形剖面（起点→终点，24 采样点归一化）===');
  profs.forEach(p => console.log('  ' + p.id + '  落差 ' + p.drop +
    'm  水平 ' + p.cols + ' 格  ' + p.norm.slice(0, 8).map(x => x.toFixed(1)).join(' ')));

  const shapePairs = [];
  for (let i = 0; i < profs.length; i++) {
    for (let j = i + 1; j < profs.length; j++) {
      const a = profs[i].norm, b = profs[j].norm;
      let d = 0;
      for (let k = 0; k < a.length; k++) d += Math.abs(a[k] - b[k]);
      shapePairs.push({ a: profs[i].id, b: profs[j].id, d: d / a.length });
    }
  }
  shapePairs.sort((x, y) => x.d - y.d);
  const wShape = shapePairs[0];
  console.log('');
  console.log('剖面形状最像的一对：' + wShape.a + '/' + wShape.b +
    '  差 ' + wShape.d.toFixed(3));

  /* ───────── B 行驶期像素（遮掉 UI） ───────── */
  const rows = [];
  for (let i = 0; i < LEVELS.length; i++) {
    const key = SPEC_OF[LEVELS[i]];
    /* 跑到 40% 进度处。用 applySpec + launch + 手动 step 到那个位置，
     * 然后冻住物理，让画面定住（第 87 轮的 __freezeRun）。 */
    const got = JSON.parse(await ev(`(()=>{const R=window.__rap, S=R.state;
      R.startLevel(${i}); S.welcome=0; S.introT=1; S.phase='build'; S.run=null;
      S.paused=false; S.helpOpen=false; S.levelSelect=false; S.hintOpen=false;
      const spec = R.RAP.SPECS[${JSON.stringify(key)}];
      R.RAP.applySpec(R.level(), S.build, spec);
      R.launch(); S.runBanner=0;
      /* ⚠ 必须把运行期动作挂上（第 81/82/84/86/87/91/97 轮同一个病）。
       *
       * 手写 step 循环而不管 _seeds / _drops，1-5 就没按 F 触发雷种、
       * 车被屏障挡住停在 x=1.7（目标 10.6）—— 那量到的是"起跑线"，
       * 八关在起跑线上当然长得差不多。
       * 这里用和 launch() 完全相同的 actScript 口径。
       * （注意：这段在模板字符串内部，注释里不能出现反引号 —— 第十四次。） */
      const acts = [];
      ((spec._presses)||[]).forEach(a => acts.push({t:a.t, k:a.k||'press'}));
      ((spec._drops)||[]).forEach(a => { for(let k=0;k<(a.n||1);k++) acts.push({t:a.t+k*0.016,k:'drop'}); });
      ((spec._pops)||[]).forEach(a => { for(let k=0;k<(a.n||1);k++) acts.push({t:a.t+k*0.016,k:'pop'}); });
      ((spec._seeds)||[]).forEach(a => acts.push({t:a.t, k:'seed', kind:a.kind}));
      acts.sort((a,b)=>a.t-b.t);
      S.run.actScript = acts;
      /* 走到 40% 进度 */
      const c0 = R.level().start.col, c1 = R.level().goal.col;
      const target = c0 + (c1 - c0) * 0.4;
      let guard = 0;
      while (S.run.phase === 'run' && S.run.car && S.run.car.x < target && guard++ < 60*40) {
        /* 每帧先送到达时刻的动作 —— 和 frameBody 里那段同一个顺序 */
        const ps = S.run.actScript;
        while (ps.length && ps[0].t <= S.run.time) {
          const a = ps.shift();
          if (a.k === 'release') R.RAP.releaseInteract(S.run, a.n || 1);
          else if (a.k === 'drop') R.RAP.dropSandbag(S.run, a.n || 1);
          else if (a.k === 'pop') R.RAP.popBalloon(S.run, a.n || 1);
          else if (a.k === 'seed') R.RAP.triggerSeed(S.run, a.kind);
          else R.RAP.pressInteract(S.run, a.n || 1);
        }
        R.RAP.step(S.run, 1/60);
      }
      S.__freezeRun = true;      /* 冻住物理，画面才定得住 */
      S.shake = 0; S.flash = 0; S.vignette = 0;
      return JSON.stringify({ x: +(S.run.car.x).toFixed(1),
        target: +target.toFixed(1), phase: S.phase,
        acts: acts.length, guard: guard });})()`));
    /* 让镜头缓动收敛（冻住物理之后镜头仍会收敛到目标） */
    await sleep(900);

    const stat = JSON.parse(await ev(`(()=>{
      const R=window.__rap, S=R.state;
      const cv=document.getElementById('cv'), g=cv.getContext('2d');
      const v=window.__view, W=cv.width, H=cv.height;
      const d=g.getImageData(0,0,W,H).data;
      const k=W/v.W;
      /* UI 区从页面自己的几何函数读 */
      const masks=[];
      const pr=R.runProgressRect(), tr=R.runTimeRects(), cr=R.runChallengeRect();
      masks.push(pr.panel, tr.timer, tr.box, tr.frame, cr);
      ['pause','restartRun','help','seed','interact'].forEach(nm=>{
        const r = R.btnRect(nm); if (r) masks.push(r);
      });
      masks.push({x:0,y:0,w:1280,h:60});       /* 顶栏页签/静音那一行 */
      masks.push({x:0,y:700,w:1280,h:20});
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
        const gx=Math.min(${GW}-1, Math.floor(dx/1280*${GW}));
        const gy2=Math.min(${GH}-1, Math.floor(dy/720*${GH}));
        const a=acc[gy2*${GW}+gx];
        a[0]+=d[j]; a[1]+=d[j+1]; a[2]+=d[j+2]; a[3]++;
      }
      const sig=acc.map(a=>a[3]?[Math.round(a[0]/a[3]),Math.round(a[1]/a[3]),Math.round(a[2]/a[3])]:[0,0,0]);
      return JSON.stringify({ avg:[Math.round(r/n),Math.round(gg/n),Math.round(b/n)],
        n: n, sig: sig, zoom:+S.camLastDraw.zoom.toFixed(2) });})()`));

    rows.push({ id: LEVELS[i], avg: stat.avg, sig: stat.sig, got, zoom: stat.zoom });
    if (i === 0 || i === 3 || i === 7) {
      await ev('(()=>{const S=window.__rap.state; S.__freezeRun=false; return 1;})()');
      await sleep(200);
      await shot('drv97-' + LEVELS[i]);
      await ev('(()=>{const S=window.__rap.state; S.__freezeRun=true; return 1;})()');
    }
    /* 解冻，让下一关能重新装 */
    await ev('(()=>{const S=window.__rap.state; S.__freezeRun=false; S.phase="build"; S.run=null; return 1;})()');
  }

  function sigDiff(a, b) {
    let sum = 0, cnt = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i][0] === 0 && a[i][1] === 0 && a[i][2] === 0 &&
          b[i][0] === 0 && b[i][1] === 0 && b[i][2] === 0) continue;
      sum += Math.abs(a[i][0] - b[i][0]) + Math.abs(a[i][1] - b[i][1]) +
        Math.abs(a[i][2] - b[i][2]);
      cnt++;
    }
    return cnt ? sum / (cnt * 765) * 100 : 0;
  }
  const avgDist = (a, b) =>
    Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

  console.log('');
  console.log('=== 行驶期（40% 进度，遮掉 UI）八关平均色 ===');
  /* ⚠ 上一版这一行写成
   *   '... zoom ' + r.got ? '' : ''
   * —— `+` 比三元运算符优先级高，整串被当成条件，
   * 于是八行输出**全是空行**（条件恒假）。判据照样通过，
   * 但报告里一个字都没有。这是"打印语句自己坏了"（第八种空转）。
   * 现在拆成两段，不再依赖运算符优先级。 */
  rows.forEach(r => {
    console.log('  ' + r.id + '  rgb(' + r.avg.join(',') + ')' +
      '  跑到 x=' + r.got.x + '/' + r.got.target +
      '  动作 ' + r.got.acts + '  zoom ' + r.zoom);
  });

  const pairs = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      pairs.push({ a: rows[i].id, b: rows[j].id,
        ad: avgDist(rows[i].avg, rows[j].avg),
        sd: sigDiff(rows[i].sig, rows[j].sig) });
    }
  }
  pairs.sort((x, y) => x.ad - y.ad);
  const wAvg = pairs[0];
  pairs.sort((x, y) => x.sd - y.sd);
  const wSig = pairs[0];
  console.log('');
  console.log('行驶期平均色最接近：' + wAvg.a + '/' + wAvg.b + '  ' + wAvg.ad);
  console.log('行驶期签名最接近：  ' + wSig.a + '/' + wSig.b + '  ' +
    wSig.sd.toFixed(1) + '%');

  console.log('');
  console.log('=== 判据 ===');

  /* A 行驶期两两平均色 ≥ 18（和建造页同一条阈值） */
  chk('A 八关行驶期两两平均色距 ≥ 18', wAvg.ad >= 18,
    '最小 ' + wAvg.ad + '（' + wAvg.a + '/' + wAvg.b + '）');

  /* B 行驶期两两签名差 ≥ 6% */
  chk('B 八关行驶期两两签名差 ≥ 6%', wSig.sd >= 6,
    '最小 ' + wSig.sd.toFixed(1) + '%（' + wSig.a + '/' + wSig.b + '）');

  /* C 每一关都真的跑到了 40% 进度（否则量的是"起跑那一刻"，八关都一样） */
  {
    const bad = rows.filter(r => Math.abs(r.got.x - r.got.target) > 3);
    chk('C 前提：八关都跑到了 40% 进度位置（±3 格）', bad.length === 0,
      bad.length ? bad.map(r => r.id + ' x=' + r.got.x + '/' + r.got.target).join(' ')
        : '全部到位');
  }

  /* D 地形剖面：只报告最像的一对，不设硬门槛。
   * 理由见文件头：形状相同的两关可能玩法完全不同（1-6 浮力 vs 1-8 风场）。 */
  lines.push('（记录项）地形剖面最像的一对：' + wShape.a + '/' + wShape.b +
    ' 差 ' + wShape.d.toFixed(3) + ' —— 形状相同不等于关卡相同，不设门槛');

  /* E 地形落差各不相同（这一条是**硬的**：八关的垂直尺度不该一样） */
  {
    const drops = profs.map(p => p.drop);
    const uniq = new Set(drops.map(d => d.toFixed(1)));
    lines.push('八关落差：' + profs.map(p => p.id + '=' + p.drop + 'm').join(' '));
    chk('E 八关地形落差不完全相同（垂直尺度有区分）', uniq.size >= 6,
      uniq.size + ' 种不同的落差');
  }

  console.log('');
  console.log(lines.join('\n'));
  console.log('');
  console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
  console.log('errors:', errs.length ? errs.join(' | ') : '(none)');
  try { ws.close(); } catch (e) {}
  try { require('./lib/asserts.js').killTree(child); } catch (e) {}
  process.exit(fail === 0 && errs.length === 0 ? 0 : 1);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });
