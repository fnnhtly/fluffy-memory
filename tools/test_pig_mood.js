/* 猪的表情：happy / scared / hurt / dizzy / dead 各自要有触发条件，
 * 而且要真的被渲染路径取到（state.pigMood 是渲染层读的那个值）。
 *
 * 原来只把见过的 mood 打印出来，exit 0 —— 一个表情都不出现也算通过。
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
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeP-' + Date.now()),
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
  async function shot(n) { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); }

  // 1-1 官方预设，直接跑
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[0];
    window.__rap.startLevel(0); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-1']);
    window.__rap.launch();
  })()`);

  const seen = {};
  for (let i = 0; i < 260; i++) {
    await sleep(45);
    const mood = await ev('window.__rap.state.pigMood || "-"');
    if (mood !== '-' && !seen[mood]) { seen[mood] = i; await shot('pm-' + mood); }
    if ((await ev('window.__rap.state.phase')) === 'resolved') break;
  }
  A.log('跑完一关见到的表情：' + Object.keys(seen).join(' ') +
    '（首次出现帧 ' + JSON.stringify(seen) + '）');

  A.chk('渲染层真的读到了 mood（不是一直 "-"）', Object.keys(seen).length > 0,
    Object.keys(seen).join(' '));
  A.chk('正常行驶时是 normal', !!seen.normal, Object.keys(seen).join(' '));
  A.chk('出现过至少两种表情（说明状态机在切，不是画死一个）',
    Object.keys(seen).length >= 2, Object.keys(seen).join(' '));

  // 手动构造：受伤 → hurt、被甩飞 → dead。这两条是"输了"的唯一视觉线索，必须能出现。
  await ev(`(()=>{const s=window.__rap.state;
    if (s.phase !== 'run') { s.phase='run'; }
    if (!s.run) s.run = window.__rap.RAP.createRun(window.__rap.level(), s.build);
    s.run.phase = 'run';
    s.run.pigHP = 1;
    return s.run.pigHP;
  })()`);
  await sleep(320);
  const hpHurt = await ev('window.__rap.state.pigMood');
  A.chk('猪血量低时表情切到 hurt', hpHurt === 'hurt', 'mood=' + hpHurt);
  await shot('pm-forced-hurt');

  // 表情判定读的是 state.run.car.hasPig（不是 state.run.hasPig）——第一版设错了对象，
  // 结果"切到 dead"这条永远不成立，还得靠日志才看得出来。
  await ev('(()=>{const s=window.__rap.state; s.run.car.hasPig = false; return s.run.car.hasPig;})()');
  await sleep(320);
  const phDead = await ev('window.__rap.state.pigMood');
  A.chk('猪不在车上时表情切到 dead', phDead === 'dead', 'mood=' + phDead);
  await shot('pm-forced-dead');

  /* ---------- dizzy / happy：这两个分支以前是**死路** ----------
   *
   * 渲染层的判定是
   *   else if ((state.run.lastImpactAt || -9) > now2 - 0.7) mood = 'dizzy';
   *   else if ((state.run.lastBoxAt    || -9) > now2 - 1.0) mood = 'happy';
   * 而引擎**从来没写过这两个字段**（tools/audit_dead_reads.js 查出来的）。
   * `undefined || -9` 恒为 -9，永远小于 now2-0.7 —— 两个分支静悄悄地死了：
   * 撞得掉耐久的那么一下，猪的表情不变；吃到木箱，也不笑。
   *
   * 这里不伪造 mood，只造场景：
   *   · dizzy：把车抬到 6 米高再放手，让物理真的撞一下（会扣耐久 → 引擎应写 lastImpactAt）
   *   · happy：跑 1-2 的标准解，它必经那个木箱（引擎应写 lastBoxAt）
   * 然后读渲染层每帧算出来的 state.pigMood —— 也就是玩家真正看到的那个值。 */
  await ev(`(()=>{const R=window.__rap.RAP,s=window.__rap.state;
    window.__rap.startLevel(0); s.welcome=0; s.introT=1;
    R.applySpec(window.__rap.levels[0], s.build, R.SPECS['1-1']);
    window.__rap.launch();
    const run=s.run;
    /* 落差 3 米 —— 这个数是量出来的（tools/probe_dizzy_window.js）：
     *   3 米 → 接触 6.05 m/s，扣 1 点耐久（木框 3→2，没碎），猪还在车上 → mood 能到 dizzy；
     *   4.5 米 → 9.21 m/s，框碎、猪被弹出、一局以 pig_lost 结束 → mood 走 dead，dizzy 被盖住；
     *   2 米 → 2.27 m/s，低于 damageMin=4.5，压根没有 impact。
     * 写 6 米（第一版）只会得到 pig_lost。 */
    run.car.y = run.terrain.surfaceY(run.car.x) + 3;
    run.car.vx = 0; run.car.vy = 0;
    run.spawnGrace = 0;
    return true;})()`);
  let dizzySeen = null, impactAtSeen = null;
  for (let i = 0; i < 90; i++) {
    await sleep(30);
    const m = await ev('window.__rap.state.pigMood');
    const ts = await ev('(window.__rap.state.run && window.__rap.state.run.lastImpactAt) || null');
    if (ts !== null && impactAtSeen === null) impactAtSeen = ts;
    if (m === 'dizzy' && dizzySeen === null) { dizzySeen = i; await shot('pm-dizzy'); break; }
    if (await ev('window.__rap.state.phase') === 'resolved') break;
  }
  A.chk('引擎在真实撞击后写了 lastImpactAt', impactAtSeen !== null,
    'lastImpactAt=' + impactAtSeen);
  A.chk('撞击后表情切到 dizzy（玩家真的看得到）', dizzySeen !== null,
    'dizzySeen=' + dizzySeen);
  A.log('dizzy 首次出现帧 ' + dizzySeen);

  // happy：用 1-1 的标准解 —— 它在 t=5.17 吃到那个木箱，那一刻车速 4.76 m/s、离地 0.63 米。
  //
  // 为什么不用 1-2（我第一版选的）：mood 的优先级是
  //   dead > dizzy > hurt > scared > happy
  // 而 1-2 靠打气筒冲出去，吃到箱子的那一帧车速是 **11.53 m/s** ——
  // `sp2 > 9` 直接判 scared，happy 永远轮不到。逐帧复算的结果：
  //   1-1 吃到箱子 → happy；1-2 / 1-3 / 1-6 都是 scared（车速或离地高度盖住了它）。
  // 这不是 bug，是"跑得飞快或在空中时不该笑"的优先级设计 —— 但它意味着
  // 用 1-2 验 happy 会验出一个假的失败。量具必须先在引擎里确认条件成立。
  //
  // 第二版还栽在等待时长上：1-1 通关要 6.17 秒（木箱在 5.17 秒），
  // 而循环只有 90 × 30ms ≈ 2.7 秒，帧循环根本没跑到那一刻就退出了，
  // 于是 `lastBoxAt=null` —— 看起来像"引擎没写"，其实是"没等"。
  // 现在按**仿真时刻**退出（等到箱子或跑到 resolved），不用固定帧数猜。
  await ev(`(()=>{window.__rap.launchSpec(0,'1-1'); return true;})()`);
  let happySeen = null, boxAtSeen = null;
  for (let i = 0; i < 300; i++) {
    await sleep(30);
    const m = await ev('window.__rap.state.pigMood');
    const ts = await ev('(window.__rap.state.run && window.__rap.state.run.lastBoxAt) || null');
    if (ts !== null && boxAtSeen === null) boxAtSeen = ts;
    if (m === 'happy' && happySeen === null) { happySeen = i; await shot('pm-happy'); }
    if (await ev('window.__rap.state.phase') === 'resolved') break;
  }
  A.chk('引擎在吃到木箱后写了 lastBoxAt', boxAtSeen !== null, 'lastBoxAt=' + boxAtSeen);
  A.chk('吃到木箱后表情切到 happy', happySeen !== null, 'happySeen=' + happySeen);
  A.log('happy 首次出现帧 ' + happySeen);

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
