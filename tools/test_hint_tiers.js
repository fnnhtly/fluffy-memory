/* 「提示写到第 4 层，但界面只让翻到第 3 层」（第 79 轮）。
 *
 * ── 现象 ──
 *
 * `HINTS` 里 1-3 / 1-5 / 1-7 / 1-8 各有 **4 层**提示，而界面把层数写死在 2（即第 3 层）：
 *
 *   index.html:1471   state.hintTier = Math.min(2, state.hintTier + 1);
 *   index.html:4181   const tier = Math.min(state.hintTier, 2);
 *   index.html:4211   for (let i = 0; i < 3; i++)     // 只画 3 个点
 *   index.html:4221   const canMore = state.hintTier < 2;
 *
 * 于是那四关的第 4 层提示**永远显示不出来** —— 而第 4 层恰好是最具体的一条
 * （"成品：……"），也就是玩家最需要的那一条。
 *
 * ── 判据 ──
 *
 *   A 每一关的提示层数都能被**翻到最后一层**（点够次数之后 `hintFor` 返回最后一条）
 *   B 层数点在卡片上画得出来（点数 == 该关层数，不是写死 3）
 *   C 已经是最后一层时，卡片**不再说**"再点一次看下一层"
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const PORT = 9750 + Math.floor(Math.random() * 60);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeHintTier-' + Date.now()),
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
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(1100);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const errs = [];
  ws.addEventListener('message', e2 => {
    try { const m = JSON.parse(e2.data);
      if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text);
    } catch (e) {}
  });
  const ev = async e => {
    const r = await send('Runtime.evaluate',
      { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('页面求值异常：' + (d.exception && d.exception.description || d.text));
    }
    return r.result.value;
  };

  await ev('(()=>{const t=window.__rap.state; t.welcome=0; t.introT=1; return 1;})()');
  await sleep(320);

  // ═════════════ A 每关都能翻到最后一层 ═════════════
  {
    /* ⚠ 第一版这个循环是错的：它自己模拟"点 N 次"，
     * 却仍然用 `Math.min(2, ...)` —— 也就是说它量的是**测试里写死的上限**，
     * 不是页面里的上限。于是产品改好之后它照样红，红得毫无意义。
     *
     * 现在直接走页面自己的函数：`hintTierCount`（界面画层数点用的是它）
     * 和 `hintFor`（卡片正文用的是它）。两者同源才是这条判据的意义。 */
    const data = JSON.parse(await ev(`(()=>{
      const R = window.__rap, out = [];
      R.levels.forEach((lv, i) => {
        const H = R.HINTS[lv.levelId] || [];
        const n = R.hintTierCount(lv);
        R.startLevel(i);
        /* 模拟"一直点提示"：每次 +1，上限由页面自己决定 */
        let tier = 0;
        for (let k = 0; k < 8; k++) tier = Math.min(R.hintTierCount(R.level()) - 1, tier + 1);
        const shown = R.hintFor(lv, tier);
        out.push({ id: lv.levelId, layers: H.length, count: n, tierAfter: tier,
          shown: shown, last: H[H.length - 1] || '' });
      });
      return JSON.stringify(out);})()`));
    data.forEach(d => {
      A.chk('A ' + d.id + ' 能翻到最后一层（写 ' + d.layers + ' 层，界面给 ' + d.count +
        ' 层，翻到第 ' + (d.tierAfter + 1) + ' 层）',
        d.shown === d.last && d.count === d.layers,
        '显示「' + String(d.shown).slice(0, 22) + '…」');
    });
  }

  // ═════════════ B 卡片上的层数点 == 该关层数 ═════════════
  {
    /* 直接问页面：某关的提示层数点数（画出来几个点）。
     * 页面如果没有导出这个量，就退回到"读 HINTS 长度"。 */
    const counts = JSON.parse(await ev(`(()=>{
      const R = window.__rap, out = [];
      R.levels.forEach(lv => {
        out.push({ id: lv.levelId,
          layers: (R.HINTS[lv.levelId] || []).length,
          dots: R.hintTierCount ? R.hintTierCount(lv) : 3 });
      });
      return JSON.stringify(out);})()`));
    const bad = counts.filter(c => c.dots !== c.layers);
    A.chk('B 提示卡画的层数点和该关实际层数一致（不是写死 3）', bad.length === 0,
      bad.length ? bad.map(c => c.id + ' 点 ' + c.dots + '≠层 ' + c.layers).join(', ') : '全部一致');
  }

  // ═════════════ C 最后一层不再说"再点一次" ═════════════
  {
    await ev(`(()=>{const R=window.__rap, S=R.state;
      R.startLevel(6); S.welcome=0; S.introT=1; S.phase='build'; S.run=null;
      S.hintOpen = true;
      S.hintTier = (R.hintTierCount ? R.hintTierCount(R.level()) : 3) - 1;
      return 1;})()`);
    await sleep(400);
    const cardText = await ev(`(()=>{
      /* 把这一帧里所有 fillText 抓下来 */
      const shown = [];
      const orig = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t) {
        shown.push(String(t)); return orig.apply(this, arguments);
      };
      window.__grab = () => { CanvasRenderingContext2D.prototype.fillText = orig; return shown; };
      return 'hooked';})()`);
    void cardText;
    await sleep(240);
    const texts = JSON.parse(await ev('JSON.stringify(window.__grab ? window.__grab() : [])'));
    const hasMore = texts.some(t => t.indexOf('再点一次') >= 0);
    A.chk('C 已在最后一层时，卡片不再说"再点一次看下一层"', !hasMore,
      hasMore ? '仍然写着「再点一次…」' : '正确显示"已经是最后一层"');
  }

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });
