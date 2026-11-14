/* 探针：车上的电池图标会不会随电量下降？
 *
 * 1-3 叫《电池够不够》，三星条件正是「能量剩 ≥ 30」——
 * 这一关的全部注意力都在电量上。
 *
 * HUD 顶栏有一行小字 `能量 112`，但车上的电池**图元**画的是电量条
 * （`drawPartShape` 的 `def.energy` 那一支，按 `def.__pct` 决定填充高度）。
 * 而 `def.__pct` 在整份 index.html 里**只被读过、从没被写过**：
 *
 *     const pct = (def.__pct !== undefined) ? def.__pct : 1;
 *
 * ── 量具四次写错的经过（全留在这里，四次都很容易再踩）──
 *
 * 1. 用 `state.camLive` 反算车件坐标 → 屏幕 y=1066，取样区整块在画布外。
 *    `camLive` **只在建造阶段被写过**（frame() 的 `if (phase==='build')` 分支）。
 *
 * 2. 改成整块像素 diff → 噪声底 27%。车在跑，背景每帧都在动。
 *
 * 3. 改用"数电量条特有颜色的像素"（绿 #63d97e / 黄 / 红）→ 全是 0。
 *    同帧在那一块涂绿立刻数到 190，说明**区域对、颜色错**：
 *    电池画完后世界层上还压了一层夜色，真实的绿被调暗了。
 *
 * 4. 冻住物理（paused=true）以为能静止 → 噪声底反而升到 52%。
 *    `paused` 只停物理，**不停镜头缓动**（drawRun 里的
 *    `cs.x += (targetX-cs.x)*k` 每帧照跑），整幅画面一直在平移。
 *
 * 最终做法：不听颜色绝对值，按**色相**归类 —— 电量条是"绿占优"
 * （G 明显高于 R 和 B），而背景是青/棕/暗（不会满足这个条件）。
 * 这样既躲开了压暗、又躲开了画面平移，全程不需要 diff。
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeBt3-' + Date.now()),
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
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };

  await ev(`(()=>{const s=window.__rap.state,G=window.__rap.RAP,lv=window.__rap.levels[2];
    s.welcome=0; s.helpOpen=0; s.paused=false;
    window.__rap.startLevel(2); s.welcome=0; s.introT=1;
    G.applySpec(lv, s.build, G.SPECS['1-3']);
    window.__rap.launch(); s.runBanner=0;
    s.paused=true;
    /* 把 performance.now 钉成一个常数：猪的耳朵摆动、呼吸光晕、粒子摇曳
     * 全都读它。冻结之后整幅画面**逐帧完全相同**，取样才有意义。
     * （不冻结时噪声底实测到 29 像素，而那是隔壁那只猪在摆耳朵 ——
     *  猪也是绿的，会一起被数进"绿占优"。） */
    window.__realNow = performance.now.bind(performance);
    performance.now = function () { return 12345.678; };
    /* 粒子也要清空：dust / bursts / confetti / debris 的推进在 frame() 里
     * 不受 paused 影响（它们在外面那个 else-if 分支里），会一直飘，
     * 混进"绿占优"的计数。 */
    s.dust = []; s.bursts = []; s.confetti = []; s.debris = [];
    return 1;})()`);
  await sleep(600);

  /* 数"绿占优"的像素，并给出它们的最高/最低行 = 条子有多长。 */
  const snap = async (label) => JSON.parse(await ev(`(()=>{
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
    let n=0, top=9999, bot=-1;
    for(let i=0;i<d.length;i+=4){
      const r=d[i], g2=d[i+1], b=d[i+2];
      if(g2 > r+22 && g2 > b+12 && g2 > 55){        // 绿占优
        n++;
        const yy=Math.floor((i/4)/Wd);
        if(yy<top) top=yy; if(yy>bot) bot=yy;
      }
    }
    return JSON.stringify({label:'${label}', green:n,
      top:(top===9999?null:top), bot:(bot<0?null:bot),
      span:(bot>=0? bot-top+1 : 0),
      energy:+car.energy.toFixed(1), energyMax:+car.energyMax.toFixed(1),
      at:[Math.round(sx), Math.round(sy)]});
  })()`));

  const setEnergy = (v) => ev(`(()=>{window.__rap.state.run.car.energy=${v};return 1;})()`);

  const rows = [];
  /* 先"预热"一帧：snap() 里把镜头钉死在目标值上，但那已经画完的那一帧是用
   * **钉之前**的镜头画的（drawRun 的缓动每帧都在跑）。所以第一次取样会偏移。
   * 预热一次 → 等两帧 → 再取真正要比较的快照，噪声底才会归零。 */
  await snap('warm');
  await sleep(420);
  const full = await snap('full');
  console.log('满电：' + JSON.stringify(full));
  if (full.err) { console.log('取不到电池位置：' + full.err); process.exit(1); }
  rows.push(full);
  await sleep(320);
  rows.push(await snap('full2'));
  for (const e of [60, 20, 0]) {
    await setEnergy(e); await sleep(320); rows.push(await snap('e' + e));
  }

  console.log('\n电量　绿像素　纵向跨度');
  rows.forEach(r => console.log(String(r.energy).padStart(5) + '　' +
    String(r.green).padStart(6) + '　' + String(r.span).padStart(6)));
  /* 基线取**第二次**满电快照（rows[1]），不取第一次：
   * 第一次取样紧跟在"把镜头钉死"之后，而那一帧其实是用钉之前的镜头画的
   * （drawRun 的缓动每帧都在跑），读数是 311；再往后稳定在 340。
   * 也就是说第一帧是量具自己的收敛误差，不该拿来当对照。 */
  const base = rows[1];
  const last = rows[rows.length - 1];
  console.log('\n噪声底（两次满电之间）：绿像素 ' + full.green + ' / ' + base.green +
    '，跨度 ' + full.span + ' / ' + base.span);
  console.log('判读：电量 ' + base.energy + ' → 0，绿像素 ' + base.green + ' → ' + last.green +
    '，跨度 ' + base.span + ' → ' + last.span +
    (Math.abs(base.green - last.green) <= 8 && base.span === last.span
      ? '　★ 完全没变：电池图标不随电量下降' : '　有变化'));

  /* 量具自证：同帧在电池位置涂一条绿，绿像素必须涨 */
  {
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
    /* 对照必须取**紧挨着涂色之前**的那一次（电量 0，条子是红的），
     * 而不是满电那次（311）—— 满电时条子本来就是绿的，拿它当基线等于
     * 让自检去超过一个"本来就是绿"的数，那是判据写错，不是量具坏了。 */
    console.log('量具自检（同帧涂 11×18 绿）：绿像素 ' + self.green +
      '（涂之前 ' + last.green + '）' +
      (self.green > last.green + 50 ? ' → 量具看得见电池区域 ✓'
        : ' → ✗ 量具没量在电池上'));
  }

  ws.close(); require('child_process').spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
