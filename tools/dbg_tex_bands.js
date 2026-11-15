/* 诊断：probe_tex_parallax 的取样区里到底有没有画东西？
 *
 * 第一次量到 score 恒为 0、bestK 卡在搜索边界。两种可能：
 *   (a) 纹理真的钉在屏幕上静止；
 *   (b) 量具在量一片纯色。
 * 这个脚本负责分清两者 —— 先看取样区有没有内容，以及内容在哪儿。
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeD-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) {
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
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  await send('Runtime.evaluate', { expression: "localStorage.clear();localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1000);
  const ev = async e => (await send('Runtime.evaluate',
    { expression: e, returnByValue: true, awaitPromise: true })).result.value;

  console.log('view =', await ev('JSON.stringify(window.__view)'));

  /* 关键修正 1：**不要 paused**。paused 会叠一层暗化遮罩，
   * 整块取样区会被压成同一个灰度（第一次量到 y≥500 全是 10 就是这个）。
   * 冻结物理改用 run.phase 离开 'run' —— step() 会早退，但没有遮罩。 */
  await ev(`(()=>{const R=window.__rap,S=R.state;
    S.phase='run'; S.paused=false;
    S.run = S.run || R.createRun(R.level(), {cells:{}});
    S.run.phase='frozen'; S.fx=[]; S.particles=[]; S.replay=null;
    S.run.car.x=20; S.run.car.y=3.0; S.run.car.vx=0; S.run.car.vy=0;
    return 1;})()`);
  await sleep(1500);   // 等镜头缓动收敛

  console.log('camState =', await ev('JSON.stringify(window.__rap.state.camState)'));
  console.log('car =', await ev(`(()=>{const c=window.__rap.state.run.car;
    return JSON.stringify({x:+c.x.toFixed(2),y:+c.y.toFixed(2)});})()`));
  console.log('地表高度 =', await ev(`(()=>{const S=window.__rap.state;
    return S.run.terrain.surfaceY(20).toFixed(2);})()`));

  const rep = await ev(`(()=>{
    const cv=document.getElementById('cv'), g=cv.getContext('2d');
    const dpr=Math.min(1.5, window.devicePixelRatio||1);
    const out=[];
    for(let y0=200;y0<=690;y0+=35){
      const img=g.getImageData(Math.round(100*dpr),Math.round(y0*dpr),
                               Math.round(1080*dpr),Math.round(35*dpr));
      const d=img.data; let mn=255,mx=0,sum=0,n=0;
      for(let i=0;i<d.length;i+=4){const v=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
        if(v<mn)mn=v; if(v>mx)mx=v; sum+=v; n++;}
      out.push({y0:y0, mn:Math.round(mn), mx:Math.round(mx), mean:Math.round(sum/n)});
    }
    return JSON.stringify(out);})()`);
  JSON.parse(rep).forEach(r => console.log(
    'y=' + r.y0 + '..' + (r.y0 + 35) + '  min=' + r.mn + ' max=' + r.mx +
    ' mean=' + r.mean + '  跨度=' + (r.mx - r.mn)));

  send('Browser.close'); try { require('child_process')
    .spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) {}
  process.exit(0);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });
