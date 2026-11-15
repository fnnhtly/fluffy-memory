/* 探针：页面失去焦点 / 被切到后台时，这一局会怎样？
 *
 * 疑点：`frameBody` 里推物理的条件是
 *     if (state.run && state.phase === 'run' && state.run.phase === 'run' && !state.paused)
 * **没有任何"页面还看得见吗"的判断**。而 `index.html` 里 grep
 * `blur|visibilitychange|hidden` 是 0 命中。
 *
 * 真人玩家一定会 alt-tab（浏览器标签本来就鼓励这个）。那一刻：
 *   A. 车还在跑 —— 玩家切回来时可能已经撞碎了/飘走了/看门狗判负了；
 *   B. 更糟的是**按住的状态永远松不开**：keyup 落到别的窗口上，
 *      `state.heldKeys` 里那个键永远留着，`state.heldBtn` 同理 ——
 *      于是回来以后刹车一直踩着、交互键一直按着。
 *
 * 这和项目里已经修过两次的坑是同一类（第 43 轮 auto-repeat 把 pumpPress 刷到 17、
 * 第 44 轮手指滑出按钮松不开）。这两次都只防了"同一个窗口里的意外松手"，
 * 没防"整个窗口失去焦点"。
 *
 * 用 CDP 的 Page.setWebLifecycleState 让页面真的进入 hidden/frozen ——
 * 这是浏览器级别的证明，不是自己 dispatch 一个假的 blur 事件。
 */
