/* 「没有进展」看门狗：引擎判据 + 界面提示，必须同时成立。
 *
 * 三件事必须由这一份测试把守：
 *   1. **不误杀** —— 六关标准解全都不能触发它；
 *   2. **判得准** —— 一辆"在慢慢溜但永远到不了"的车要在 W 秒内被判负，
 *      而不是干等到 60 秒硬上限；
 *   3. **说得清** —— 界面上要提前给出倒计时，用词要和失败的结算文案对得上
 *      （玩家看到"3 秒内没有进展就要判负"，输掉时看到"一直在原地打转"，
 *      这两句话必须是同一件事）。
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgePW-' + Date.now()),
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

  const W = await ev('window.__rap.RAP.Params.progressWindow');
  const D = await ev('window.__rap.RAP.Params.progressGain');
  A.log(`看门狗参数：窗口 ${W}s，门槛 ${D}m`);
  A.chk('看门狗参数是量出来的那一组（8 秒 / 2 米）', W === 8 && D === 2, `${W}s / ${D}m`);

  // ---------- 1. 六关标准解都不能触发 ----------
  const std = JSON.parse(await ev(`(()=>{const out=[];
    const keys=['1-1','1-2','1-3','1-4i','1-5m','1-6'];
    window.__rap.levels.forEach((lv,i)=>{
      const k=keys[i]||lv.levelId;
      if(!window.__rap.RAP.SPECS[k]) return;
      const r=window.__rap.RAP.simulate(lv, window.__rap.RAP.SPECS[k], {maxTime:90});
      out.push({id:lv.levelId, result:r.result, reason:r.failReason||'', t:r.time, stars:r.stars});
    });
    return JSON.stringify(out);})()`));
  std.forEach(s => A.log(`${s.id} → ${s.result} @ ${s.t.toFixed(1)}s ★${s.stars}`));
  A.chk('六关标准解全部获胜（看门狗一个都没误杀）',
    std.every(s => s.result === 'win'), std.filter(s => s.result !== 'win').map(s => s.id).join(',') || '全部 win');
  A.chk('六关没有一个被判 no_progress',
    std.every(s => s.reason !== 'no_progress'), std.map(s => s.reason).join(','));

  // ---------- 2. 慢慢溜的车要被判 no_progress，而不是白等到 60 秒 ----------
  /* 1-5 上「单框 + 单轮」：实测能以 0.2~0.4 m/s 一路溜到 x≈15，
   * 然后顶在墙前 —— 速度始终高于 stuck 的 0.2 阈值，所以 stuck 抓不到。
   * 这正是这个看门狗存在的理由。 */
  const slow = JSON.parse(await ev(`(()=>{const R=window.__rap.RAP;
    const lv=window.__rap.levels[4];
    const spec={wood_frame:[[4,1]],wood_wheel:[[5,1]],pig:[[4,1]]};
    const r=R.simulate(lv,spec,{maxTime:90});
    return JSON.stringify({result:r.result, reason:r.failReason||'', t:r.time,
      noGainFor:r.noGainFor, x:r.car.x, goal:lv.goal.col});})()`));
  A.log(`1-5 单框单轮 → ${slow.result}/${slow.reason} @ ${slow.t.toFixed(1)}s，` +
    `最远 x=${slow.x.toFixed(1)}/${slow.goal}`);
  A.chk('慢慢溜的车被判 no_progress（不是 stuck、也不是 timeout）',
    slow.reason === 'no_progress', slow.reason);
  A.chk('而且判得很早（远小于 60 秒硬上限）', slow.t < 15, slow.t.toFixed(1) + 's');
  A.chk('判负时确实没有到终点（不是误判）', slow.x < slow.goal - 5,
    `x=${slow.x.toFixed(1)}，终点 ${slow.goal}`);

  // ---------- 3. 界面上要提前给出倒计时 ----------
  /* 直接构造一个"已经 6 秒没进展"的 run，看 HUD 会不会提示。
   * 用法是**纯函数**（progressWarning），所以不需要真的跑 6 秒。 */
  const warn = JSON.parse(await ev(`(()=>{const R=window.__rap.RAP, f=window.__rap.progressWarning;
    const mk=(noGainFor)=>({car:{x:5,y:6}, noGainFor});
    return JSON.stringify({s2:f(mk(6.0)), s0:f(mk(0.0)), s3:f(mk(3.0)), s8:f(mk(8.0)), none:f(null)});})()`));
  A.log('noGainFor=6.0 → ' + JSON.stringify(warn.s2 && warn.s2.text));
  A.chk('剩 2 秒时给出倒计时提示', !!(warn.s2 && /2 秒/.test(warn.s2.text)),
    warn.s2 ? warn.s2.text : 'null');
  A.chk('刚出发时不提示（不制造常驻噪音）', warn.s0 === null);
  /* noGainFor=3.0 → 还剩 5 秒，比"只在最后 4 秒出现"的门槛更宽裕 → 不该提示。
   * 注意别写成 5.0：那对应"还剩 3 秒"，本来就该提示。 */
  A.chk('还剩 5 秒（余量充足）时不提示', warn.s3 === null,
    warn.s3 ? warn.s3.text : 'null');
  A.chk('时间到（noGainFor=8）不再提示（已判负）', warn.s8 === null);
  A.chk('空 run 不崩', warn.none === null);

  // ---------- 4. 结算页的失败文案要和警告是同一件事 ----------
  /* 警告说"没有进展就判负"，结算就必须说清"一直在原地打转"——
   * 如果两者共用一句"卡住了：动力或重心不对"，玩家会以为判定出错：
   * 他明明看见车在动。
   *
   * 这里量的是**文案本身**，不靠截图：failText 已经导出到 __rap。 */
  const texts = JSON.parse(await ev(`(()=>{const f=window.__rap.failText;
    return JSON.stringify({np:f('no_progress'), stuck:f('stuck'),
      tout:f('timeout'), fly:f('flew_away')});})()`));
  A.log('no_progress 文案：' + texts.np);
  A.chk('「没进展」和「卡住」不是同一句话（否则玩家以为判定错了）',
    texts.np !== texts.stuck, texts.np + ' / ' + texts.stuck);
  A.chk('「没进展」的文案提到"打转/进展"，指向"车在动但白动"',
    /打转|进展/.test(texts.np), texts.np);
  A.chk('每种失败原因都有文案（不会把内部 id 漏给玩家）',
    !/^[a-z_]+$/.test(texts.np) && !/^[a-z_]+$/.test(texts.tout),
    `${texts.np} / ${texts.tout}`);

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
