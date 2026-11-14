/* 木框耐久：一段"看得见"的结构伤害（第 45 轮）。
 *
 * 这一条要证明三件事，每一件都必须用**玩家真正看到的像素**来量：
 *   1. 耐久条上的三格实心数 == 木框最低耐久（3 / 2 / 1）。
 *      以前这段伤害是静默的：耐久从 3 掉到 2、从 2 掉到 1，画面上只有木头上
 *      一道很淡的缝，没有读数、没有声音；而「不散架」这颗星已经悄悄没了。
 *   2. 颜色随档位变：满耐久绿、裂纹金、破损红。只数格子数不够 ——
 *      绿格子和红格子在灰度上都算"亮"，玩家区分靠的是颜色。
 *   3. 量具有能力失败：把同一块区域的底色盖暗，实心格数必须掉到 0。
 *      不做这一步的话，"三格都亮"只能说明判据不会失败。
 *
 * 另外顺手验两条非像素的：frameHpOf 读的是渲染层用的同一份数据；
 * challengeStatus 的文案要在「裂了 / 快散了」之间正确切换。
 */
const fs = require('fs');
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeFd-' + Date.now()),
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

  // ---- 起一局 1-1（第三颗星是「不散架」）----
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[0];
    window.__rap.startLevel(0); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-1']);
    window.__rap.launch(); s.runBanner=0;
    s.phase='run'; s.run.phase='run';         // 冻住物理推进，本测试只量 HUD
    return 1;})()`);
  await sleep(500);

  // 关掉物理推进：把 phase 拨到 run 但每帧都不允许 step 的方式不可靠，
  // 这里改用"暂停"——暂停时 rAF 仍然绘制 HUD，物理不再前进。
  await ev(`(()=>{window.__rap.state.paused=true; return 1;})()`);
  await sleep(300);

  /* 读取耐久条：返回三格的分类（'empty' / 'green' / 'gold' / 'red'）。
   * 取样用每格中心 5×3 个像素的平均色，避免抗锯齿边缘骗人。
   *
   * 分类器必须靠**绿通道**分金和红，不能靠"红比蓝高多少"：
   *   · 金 rgba(232,200,122,.92) 压在深夜蓝底上 → (215,186,114)，G=186
   *   · 红 rgba(224,129,106,.92) 同理              → (207,121,100)，G=121
   * 两者的 R 几乎一样（215 vs 207），第一版按 `r > g+15` 判红，
   * 于是金色被认成红、红色被认成金 —— 两条断言同时反着错，
   * 打印出来的 RGB 里其实看得一清二楚，是判据写错了，不是画错了。 */
  const readSegs = `(()=>{
    const R=window.__rap;
    const cv=document.querySelector('canvas');
    const dpr=cv.width/1280;
    const g=cv.getContext('2d',{willReadFrequently:true});
    const segs=R.frameSegRects();
    const cls=[];
    for(const sg of segs){
      const cx=(sg.x+sg.w/2)*dpr, cy=(sg.y+sg.h/2)*dpr;
      let r2=0,g2=0,b2=0,n=0;
      for(let dx=-2;dx<=2;dx++) for(let dy=-1;dy<=1;dy++){
        const d=g.getImageData(Math.round(cx+dx*dpr), Math.round(cy+dy*dpr),1,1).data;
        r2+=d[0]; g2+=d[1]; b2+=d[2]; n++;
      }
      const r=r2/n, gg=g2/n, b=b2/n;
      let k='empty';
      if (Math.max(r,gg,b) < 90) k='empty';
      else if (gg > r+20) k='green';                       // 绿：G 明显高于 R
      else if (r > 150 && gg < 150) k='red';              // 红：R 高但 G 低
      else if (r > 150 && gg >= 150) k='gold';            // 金：R、G 都高、B 低
      cls.push({k:k, r:+r.toFixed(0), g:+gg.toFixed(0), b:+b.toFixed(0)});
    }
    return JSON.stringify({cls:cls, hp:R.frameHpOf(window.__rap.state.run),
      cs:R.challengeStatus(window.__rap.state.run)});
  })()`;
  const read = async () => JSON.parse(await ev(readSegs));

  // ---- 满耐久：三格全绿 ----
  const full = await read();
  A.log('满耐久：' + full.cls.map(c => c.k + '(' + c.r + ',' + c.g + ',' + c.b + ')').join(' '));
  A.chk('满耐久时三格全亮', full.cls.filter(c => c.k !== 'empty').length === 3,
    JSON.stringify(full.cls.map(c => c.k)));
  A.chk('满耐久时三格是绿色（不是红/金）', full.cls.every(c => c.k === 'green'),
    JSON.stringify(full.cls.map(c => c.k)));
  A.chk('耐久读数与渲染层同源：frameHpOf = 3/3', full.hp.min === 3 && full.hp.max === 3,
    JSON.stringify(full.hp));
  A.chk('满耐久时状态条写「结构完好」', full.cs.value === '结构完好', full.cs.value);

  // ---- 掉一格：两格亮，颜色转金，文案变「裂了」----
  await ev(`(()=>{const s=window.__rap.state;
    s.run.car.parts.forEach(p=>{ if(p.def.structure) p.hp=2; });
    s.run.hullBroken=false; s.run.pigEjected=false; return 1;})()`).catch(async () => {
    await ev(`(()=>{const s=window.__rap.state;
      s.run.car.parts.forEach(p=>{ if(p.def.structure) p.hp=2; }); return 1;})()`);
  });
  await sleep(300);
  const mid = await read();
  A.log('掉一格：' + mid.cls.map(c => c.k + '(' + c.r + ',' + c.g + ',' + c.b + ')').join(' '));
  A.chk('掉一格后只剩两格实心', mid.cls.filter(c => c.k !== 'empty').length === 2,
    JSON.stringify(mid.cls.map(c => c.k)));
  A.chk('掉一格后实心格转金（裂纹档）', mid.cls.filter(c => c.k === 'gold').length === 2,
    JSON.stringify(mid.cls.map(c => c.k)));
  A.chk('耐久读数 2/3', mid.hp.min === 2, JSON.stringify(mid.hp));
  A.chk('状态条写「木框 2/3 裂了」', /裂了/.test(mid.cs.value) && mid.cs.pass === true, mid.cs.value);

  // ---- 掉两格：一格亮，红，文案变「快散了」----
  await ev(`(()=>{const s=window.__rap.state;
    s.run.car.parts.forEach(p=>{ if(p.def.structure) p.hp=1; }); return 1;})()`);
  await sleep(300);
  const low = await read();
  A.log('掉两格：' + low.cls.map(c => c.k + '(' + c.r + ',' + c.g + ',' + c.b + ')').join(' '));
  A.chk('掉两格后只剩一格实心', low.cls.filter(c => c.k !== 'empty').length === 1,
    JSON.stringify(low.cls.map(c => c.k)));
  A.chk('掉两格后实心格转红（破损档）', low.cls.filter(c => c.k === 'red').length === 1,
    JSON.stringify(low.cls.map(c => c.k)));
  A.chk('耐久读数 1/3', low.hp.min === 1, JSON.stringify(low.hp));
  A.chk('状态条写「木框 1/3 快散了」但星还亮着（还没散架）',
    /快散了/.test(low.cs.value) && low.cs.pass === true, low.cs.value);

  // ---- 量具自证：把耐久条整块盖暗，实心格数必须掉到 0 ----
  {
    const covered = JSON.parse(await ev(`(()=>{
      const R=window.__rap; const F=R.runTimeRects().frame;
      const cv=document.querySelector('canvas'); const dpr=cv.width/1280;
      const g=cv.getContext('2d',{willReadFrequently:true});
      g.fillStyle='rgba(6,10,14,1)';
      g.fillRect(F.x*dpr, F.y*dpr, F.w*dpr, F.h*dpr);
      const segs=R.frameSegRects(); let lit=0;
      for(const sg of segs){
        const d=g.getImageData(Math.round((sg.x+sg.w/2)*dpr), Math.round((sg.y+sg.h/2)*dpr),1,1).data;
        if(Math.max(d[0],d[1],d[2])>90) lit++;
      }
      return JSON.stringify({lit:lit});
    })()`));
    A.chk('量具能失败：盖住耐久条后实心格数掉到 0', covered.lit === 0, covered.lit + ' 格');
  }
  await sleep(300);   // 让 rAF 重绘回去

  // ---- 碎掉时整块消失（不是显示 0/3 的残骸）----
  await ev(`(()=>{const s=window.__rap.state;
    s.run.car.parts.forEach(p=>{ if(p.def.structure) p.hp=0; });
    s.run.hullBroken=true; return 1;})()`);
  await sleep(300);
  const gone = await read();
  A.chk('木框全碎后耐久条整块隐去（不留 0/3 的空壳）',
    gone.cls.every(c => c.k === 'empty'), JSON.stringify(gone.cls.map(c => c.k)));
  A.chk('碎掉后状态条写「木框已碎」且星不再亮',
    gone.cs.value === '木框已碎' && gone.cs.pass === false, gone.cs.value + ' pass=' + gone.cs.pass);

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
