/* 1-3 电池跑光的那一刻，玩家看到/听到什么？（第 51 轮）
 *
 * 引擎写 `motor_out`（game.js 951/958），但渲染层**没有任何消费者**
 * （`grep motor_out index.html` 零命中）。也就是说马达断电这一瞬间
 * 画面上什么都不发生：车不再被推动，玩家只看到它慢慢停住。
 *
 * 接着 8 秒没进展 → `no_progress` → 失败卡写
 * 「一直在原地打转：8 秒没能更靠近终点」。
 * 而这辆车的真实原因是**电池用光了**。玩家照着这句话会去改重心、改配重 ——
 * 全都白费劲。这和第 47 轮 `failCulprit` 是同一类问题：
 * **诊断说错了原因，玩家会朝错误方向修车。**
 *
 * 这条测试守四件事：
 *   1) 断电时 HUD 必须有一次明确提示（toast 里出现「电池」）；
 *   2) HUD 的能量那一栏在断电后必须能看出异常（不是光秃秃的 `能量 0`）；
 *   3) 失败归因在"装了马达且电量归零"时必须点名电池，而不是只说重心；
 *   4) `motor_out` 一次断电只写**一条**事件（否则 toast 会被反复重播）。
 *
 * 前三条在修之前应当全红 —— 这份脚本本来就是先写红再修的。
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeMO2-' + Date.now()),
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

  /* 抓文字：fillText 补丁（只记录，不改变绘制）。
   * clearRect 时清空，所以 recs 总是"当前这一帧画了什么"。 */
  await ev(`(()=>{if(window.__audit) return 1;
    const C=CanvasRenderingContext2D.prototype, o=C.fillText, oc=C.clearRect;
    window.__audit={recs:[], fx:[]};
    C.clearRect=function(){ window.__audit.recs.length=0; return oc.apply(this,arguments); };
    C.fillText=function(t){ window.__audit.recs.push(String(t)); return o.apply(this,arguments); };
    return 1;})()`);

  const recs = async () => JSON.parse(await ev('JSON.stringify(window.__audit.recs)'));

  // 1-3 的标准解：马达 + 电池。物理必须真跑，否则 motor_out 永远不会触发
  await ev(`(()=>{const s=window.__rap.state,G=window.__rap.RAP,lv=window.__rap.levels[2];
    s.welcome=0; s.helpOpen=0; s.paused=false;
    window.__rap.startLevel(2); s.welcome=0; s.introT=1; s.runBanner=0;
    G.applySpec(lv, s.build, G.SPECS['1-3']);
    window.__rap.launch(); s.runBanner=0;
    return 1;})()`);
  await sleep(600);

  const st = async () => JSON.parse(await ev(`(()=>{const s=window.__rap.state;
    return JSON.stringify({energy:+((s.run&&s.run.car.energy)||0).toFixed(1),
      hasMotor:!!(s.run&&s.run.car.motor),
      motorEvs:(s.run&&s.run.events||[]).filter(e=>e.indexOf('motor_out')===0).length,
      toast:s.toast||null, toastT:+(s.toastT||0).toFixed(2),
      phase:s.phase, runPhase:s.run&&s.run.phase,
      failReason:s.run&&s.run.failReason,
      shot:s.state});})()`).then(r => { delete r.shot; return r; }));

  const before = await st();
  A.chk('前提：1-3 的车装了马达、满电出发', before.hasMotor === true && before.energy > 90,
    'motor=' + before.hasMotor + ' energy=' + before.energy);
  A.chk('前提：出发时还没有 motor_out', before.motorEvs === 0, before.motorEvs + ' 条');

  /* 直接把电量打到 0.4 秒的量，让引擎自己跨过零点 —— 这样 motor_out
   * 走的是真实代码路径（而不是我在外面手动 log 一条）。 */
  await ev(`(()=>{window.__rap.state.run.car.energy=0.4; return 1;})()`);

  // 等它跨过去
  let mid = null;
  for (let i = 0; i < 40; i++) {
    await sleep(120);
    mid = await st();
    if (mid.motorEvs > 0) break;
  }
  const midRecs = await recs();

  A.log('断电后：' + JSON.stringify(mid));
  A.chk('前提：电量真的跨过了零点', mid.energy <= 0.01, 'energy=' + mid.energy);
  A.chk('引擎写下了 motor_out 事件', mid.motorEvs >= 1, mid.motorEvs + ' 条');

  /* 1) toast 必须点名电池 */
  const toastRec = midRecs.find(t => t.indexOf('电池') >= 0);
  A.chk('断电时 HUD 弹出提示，且点名「电池」（不是静默停住）',
    !!toastRec, toastRec || ('当前画面文字：' + midRecs.slice(0, 6).join(' | ')));

  /* 2) HUD 能量那一栏能看出异常 */
  const energyRec = midRecs.filter(t => t.indexOf('能量') >= 0);
  A.chk('断电后 HUD 的能量栏写上了「用光/耗尽/没电」之一',
    energyRec.some(t => /用光|耗尽|没电|断电/.test(t)),
    energyRec.join(' | ') || '没有能量那一行');

  /* 4) 一次断电只写一条事件 */
  await sleep(700);
  const late = await st();
  A.chk('一次断电只写一条 motor_out（不会每帧重播提示）',
    late.motorEvs <= 1, late.motorEvs + ' 条');

  /* 3) 失败归因点名电池 —— 用 failCulprit 直接量（渲染读的就是它） */
  {
    const culp = await ev(`(()=>{const R=window.__rap,s=R.state;
      const c=R.failCulprit(s.run);
      return JSON.stringify({culprit:c});})()`).then(JSON.parse);
    A.log('failCulprit（马达断电后）= ' + JSON.stringify(culp.culprit || culp.err));
    A.chk('失败归因点名「电池用光」，而不是只让玩家去改重心',
      typeof culp.culprit === 'string' && /电池/.test(culp.culprit),
      JSON.stringify(culp));
  }

  /* 量具自证：没有马达的关（1-1）不该冒出「电池用光」这句 ——
   * 否则这条提示是句永远为真的噪音（第 44 轮踩过同样的坑）。 */
  {
    await ev(`(()=>{const s=window.__rap.state,G=window.__rap.RAP,lv=window.__rap.levels[0];
      s.welcome=0; s.helpOpen=0; s.paused=false;
      window.__rap.startLevel(0); s.welcome=0; s.introT=1; s.runBanner=0;
      G.applySpec(lv, s.build, G.SPECS['1-1']);
      window.__rap.launch(); s.runBanner=0;
      return 1;})()`);
    await sleep(500);
    const c2 = await ev(`(()=>{const R=window.__rap,s=R.state;
      return JSON.stringify({culprit:R.failCulprit(s.run),
        hasMotor:!!(s.run&&s.run.car.motor)});})()`).then(JSON.parse);
    A.chk('量具能失败：没装马达的车不出现「电池用光」', c2.hasMotor === false &&
      !/电池/.test(c2.culprit || ''), JSON.stringify(c2));
  }

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
