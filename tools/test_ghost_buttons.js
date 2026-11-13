/* 行驶期不许存在"看不见却点得着"的热区。
 *
 * 起因是一次读代码发现的死代码：`btnRect('retryRun')` 仍然返回一个 84×84 的矩形
 * （屏幕右下 980..1064 × 500..584），`mousedown` 里也仍然判它 ——
 * 但 drawButtons() 早就不画这个按钮了（注释写着"重开在左上，这里不再放重复按钮"）。
 * 于是玩家在右下那片空白上随手一点，就会莫名其妙地被踢回建造页。
 *
 * 判据：在行驶画面上撒一遍网格点，凡是**不在任何"看得见的矩形"里**的点，
 * 点下去都不许改变 phase、不许改变拼装。这条判据不依赖具体哪个按钮画没画，
 * 所以以后新增按钮忘了画、或者删按钮忘了删判定，都会被抓到。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);   // 随机端口：避免残留进程撞车
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeGh-' + Date.now()),
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
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
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

  // 起一局（1-2 有打气筒，底部有交互按钮，热区最多）
  const startRun = async () => {
    await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[1];
      window.__rap.startLevel(1); s.welcome=0; s.introT=1;
      R.applySpec(lv, s.build, R.SPECS['1-2']);
      window.__rap.launch(); s.runBanner=0; s.paused=false; return 1;})()`);
    await sleep(500);
  };

  // "看得见的矩形"：行驶期真正画出来的那些（按 drawHud/drawButtons 的绘制清单列）
  const visibleRects = () => ev(`(()=>{
    const R=window.__rap, out=[];
    const add=r=>{ if(r) out.push(r); };
    add(R.btnRect('pause')); add(R.btnRect('restartRun')); add(R.btnRect('help'));
    add(R.btnRect('brake'));
    add(R.runTimeRects().timer); add(R.runTimeRects().box);
    add(R.runProgressRect().panel); add(R.runChallengeRect());
    add({x:84,y:90,w:700,h:30});          // 顶部信息条
    // 底部交互键（按组数动态排）
    const gs=(R.state.run&&R.state.run.car.groups)||[];
    const n=Math.min(3,gs.length), xs=1280/2-(n*104)/2;
    for(let i=0;i<n;i++) add({x:xs+i*104-4,y:720-150-4,w:100,h:100});
    // 顶部关卡页签
    for(let i=0;i<5;i++) add({x:24+i*86,y:18,w:80,h:30});
    return JSON.stringify(out);
  })()`).then(JSON.parse);

  const inside = (rs, x, y) => rs.some(r => x >= r.x - 2 && x <= r.x + r.w + 2 && y >= r.y - 2 && y <= r.y + r.h + 2);

  await startRun();
  const rects = await visibleRects();
  A.log('行驶期辨认出 ' + rects.length + ' 个可见矩形');

  // 撒网格点：步长 60px，跳过可见矩形内部
  const PTS = [];
  for (let x = 40; x < 1240; x += 60) {
    for (let y = 40; y < 700; y += 60) {
      if (!inside(rects, x, y)) PTS.push([x, y]);
    }
  }
  A.log('待测空白点：' + PTS.length + ' 个');

  // 一次性把所有点都点一遍，然后检查有没有被"踢走"
  const res = JSON.parse(await ev(`(()=>{
    const cv=document.querySelector('canvas');
    const R=window.__rap, s=R.state;
    const r=cv.getBoundingClientRect();
    const pts=${JSON.stringify(PTS)};
    const bad=[];
    for(const [x,y] of pts){
      const before={phase:s.phase, run:!!s.run, cells:Object.keys(s.build.cells).length};
      const cx=r.left + x*r.width/1280, cy=r.top + y*r.height/720;
      cv.dispatchEvent(new MouseEvent('mousedown',{clientX:cx,clientY:cy,button:0,bubbles:true}));
      cv.dispatchEvent(new MouseEvent('mouseup',{clientX:cx,clientY:cy,button:0,bubbles:true}));
      cv.dispatchEvent(new MouseEvent('click',{clientX:cx,clientY:cy,button:0,bubbles:true}));
      const after={phase:s.phase, run:!!s.run, cells:Object.keys(s.build.cells).length};
      if(after.phase!==before.phase || after.run!==before.run || after.cells!==before.cells){
        bad.push({x:x,y:y,from:before.phase,to:after.phase});
        // 恢复现场，继续测下一点
        s.phase='run';
        if(!s.run){ R.launch(); }
      }
      if(bad.length>=12) break;
    }
    return JSON.stringify({bad, tested:pts.length});
  })()`));
  A.log('测了 ' + res.tested + ' 个空白点，副作用点 ' + res.bad.length + ' 个' +
    (res.bad.length ? '：' + res.bad.map(b => '(' + b.x + ',' + b.y + ')→' + b.to).join(' ') : ''));

  A.chk('行驶期空白处点一下不会把玩家踢回建造页（无幽灵热区）',
    res.bad.length === 0,
    res.bad.length ? res.bad.slice(0, 4).map(b => '(' + b.x + ',' + b.y + ')').join(' ') : '0 个');

  // 度量尺自证：把那条已被删掉的 retryRun 矩形（DW-300, DH-220, 84×84）重新算一遍，
  // 它必须落在"可见矩形"之外 —— 也就是说，如果判定还留着，上面那条断言一定红。
  // 没有这一条，"0 个副作用点"只能说明网格没撒到那儿。
  {
    const GHOST = { x: 1280 - 300, y: 720 - 220, w: 84, h: 84 };
    const probe = { x: GHOST.x + GHOST.w / 2, y: GHOST.y + GHOST.h / 2 };
    A.chk('度量尺能失败：已删除的 retryRun 中心点确实不在任何可见矩形里',
      !inside(rects, probe.x, probe.y),
      '(' + probe.x + ',' + probe.y + ') 落在空白里');
  }

  // 反向对照：可见矩形的中心必须**真的**能点（证明上面的网格不是"哪都点不动"）
  await startRun();
  const posCtrl = JSON.parse(await ev(`(()=>{
    const cv=document.querySelector('canvas');
    const R=window.__rap, s=R.state;
    const r=cv.getBoundingClientRect();
    const b=R.runTimeRects().timer;   // 计时面板：点它必须没反应，用来证明网格确实点得动
    const b2=R.btnRect('pause');
    const at=(x,y)=>{
      const cx=r.left + x*r.width/1280, cy=r.top + y*r.height/720;
      cv.dispatchEvent(new MouseEvent('mousedown',{clientX:cx,clientY:cy,button:0,bubbles:true}));
      cv.dispatchEvent(new MouseEvent('mouseup',{clientX:cx,clientY:cy,button:0,bubbles:true}));
    };
    at(b2.x+b2.w/2, b2.y+b2.h/2);
    return JSON.stringify({paused:s.paused});
  })()`));
  A.chk('可见按钮（暂停）确实点得动 —— 证明点击注入本身有效', posCtrl.paused === true,
    'paused=' + posCtrl.paused);

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
