/* 车上电池的电量条必须随电量下降（第 50 轮）。
 *
 * 1-3《电池够不够》的三星条件正是「能量剩 ≥ 30」—— 这一关的注意力全在电量上。
 * HUD 顶栏有一行 16 号小字 `能量 112`，而车上的电池**图元**画的是电量条
 * （`drawPartShape` 的 `def.energy` 那一支，按比例决定填充高度）。
 *
 * 原来那一支读的是 `def.__pct`，而这个字段**只被读过、从没被写过**：
 *     const pct = (def.__pct !== undefined) ? def.__pct : 1;
 * 于是电池图标永远满格 —— 马达没电了还是满的。
 *
 * 量到的（`tools/probe_battery_icon.js`，绿像素数 / 纵向跨度）：
 *
 *     电量 112　绿像素 340　跨度 23      ← 修之前
 *     电量  60　绿像素 340　跨度 23
 *     电量  20　绿像素 340　跨度 23
 *     电量   0　绿像素 340　跨度 23
 *
 * 四个时刻一模一样。修之后：
 *
 *     电量 112　绿像素 340　跨度 23
 *     电量  60　绿像素 242　跨度 16
 *     电量  20　绿像素  64　跨度  6      （20% 以下转红，绿像素只剩"闪电"那一小块）
 *     电量   0　绿像素  66　跨度  6
 *
 * ── 这份测试的前身栽过四次（都写进 records/playtest.md 了）──
 * 1. `state.camLive` 只在建造阶段被写过 → 取样区跑到画布外。
 * 2. 整块像素 diff → 车在跑，噪声底 27%~52%。
 * 3. 按"电量条原色 #63d97e"分类 → 世界层上压了夜色，真实颜色对不上。
 * 4. `paused` 只停物理，**不停镜头缓动**，画面一直在平移。
 *
 * 现在的量法：把镜头钉死在目标值、把 `performance.now` 钉成常数、
 * 清空粒子，然后**按色相归类**（绿占优 = G 明显高于 R 和 B）——
 * 这样既躲开压暗，也躲开画面平移。
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeBt4-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch (e) {}
  }
  if (!wsUrl) { console.log('FAIL 无法连上浏览器'); process.exit(1); }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const errs = [];
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(800);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1100);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };

  await ev(`(()=>{const s=window.__rap.state,G=window.__rap.RAP,lv=window.__rap.levels[2];
    s.welcome=0; s.helpOpen=0; s.paused=false;
    window.__rap.startLevel(2); s.welcome=0; s.introT=1; s.runBanner=0;
    G.applySpec(lv, s.build, G.SPECS['1-3']);
    window.__rap.launch(); s.runBanner=0;
    s.paused=true;
    window.__realNow = performance.now.bind(performance);
    performance.now = function () { return 12345.678; };
    s.dust = []; s.bursts = []; s.confetti = []; s.debris = [];
    return 1;})()`);
  await sleep(600);

  const snap = async () => JSON.parse(await ev(`(()=>{
    const cv=document.querySelector('canvas');
    const dpr=cv.width/1280;
    const g=cv.getContext('2d',{willReadFrequently:true});
    const s=window.__rap.state; s.shake=0;
    const car=s.run.car;
    const bat=car.parts.filter(p=>p.def&&p.def.energy)[0];
    if(!bat) return JSON.stringify({err:'车上没有电池'});
    const cm=s.camState;
    const surfY=Math.max(car.y, s.run.terrain.surfaceY(car.x));
    cm.x=car.x+2.0; cm.y=surfY+1.5; cm.zoom=1.85;
    const ca=Math.cos(car.a), sa=Math.sin(car.a);
    const wx=car.x+bat.lx*ca-bat.ly*sa, wy=car.y+bat.lx*sa+bat.ly*ca;
    const sc=32*cm.zoom;
    const sx=640+(wx-cm.x)*sc, sy=360-(wy-cm.y)*sc;
    const Wd=Math.round(30*dpr), Hd=Math.round(46*dpr);
    const d=g.getImageData(Math.round((sx-15)*dpr), Math.round((sy-23)*dpr), Wd, Hd).data;
    let green=0, top=9999, bot=-1;
    for(let i=0;i<d.length;i+=4){
      const r=d[i], g2=d[i+1], b=d[i+2];
      if(g2 > r+22 && g2 > b+12 && g2 > 55){
        green++;
        const yy=Math.floor((i/4)/Wd);
        if(yy<top) top=yy; if(yy>bot) bot=yy;
      }
    }
    return JSON.stringify({green:green, span:(bot>=0? bot-top+1 : 0),
      energy:+car.energy.toFixed(1), energyMax:+car.energyMax.toFixed(1),
      pct:window.__rap.batteryPctOf(s.run)});
  })()`));

  const setEnergy = (v) => ev(`(()=>{window.__rap.state.run.car.energy=${v};return 1;})()`);

  // 预热一帧：第一帧是用"钉镜头之前"的镜头画的
  await snap();
  await sleep(420);
  const full = await snap();
  if (full.err) { console.log('FAIL ' + full.err); process.exit(1); }
  await sleep(320);
  const full2 = await snap();               // 两次静置 = 噪声底

  const mid = [];
  for (const e of [60, 20, 0]) { await setEnergy(e); await sleep(320); mid.push(await snap()); }

  A.log('电量 112：绿像素 ' + full.green + '　跨度 ' + full.span + '　pct=' + full.pct.toFixed(3));
  A.log('两次静置：绿像素 ' + full.green + ' / ' + full2.green +
    '　跨度 ' + full.span + ' / ' + full2.span);
  mid.forEach(m => A.log('电量 ' + m.energy.toFixed(0) + '：绿像素 ' + m.green +
    '　跨度 ' + m.span + '　pct=' + m.pct.toFixed(3)));

  A.chk('前提：1-3 的车上有电池，且满电 112', full.energyMax > 100 && full.pct > 0.99,
    'energyMax=' + full.energyMax + ' pct=' + full.pct);

  A.chk('满电时读数 batteryPctOf = 1（渲染读的就是这个数）',
    Math.abs(full.pct - 1) < 0.01, full.pct);

  /* 基线取**第二次**静置（full2）：第一次紧跟"钉镜头"，那一帧是用钉之前的
   * 镜头画的，读数是 311，之后稳定在 340 —— 那是量具的收敛误差，不该当对照。 */
  A.chk('前提：两次静置之间电量条读数稳定（噪声底 ≤ 40 像素）',
    Math.abs(full2.green - full.green) <= 40 && full2.span === full.span,
    full.green + ' → ' + full2.green + '，跨度 ' + full.span + ' → ' + full2.span);

  A.chk('电量降到 60% 时电量条明显变短（绿像素至少少掉四分之一）',
    mid[0].green <= full2.green * 0.78,
    full2.green + ' → ' + mid[0].green);
  A.chk('电量降到 60% 时纵向跨度也变短',
    mid[0].span < full2.span, full2.span + ' → ' + mid[0].span);

  A.chk('电量 20% 时电量条几乎见底（跨度 ≤ 满格的 40%）',
    mid[1].span <= full2.span * 0.4, full2.span + ' → ' + mid[1].span);

  A.chk('电量归零时电量条已经空（跨度 ≤ 8 像素，只剩闪电那点绿）',
    mid[2].span <= 8, mid[2].span);

  A.chk('读数与写入的电量同源：batteryPctOf(0) = 0',
    Math.abs(mid[2].pct) < 0.01, mid[2].pct);

  /* 单调性：电量越低，条子越短。这一条能抓住"某档颜色判错但整体看着像在动"。 */
  {
    const seq = [full2].concat(mid).map(r => r.span);
    const mono = seq.every((v, i) => i === 0 || v <= seq[i - 1]);
    A.chk('电量越低，电量条越短（112→60→20→0 单调不增）',
      mono, seq.join(' → '));
  }

  /* ---- 量具自证 ---- */
  {
    /* 1) 低电量时还有"绿占优"的像素，说明这条判据不是只在满电时才看得见东西 */
    A.chk('量具能失败：电量 0 时仍能数到绿像素（闪电图标），判据不是瞎的',
      mid[2].green > 20, mid[2].green + ' 像素');

    /* 2) 同帧在电池位置涂一条绿，绿像素必须大涨 —— 证明取样区真的压在电池上。
     *    对照取**紧挨着涂色之前**的那一次（电量 0），不是满电那次。 */
    const self = JSON.parse(await ev(`(()=>{
      const cv=document.querySelector('canvas');
      const dpr=cv.width/1280;
      const g=cv.getContext('2d',{willReadFrequently:true});
      const s=window.__rap.state; s.shake=0;
      const car=s.run.car;
      const bat=car.parts.filter(p=>p.def&&p.def.energy)[0];
      const cm=s.camState;
      const ca=Math.cos(car.a), sa=Math.sin(car.a);
      const wx=car.x+bat.lx*ca-bat.ly*sa, wy=car.y+bat.lx*sa+bat.ly*ca;
      const sc=32*cm.zoom;
      const sx=640+(wx-cm.x)*sc, sy=360-(wy-cm.y)*sc;
      g.fillStyle='#63d97e';
      g.fillRect(Math.round((sx-5)*dpr), Math.round((sy-10)*dpr),
        Math.round(11*dpr), Math.round(18*dpr));
      const Wd=Math.round(30*dpr), Hd=Math.round(46*dpr);
      const d=g.getImageData(Math.round((sx-15)*dpr), Math.round((sy-23)*dpr), Wd, Hd).data;
      let n=0;
      for(let i=0;i<d.length;i+=4){
        const r=d[i], g2=d[i+1], b=d[i+2];
        if(g2 > r+22 && g2 > b+12 && g2 > 55) n++;
      }
      return JSON.stringify({green:n});
    })()`));
    A.chk('量具能失败：同帧在电池位置涂一块绿，绿像素明显上涨（取样区确实压在电池上）',
      self.green > mid[2].green + 50, mid[2].green + ' → ' + self.green);
  }

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
