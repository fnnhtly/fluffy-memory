/* 1-6 必须在**真浏览器**里通关 —— 不能只在 Node 里通关。
 *
 * 第 40 轮的发现：`launchSpec` 曾经只把 `_presses` 送进运行期，
 * 忽略了 `_drops` / `_pops`。而 1-6 的全部玩法就是"什么时候扔沙袋、
 * 什么时候扎气球"：
 *
 *   game.js 的 simulate()  认识 _drops/_pops → Node 里 1-6 三星通关
 *   浏览器里的 launchSpec  不认识         → 车带着 3 个沙袋起飞 → stuck
 *
 * 于是仓库里所有"1-6 可通"的证据都来自 Node，**浏览器里一次都没跑到终点**。
 * 这类缺口特别危险：Node 单测和浏览器测试各自都绿，中间那条路是断的。
 *
 * 这条测试守四件事：
 *   1) launchSpec('1-6') 必须真的把 4 个动作排进 actScript；
 *   2) 真浏览器里必须跑到 win，且 ★3；
 *   3) 沙袋 3 个全扔、气球恰好扎 1 个（多余或不足都会走成别的结局）；
 *   4) 浏览器结果必须和 Node 的 simulate 一致（同一份规则，两个执行器）。
 *      这一条才是"两条路径都没跑偏"的真正证据。
 *
 * 顺带守一条：0 控制台异常。本轮的 bug 正是"静默什么都没发生"，
 * 它不会产生任何异常 —— 所以断言必须落在结果上，不能落在 errors 上。
 */
const A = require('./lib/asserts');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // ---------- 先取 Node 侧的基准答案 ----------
  const R = require(path.join(ROOT, 'prototype', 'game.js'));
  const fs = require('fs');
  const lv6 = JSON.parse(fs.readFileSync(path.join(ROOT, 'levels', '06.json'), 'utf8'));
  const ref = R.simulate(lv6, R.SPECS['1-6'], {});
  A.chk('Node: 1-6 标准解 win', ref.result === 'win', ref.result + ' / ' + (ref.failReason || ''));
  A.chk('Node: 1-6 标准解 ★3', ref.stars === 3, '★' + ref.stars);
  A.log('Node 基准：win @ ' + ref.time.toFixed(2) + 's，x=' + ref.car.x.toFixed(2) +
    '，扔 ' + ref.sandbagsDropped + ' 扎 ' + ref.balloonPops);

  // ---------- 真浏览器 ----------
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edge16b-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try {
      const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page');
      if (pg) wsUrl = pg.webSocketDebuggerUrl;
    } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const errs = [];
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };

  const ok = await ev(`window.__rap.launchSpec(5, '1-6')`);
  A.chk('浏览器: launchSpec 接受 1-6 标准解', ok === true, String(ok));

  const acts = JSON.parse(await ev('JSON.stringify(window.__rap.state.run.actScript || [])'));
  A.chk('actScript 排进了 4 个动作（3 扔 + 1 扎）', acts.length === 4,
    acts.map(a => a.k + '@' + a.t).join(' '));
  A.chk('actScript 里有 drop（这是曾经缺失的那一类）',
    acts.filter(a => a.k === 'drop').length === 3,
    acts.filter(a => a.k === 'drop').length + ' 个 drop');
  A.chk('actScript 里有 pop（这是曾经缺失的另一类）',
    acts.filter(a => a.k === 'pop').length === 1,
    acts.filter(a => a.k === 'pop').length + ' 个 pop');

  let last = null;
  for (let i = 0; i < 150; i++) {
    await sleep(200);
    last = JSON.parse(await ev(`(()=>{const r=window.__rap.state.run;
      return JSON.stringify({t:+r.time.toFixed(2), x:+r.car.x.toFixed(2), y:+r.car.y.toFixed(2),
        phase:r.phase, res:r.result||'', reason:r.failReason||'',
        bags:r.sandbagsDropped||0, pops:r.balloonPops||0,
        stars:r.stars||0, lift:+(r.car.liftMass||0).toFixed(2)});})()`));
    if (last.res) break;
  }
  A.log('浏览器结果：' + JSON.stringify(last));

  A.chk('浏览器: 1-6 跑到了结算（不是永远 run）', !!last.res, last.phase);
  A.chk('浏览器: 判定为 win', last.res === 'win', last.res + ' / ' + (last.reason || '-'));
  A.chk('浏览器: ★3', last.stars === 3, '★' + last.stars);
  A.chk('浏览器: 沙袋 3 个全扔', last.bags === 3, last.bags + ' 个');
  A.chk('浏览器: 气球恰好扎 1 个', last.pops === 1, last.pops + ' 个');
  A.chk('浏览器: 浮力降到 6.0（3 个气球）', Math.abs(last.lift - 6.0) < 0.05, last.lift);

  // ---------- 两个执行器必须给出同一个答案 ----------
  /* 这是最关键的一条：Node 的 simulate 和浏览器的主循环是两份独立的驱动代码，
   * 只有规则本身是一份。它们跑出不同的结局 = 至少一边在骗自己。
   * 时间容差给 0.5 s（浏览器是固定步累加 + 帧对齐，本来就有半帧差）。 */
  A.chk('两个执行器结局一致（都是 win）', last.res === ref.result,
    '浏览器 ' + last.res + ' vs Node ' + ref.result);
  A.chk('两个执行器终点位置一致（±0.3 m）',
    Math.abs(last.x - ref.car.x) < 0.3, last.x + ' vs ' + ref.car.x.toFixed(2));
  A.chk('两个执行器用时接近（±0.5 s）',
    Math.abs(last.t - ref.time) < 0.5, last.t + ' vs ' + ref.time.toFixed(2));

  A.chk('无 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '));

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