const fs = require('fs');
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeF-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try {
      const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl;
    } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const errs = [];
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) {
      const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') {
      errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    }
  };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value;
  };

  /* ---------- A. 物理会不会自己继续跑 ---------- */
  console.log('=== A. 页面进入 hidden 之后，这一局的仿真时钟还走吗？ ===');
  await ev(`(()=>{window.__rap.launchSpec(0,'1-1'); return true;})()`);
  await sleep(400);
  const before = await ev(`(()=>{const s=window.__rap.state;return {t:+s.run.time.toFixed(3),x:+s.run.car.x.toFixed(3),phase:s.phase,hz:s.frameCount};})()`);
  await send('Page.setWebLifecycleState', { state: 'frozen' });
  await sleep(1200);        // 后台待 1.2 秒
  const during = await ev(`(()=>{const s=window.__rap.state;return {t:+s.run.time.toFixed(3),x:+s.run.car.x.toFixed(3),phase:s.phase,hz:s.frameCount,hidden:document.hidden,vis:document.visibilityState};})()`);
  await send('Page.setWebLifecycleState', { state: 'active' });
  await sleep(300);
  const after = await ev(`(()=>{const s=window.__rap.state;return {t:+s.run.time.toFixed(3),x:+s.run.car.x.toFixed(3),phase:s.phase,hz:s.frameCount};})()`);
  console.log('  切走前  ', JSON.stringify(before));
  console.log('  后台 1.2s 期间', JSON.stringify(during));
  console.log('  切回来  ', JSON.stringify(after));
  const advanced = during.t - before.t;
  console.log(`  → 后台期间仿真推进了 ${advanced.toFixed(3)} 秒` +
    (advanced > 0.05 ? '（**会自己跑**）' : '（已冻结）'));
  console.log(`  → document.hidden=${during.hidden} visibilityState=${during.vis}`);

  /* ---------- B. 按住的键会不会永远松不开 ---------- */
  console.log('\n=== B. 按住交互键时切走，回来还按着吗？ ===');
  await ev(`(()=>{const s=window.__rap.state;
    window.__rap.startLevel(1); s.welcome=0; s.introT=1;
    const R=window.__rap.RAP; R.applySpec(window.__rap.levels[1], s.build, R.SPECS['1-2']);
    window.__rap.launch();
    s.heldKeys['1']=true; s.heldBtn=1;
    const run=s.run; run.car.groups.forEach(g=>{g.on=true;});
    return {heldKeys:Object.keys(s.heldKeys),heldBtn:s.heldBtn};})()`);
  await sleep(300);
  const heldBefore = await ev(`(()=>{const s=window.__rap.state;return {heldKeys:Object.keys(s.heldKeys),heldBtn:s.heldBtn,pumpHeld:s.run.car.pumpHeld,pumpCharge:+(s.run.car.pumpCharge||0).toFixed(3),groupsOn:s.run.car.groups.map(g=>g.on)};})()`);
  await send('Page.setWebLifecycleState', { state: 'frozen' });
  await sleep(900);
  const heldDuring = await ev(`(()=>{const s=window.__rap.state;return {heldKeys:Object.keys(s.heldKeys),heldBtn:s.heldBtn,pumpHeld:s.run.car.pumpHeld,pumpCharge:+(s.run.car.pumpCharge||0).toFixed(3),groupsOn:s.run.car.groups.map(g=>g.on)};})()`);
  await send('Page.setWebLifecycleState', { state: 'active' });
  await sleep(300);
  /* 现在真的松开手指：keyup 送到窗口上 —— 但如果 heldKeys 里那个键还在，
   * 下一轮按同键会被 `if (state.heldKeys[k]) return` 挡掉，这是第 43 轮那个坑。 */
  const heldAfter = await ev(`(()=>{const s=window.__rap.state;return {heldKeys:Object.keys(s.heldKeys),heldBtn:s.heldBtn,pumpHeld:s.run.car.pumpHeld,pumpCharge:+(s.run.car.pumpCharge||0).toFixed(3),groupsOn:s.run.car.groups.map(g=>g.on)};})()`);
  console.log('  切走前  ', JSON.stringify(heldBefore));
  console.log('  后台期间', JSON.stringify(heldDuring));
  console.log('  切回来  ', JSON.stringify(heldAfter));
  console.log(`  → 后台期间蓄力从 ${heldBefore.pumpCharge} 变成 ${heldDuring.pumpCharge}` +
    (heldDuring.pumpCharge > heldBefore.pumpCharge + 0.05 ? '（**在后台还在蓄力**）' : ''));

  /* ---------- C. 刹车 ---------- */
  console.log('\n=== C. 按住 S 刹车时切走，回来刹车还踩着的吗？ ===');
  await ev(`(()=>{window.__rap.startLevel(0); const s=window.__rap.state;
    s.welcome=0; s.introT=1;
    const R=window.__rap.RAP; R.applySpec(window.__rap.levels[0], s.build, R.SPECS['1-1']);
    window.__rap.launch();
    s.heldKeys['s']=true;
    R.setBrake(s.run,true);
    return s.run.car.braking;})()`);
  await sleep(200);
  const bkBefore = await ev('window.__rap.state.run.car.braking');
  await send('Page.setWebLifecycleState', { state: 'frozen' });
  await sleep(800);
  const bkDuring = await ev('window.__rap.state.run.car.braking');
  await send('Page.setWebLifecycleState', { state: 'active' });
  await sleep(200);
  const bkAfter = await ev('(()=>({braking:window.__rap.state.run.car.braking,heldKeys:Object.keys(window.__rap.state.heldKeys)})())');
  console.log('  切走前 braking=' + bkBefore + '　后台期间 braking=' + bkDuring +
    '　切回来 ' + JSON.stringify(bkAfter));

  /* ---------- D. 有没有任何"失去焦点"的处理器 ---------- */
  console.log('\n=== D. 页面上有没有监听失焦/可见性？ ===');
  const handlers = await ev(`(()=>{
    /* 数不出来（addEventListener 已注册的探针拿不到），所以直接看源码里有没有 */
    return {blurInSource: /blur|visibilitychange/.test(window.__rap ? '' : '')};
  })()`);
  void handlers;
  {
    const src = fs.readFileSync(path.join(ROOT, 'prototype', 'index.html'), 'utf8');
    const hits = src.split('\n').filter(l => /addEventListener\('(blur|visibilitychange|focus)'/.test(l));
    console.log('  源码里 addEventListener(blur/visibilitychange/focus) 出现 ' + hits.length + ' 次');
    hits.forEach(h => console.log('    ' + h.trim()));
  }

  console.log('\nerrors:', errs.length ? errs.join(' | ') : '(none)');
  ws.close();
  require('child_process').spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
})();
