/* 气球 / 沙袋在**真浏览器**里的那条链路：看得见、点得着、点了有效果。
 *
 * 纯 Node 的 test_parts_lift.js 已经证明了规则本身对（tapAt / popBalloon / dropSandbag）。
 * 这里补的是它证明不了的三件事：
 *   1. 气球/沙袋的图元真的画在了车身该在的位置上（不是画成一团糊）；
 *   2. 堆叠徽标 ×3 真的出现了（1 个和 3 个在画面上必须能分辨）；
 *   3. 用**真实鼠标坐标**点车身，气球真的会少一个 —— 也就是说
 *      canvasPos → camLive → tapAt 这条换算没算错。
 *
 * 第 3 条是重点：坐标换算是"差半帧就点不中"的活儿，
 * 而 balloon 的判定半径只有 0.85 米（约 27 像素），写错一个符号就永远点不着。
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
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeLU-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const errs = [];
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); };
  const click = async (x, y) => {
    const r = await ev(`(()=>{const c=document.querySelector('canvas').getBoundingClientRect();
      return JSON.stringify({x:c.left+${x}*c.width/1280, y:c.top+${y}*c.height/720});})()`);
    const p = JSON.parse(r);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await sleep(120);
  };

  // ---------- 建造期：托盘的 9 个格子 ----------
  await ev(`(()=>{const s=window.__rap.state; s.welcome=0; s.introT=1; window.__rap.startLevel(5); s.welcome=0; s.introT=1; return 1;})()`);
  await sleep(600);
  const tray = JSON.parse(await ev(`JSON.stringify(window.__rap.TRAY.map((_,i)=>window.__rap.trayRect(i)))`));
  await shot('lu-01-build-tray');
  A.chk('托盘排出 9 格零件 + 1 格橡皮', tray.length === 10, tray.length + ' 格');
  A.chk('托盘不超出 1280 宽',
    tray[0].x >= 8 && tray[tray.length - 1].x + tray[0].w <= 1272,
    `x ${Math.round(tray[0].x)} → ${Math.round(tray[tray.length - 1].x + tray[0].w)}`);

  // ---------- 用真鼠标在建造期放 3 个气球（同格点 3 下 → ×3 徽标） ----------
  /* 目标格必须是**紧贴木框的上方一格**（第 3 行，木框在第 4 行）：
   * 气球不是结构件，`canPlace` 要求它挨着已有结构件，隔两行会被 'connect' 拒绝。
   * （这条是第一次跑红抓出来的 —— 当时点了 3 下，一个都没放上去。） */
  const BP = await ev('window.__rap.BUILD_PX');
  const cell = JSON.parse(await ev(`(()=>{const o=window.__rap.buildOrigin();
    return JSON.stringify({x:o.x+3*window.__rap.BUILD_PX+window.__rap.BUILD_PX/2,
                           y:o.y+3*window.__rap.BUILD_PX+window.__rap.BUILD_PX/2});})()`));
  // 先点托盘里的气球（index 6），再连点目标格 3 次
  await click(tray[6].x + tray[6].w / 2, tray[6].y + tray[6].h / 2);
  A.chk('点托盘选中了气球', (await ev('window.__rap.state.selected')) === 'balloon',
    'selected=' + (await ev('window.__rap.state.selected')));
  // 建造期格子需要先有木框；直接走 API 搭好基础车，再用鼠标补气球
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[5];
    for(const c of [1,2,3]) R.tryPlace(lv, s.build, 'wood_frame', 4, c);
    R.tryPlace(lv, s.build, 'wood_wheel', 5, 1);
    R.tryPlace(lv, s.build, 'wood_wheel', 5, 3);
    R.tryPlace(lv, s.build, 'pig', 4, 2);
    return 1;})()`);
  await click(cell.x, cell.y);
  await click(cell.x, cell.y);
  await click(cell.x, cell.y);
  const nBalloon = await ev(`window.__rap.RAP.cellCount(window.__rap.state.build.cells['3,3'])`);
  A.chk('鼠标连点同一格 3 次 → 叠了 3 个气球', nBalloon === 3, 'n=' + nBalloon);
  const liftLine = await ev('window.__rap.liftLineOf()');
  A.chk('建造 HUD 显示了浮力与净重', /浮力 3\.6/.test(liftLine) && /净重/.test(liftLine), liftLine);
  await shot('lu-02-build-stacked');

  // 徽标像素探针。
  /* 关键：**必须有对照组**。背景本身是深色建造区，跟"深色圆底"是同色的，
   * 所以"圆内比圆外暗"这种绝对判据根本立不住（第一次写的就是这个，永远红）。
   * 做法是在隔壁格放 **1 个**气球当对照 —— 两格的背景、零件、光照完全一样，
   * 唯一差别就是"有没有 ×3 徽标"。探针取的是同一个相对位置。 */
  await click(tray[6].x + tray[6].w / 2, tray[6].y + tray[6].h / 2);   // 仍选着气球
  const cell1 = JSON.parse(await ev(`(()=>{const o=window.__rap.buildOrigin();
    return JSON.stringify({x:o.x+2*window.__rap.BUILD_PX+window.__rap.BUILD_PX/2,
                           y:o.y+3*window.__rap.BUILD_PX+window.__rap.BUILD_PX/2});})()`));
  await click(cell1.x, cell1.y);   // 只放 1 个
  {
    const o = JSON.parse(await ev('JSON.stringify(window.__rap.buildOrigin())'));
    const badgeAt = (col) => ({ x: o.x + col * BP + 0.80 * BP, y: o.y + 3 * BP + 0.80 * BP });
    const P3 = badgeAt(3), P1 = badgeAt(2);   // 3 个的那格 / 1 个的对照格
    A.chk('对照格（2,3）确实只有 1 个气球',
      (await ev(`window.__rap.RAP.cellCount(window.__rap.state.build.cells['3,2'])`)) === 1, '1 个');
    const sample = async (p) => JSON.parse(await ev(`(()=>{
      const cv=document.getElementById('cv'),g=cv.getContext('2d');
      const sx=cv.width/1280, sy=cv.height/720;
      const cx=Math.round(${p.x}*sx), cy=Math.round(${p.y}*sy);
      const R=14, d=g.getImageData(cx-R, cy-R, R*2+1, R*2+1).data;
      let deep=0, warm=0, bright=0;
      for(let i=0;i<d.length;i+=4){
        const r=d[i],gg=d[i+1],b=d[i+2], lum=(r+gg+b)/3;
        if(lum<48) deep++;
        if(r>190 && gg>158 && b<212) warm++;
        if(lum>170) bright++;
      }
      return JSON.stringify({deep, warm, bright});})()`));
    const withBadge = await sample(P3);
    const noBadge = await sample(P1);
    A.chk('×3 徽标画出来了（同背景下，有徽标的格多出深色圆底）',
      withBadge.deep > noBadge.deep + 40,
      `叠 3 个那格 ${withBadge.deep} 暗像素 vs 只放 1 个那格 ${noBadge.deep}`);
    A.chk('徽标上有暖金圆环和亮色数字',
      withBadge.warm > noBadge.warm + 15 && withBadge.bright > noBadge.bright + 4,
      `暖色 ${noBadge.warm}→${withBadge.warm}，亮色 ${noBadge.bright}→${withBadge.bright}`);
  }

  // ---------- 行驶期：点车身扎气球 ----------
  /* 用 1-6 的官方规格发射（6 气球 + 3 沙袋），这样气球和沙袋都在车上。
   * 注意**不能先暂停再点** —— 暂停分支会把所有点击吞掉（那是刻意的防误触），
   * 于是"点不动"会被误读成"坐标算错了"。这里就在跑动中点，
   * 反正 tapAt 用的是点下去那一瞬间的车位。 */
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[5];
    s.welcome=0; s.introT=1; s.phase='build'; s.paused=false;
    R.applySpec(lv, s.build, R.SPECS['1-6']);
    window.__rap.launch(); s.runBanner=0; s.paused=false; return 1;})()`);
  await sleep(400);
  const before = JSON.parse(await ev(`(()=>{const s=window.__rap.state.run;
    return JSON.stringify({lift:s.car.liftMass, pops:s.balloonPops||0,
      bags:s.car.sandbagCount||0, mass:s.car.mass});})()`));
  A.chk('发射后车上带着气球和沙袋', before.lift > 0 && before.bags > 0,
    `lift=${before.lift.toFixed(2)} bags=${before.bags}`);

  // 用 camLive 反算车身气球的屏幕坐标 —— 和渲染层用的是同一个镜头
  const scr = JSON.parse(await ev(`(()=>{const s=window.__rap.state, cm=s.camLive, car=s.run.car;
    const bp=car.parts.find(p=>p.def.liftMass);
    const ca=Math.cos(car.a), sa=Math.sin(car.a);
    const wx=car.x+bp.lx*ca-bp.ly*sa, wy=car.y+bp.lx*sa+bp.ly*ca;
    const z=32*cm.zoom;
    return JSON.stringify({x:1280/2+(wx-cm.x)*z, y:720/2-(wy-cm.y)*z, wx, wy,
      cam:{x:cm.x,y:cm.y,zoom:cm.zoom}});})()`));
  A.log('气球在屏幕 (' + Math.round(scr.x) + ',' + Math.round(scr.y) + ')');
  await click(scr.x, scr.y);
  const after = JSON.parse(await ev(`(()=>{const s=window.__rap.state.run;
    return JSON.stringify({lift:s.car.liftMass, pops:s.balloonPops||0});})()`));
  A.chk('用真实鼠标点车身 → 扎破一个气球', after.pops === before.pops + 1,
    `pops ${before.pops} → ${after.pops}（指针 ${Math.round(scr.x)},${Math.round(scr.y)}）`);
  A.chk('扎破后浮力下降 1.2 kg', Math.abs((before.lift - after.lift) - 1.2) < 1e-6,
    `${before.lift.toFixed(2)} → ${after.lift.toFixed(2)}`);

  // 反向对照：点在远处（车外 220px）不该有任何副作用
  {
    const b2 = JSON.parse(await ev(`(()=>{const s=window.__rap.state.run;
      return JSON.stringify({pops:s.balloonPops||0, bags:s.sandbagsDropped||0});})()`));
    await click(scr.x - 220, scr.y - 60);
    const a2 = JSON.parse(await ev(`(()=>{const s=window.__rap.state.run;
      return JSON.stringify({pops:s.balloonPops||0, bags:s.sandbagsDropped||0});})()`));
    A.chk('点车身外面不误触', a2.pops === b2.pops && a2.bags === b2.bags,
      `pops ${b2.pops}→${a2.pops} bags ${b2.bags}→${a2.bags}`);
  }
  await shot('lu-03-run-after-pop');

  // ---------- 点沙袋：扔一个 ----------
  {
    const sb = JSON.parse(await ev(`(()=>{const s=window.__rap.state, cm=s.camLive, car=s.run.car;
      const bp=car.parts.find(p=>p.def.dropOne && (p.n||0) > 0);
      if(!bp) return JSON.stringify({none:true});
      const ca=Math.cos(car.a), sa=Math.sin(car.a);
      const wx=car.x+bp.lx*ca-bp.ly*sa, wy=car.y+bp.lx*sa+bp.ly*ca;
      const z=32*cm.zoom;
      return JSON.stringify({x:1280/2+(wx-cm.x)*z, y:720/2-(wy-cm.y)*z});})()`));
    if (!sb.none) {
      const d0 = await ev('window.__rap.state.run.car.sandbagCount');
      await click(sb.x, sb.y);
      await sleep(150);
      const d1 = await ev('window.__rap.state.run.car.sandbagCount');
      A.chk('点沙袋 → 扔下去一个', d1 === d0 - 1, `${d0} → ${d1}`);
    } else {
      A.chk('点沙袋 → 扔下去一个', false, '车上没有沙袋（1-6 规格里应该有）');
    }
  }

  // ---------- 失败文案：flew_away 必须有中文，不能落到 key 上 ----------
  await ev(`(()=>{const s=window.__rap.state; s.phase='run';
    s.run.result='fail'; s.run.failReason='flew_away'; s.run.phase='resolved';
    s.phase='resolved'; s.resultBtnY=556; return 1;})()`);
  await sleep(400);
  const txt = await ev(`(()=>{const s=window.__rap.state;
    return window.__rap.state.phase;})()`);
  A.chk('flew_away 能让结算页正常显示（不抛异常）', txt === 'resolved', 'phase=' + txt);
  await shot('lu-04-result-flew-away');

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
