/* 失败回放到底看得见吗？
 *
 * 怀疑：`drawResult` 在 `drawRun` 之后调用，卡片是 760×424 的 96% 不透明面板，
 * 而回放里的车被画在屏幕中央 —— 也就是说**回放被结算卡盖住了**。
 *
 * 这个探针不看代码，只量像素：
 *   1. 数全屏"气球粉"，再数卡片矩形**以内**和**以外**各多少；
 *   2. 摘掉气球，看卡片外的粉色掉多少（如果回放可见，卡片外应该掉很多）；
 *   3. 把卡片关掉（resultT 冻结在 0）再看一次，作为"回放本来长什么样"的对照。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeRP2-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map();
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };
  async function shot(n) { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); }

  async function setup(freezeResultT) {
    await ev(`(()=>{const s=window.__rap.state;
      window.__rap.startLevel(4);
      s.welcome=0; s.introT=1; s.phase='build';
      s.build.cells={};
      s.build.cells['4,2']={part:'wood_frame',dir:0};
      s.build.cells['4,2'].inner='pig';
      s.build.cells['5,2']={part:'wood_wheel',dir:0};
      s.build.cells['3,1']={part:'balloon',dir:0,n:2};
      s.build.cells['3,3']={part:'balloon',dir:0,n:2};
      s.build.order=['4,2','3,1','3,3','5,2'];
      window.__rap.launch();
      s.run.result='fail'; s.run.failReason='stuck'; s.run.phase='resolved';
      s.phase='resolved';
      s.run.replay=[];
      for(let i=0;i<40;i++) s.run.replay.push({t:i/20,x:3+i*0.12,y:6+Math.sin(i*0.3)*0.4,a:-0.2});
      s.__frozenT=0.9;
      Object.defineProperty(s,'replayT',{configurable:true,get(){return this.__frozenT;},set(v){}});
      ${freezeResultT ? "Object.defineProperty(s,'resultT',{configurable:true,get(){return 0;},set(v){}});" : 's.resultT=1;'}
      return 1;})()`);
    await sleep(450);
  }

  const pinkIn = (x, y, w, h) => ev(`(()=>{const cv=document.getElementById('cv'),g=cv.getContext('2d');
    const sx=cv.width/1280, sy=cv.height/720;
    const d=g.getImageData(Math.round(${x}*sx),Math.round(${y}*sy),
      Math.round(${w}*sx),Math.round(${h}*sy)).data;
    let n=0;
    for(let i=0;i<d.length;i+=4){const r=d[i],gg=d[i+1],b=d[i+2];
      if(r>85 && b>gg+5 && b>55) n++;}
    return n;})()`);

  // ---------- A：结算卡已完全滑入（玩家真实看到的状态） ----------
  await setup(false);
  const whole = await pinkIn(0, 0, 1280, 720);
  const inside = await pinkIn(260, 150, 760, 424);
  const outside = await pinkIn(0, 0, 1280, 150) + await pinkIn(0, 574, 1280, 146)
    + await pinkIn(0, 150, 260, 424) + await pinkIn(1020, 150, 260, 424);
  console.log(`A 卡片完全滑入：全屏粉 ${whole}，卡内 ${inside}，卡外 ${outside}`);
  await shot('dbg-a-card-covered');

  // 摘掉气球，看卡外掉多少
  await ev(`(()=>{const s=window.__rap.state;
    s.__saved=s.run.car.parts.slice();
    s.run.car.parts=s.run.car.parts.filter(p=>!p.def.liftMass); return 1;})()`);
  await sleep(350);
  const outside2 = await pinkIn(0, 0, 1280, 150) + await pinkIn(0, 574, 1280, 146)
    + await pinkIn(0, 150, 260, 424) + await pinkIn(1020, 150, 260, 424);
  console.log(`   摘掉气球后卡外粉 ${outside2}（差 ${outside - outside2}）`);
  await ev(`(()=>{const s=window.__rap.state; s.run.car.parts=s.__saved; return 1;})()`);

  // ---------- B：卡片不画（resultT 冻在 0），看回放本来有多亮 ----------
  await setup(true);
  const wholeB = await pinkIn(0, 0, 1280, 720);
  console.log(`B 卡片未滑入（resultT=0）：全屏粉 ${wholeB}`);
  await shot('dbg-b-no-card');
  await ev(`(()=>{const s=window.__rap.state;
    s.__saved2=s.run.car.parts.slice();
    s.run.car.parts=s.run.car.parts.filter(p=>!p.def.liftMass); return 1;})()`);
  await sleep(350);
  const wholeB2 = await pinkIn(0, 0, 1280, 720);
  console.log(`   摘掉气球后 ${wholeB2}（差 ${wholeB - wholeB2}）`);

  try { ws.close(); } catch (e) {}
  require('child_process').spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
