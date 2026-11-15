/* 打通六关之后，游戏必须承认这件事。
 *
 * 第 40 轮实测（probe_chapter_end.js）：把 1-1~1-6 全部跑到三星之后，
 * 屏幕上关于"终局"的唯一表达是结算卡右下角一颗**灰掉的**「已是最后一关」。
 * 玩家不知道自己是不是打完了、后面还有没有、这 18 颗星算不算数。
 *
 * 这和"第三颗星变成惩罚"是同一类错误：**内容做完了，却没有收束。**
 *
 * 这条测试守四件事：
 *   1) 六关打通后，1-6 结算卡上有"整章通关"这一句；
 *   2) 那颗死按钮变成真按钮「章节总览」，键帽是 L（不是 N —— N 没有下一关可去，
 *      键帽上不写的事就不能偷偷做）；
 *   3) 点它 / 按 L 都能打开选关页（画面和判定是同一份几何）；
 *   4) 没有打通六关时**不准**出现"整章通关"（否则它是句骗人的话）。
 *
 * 第 4 条是关键：只测"该出现时出现"会漏掉"不该出现时也出现" ——
 * 那才是这类文案最容易犯的错。
 */
const A = require('./lib/asserts');
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

const PATCH = `(() => {
  if (window.__audit) return 'already';
  const C = CanvasRenderingContext2D.prototype;
  const oText = C.fillText, oClear = C.clearRect;
  window.__audit = { recs: [] };
  C.clearRect = function () { window.__audit.recs = []; return oClear.apply(this, arguments); };
  C.fillText = function (txt) { window.__audit.recs.push(String(txt)); return oText.apply(this, arguments); };
  return 'patched';
})()`;

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeCH2-' + Date.now()),
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
  await send('Runtime.evaluate', { expression:
    "localStorage.setItem('rap-welcomed-v1','1');localStorage.removeItem('rap-progress-v1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); };
  async function key(k, code, keyCode) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: code, windowsVirtualKeyCode: keyCode });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: code, windowsVirtualKeyCode: keyCode });
    await sleep(320);
  }
  await ev(PATCH);
  await ev('window.__rap.state.introT=1');
  await sleep(250);

  const recsNow = async () => JSON.parse(await ev('JSON.stringify(window.__audit.recs)'));
  const has = (list, sub) => list.some(t => t.indexOf(sub) >= 0);

  // ---------- A. 只打通 1-6（其余关没通）→ 不许说"整章通关" ----------
  await ev('window.__rap.launchSpec(5, "1-6")');
  let done6 = false;
  for (let i = 0; i < 150; i++) {
    await sleep(200);
    if (await ev('window.__rap.state.run && window.__rap.state.run.result')) { done6 = true; break; }
  }
  A.chk('1-6 真跑到了结算', done6);
  await sleep(3400);        // 等回放 + 卡片滑入
  const r1 = await recsNow();
  A.chk('只通了 1-6 时，卡上不出现「整章通关」', !has(r1, '整章通关'),
    has(r1, '整章通关') ? '出现了 —— 玩家会被骗' : '');
  const nb1 = JSON.parse(await ev('JSON.stringify(window.__rap.resultNextBtn())'));
  A.chk('只通了 1-6 时，右按钮仍是灰色的「已是最后一关」',
    nb1.label === '已是最后一关' && nb1.disabled === true, JSON.stringify(nb1));
  await shot('ce-01-not-yet');

  // ---------- B. 六关全通 → 必须承认 ----------
  await ev('window.__rap.state.phase="build"; window.__rap.state.run=null');
  await sleep(200);
  const others = [[0, '1-1'], [1, '1-2'], [2, '1-3'], [3, '1-4i'], [4, '1-5n']];
  for (const [idx, spec] of others) {
    await ev(`window.__rap.launchSpec(${idx}, '${spec}')`);
    for (let i = 0; i < 150; i++) {
      await sleep(200);
      if (await ev('window.__rap.state.run && window.__rap.state.run.result')) break;
    }
  }
  const cleared = await ev('window.__rap.levels.every(function(l){return !!window.__rap.readRecord(l.levelId);})');
  A.chk('六关都有存档记录（前提成立）', cleared === true, String(cleared));

  // 回到 1-6 的结算：再跑一遍（这一遍会是"全章已通"的状态）
  await ev(`(()=>{const s=window.__rap.state; s.phase='build'; s.run=null; return 1;})()`);
  await sleep(200);
  await ev('window.__rap.launchSpec(5, "1-6")');
  for (let i = 0; i < 150; i++) {
    await sleep(200);
    if (await ev('window.__rap.state.run && window.__rap.state.run.result')) break;
  }
  await sleep(3400);
  const r2 = await recsNow();
  A.chk('六关全通后，1-6 结算卡上出现「整章通关」', has(r2, '整章通关'),
    has(r2, '整章通关') ? '' : '卡上：' + r2.join(' | '));
  /* 说清"总共几颗星"。两种写法都合格：
   *   · 全亮时：'六关 N 颗星全亮'
   *   · 还有星没补时：'全章 ★ got / tot'
   * 旧断言只认「颗星」两个字，而这一轮跑出来的是**未满星那条分支**
   * （`★ 15 / 18` 不含"颗星"），于是永远红 —— 但信息一点都不缺。
   * 判据改成"必须出现总数"，两种格式都算。 */
  const starLine = r2.filter(t => /颗星|★\s*\d+\s*\/\s*\d+/.test(t)).join(' ');
  A.chk('并说明总共几颗星（不发明新指标）',
    /颗星/.test(starLine) || /★\s*\d+\s*\/\s*\d+/.test(starLine),
    starLine || '没找到星星总数那一行');
  const nb2 = JSON.parse(await ev('JSON.stringify(window.__rap.resultNextBtn())'));
  A.chk('右按钮变成「章节总览」且可点',
    nb2.label === '章节总览' && nb2.disabled === false, JSON.stringify(nb2));
  A.chk('键帽是 L 而不是 N（N 没有下一关可去）', nb2.keycap === 'L', String(nb2.keycap));
  await shot('ce-02-chapter-done');

  // 点它 → 选关
  const br = JSON.parse(await ev(`(()=>{const r=window.__rap.btnRect('next');
    return JSON.stringify({x:r.x+r.w/2,y:r.y+r.h/2});})()`));
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: br.x, y: br.y, button: 'none' });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: br.x, y: br.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: br.x, y: br.y, button: 'left', clickCount: 1 });
  await sleep(400);
  A.chk('点「章节总览」真的打开选关页',
    (await ev('window.__rap.state.levelSelect')) === true,
    'levelSelect=' + (await ev('window.__rap.state.levelSelect')));
  await key('Escape', 'Escape', 27);
  A.chk('Esc 能关掉', (await ev('window.__rap.state.levelSelect')) === false);

  // L 键也开（选关本来就是 L，这里只确认没被结算分支吃掉）
  await key('l', 'KeyL', 76);
  A.chk('结算页按 L 也能开选关', (await ev('window.__rap.state.levelSelect')) === true);
  await key('Escape', 'Escape', 27);

  A.chk('无 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '));
  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
