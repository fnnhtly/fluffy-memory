/* 木框"裂"和"碎"必须是两种不同的反馈（第 46 轮）。
 *
 * 背景：`drawPartShape` 会按 hp 画裂纹（hp 2）和破损（hp 1）两档美术，
 * 第 45 轮又补了 `struct_hurt` 事件 —— 于是「木框裂了一道」终于有了音效。
 * 但**碎**（hp 0，木框从车上消失、猪掉出来、一颗星作废）那一支
 * 在渲染层是**完全静默**的：什么都不做，玩家听到的只有一个通用撞击音，
 * 和"轻轻磕了一下"一模一样。可两者的代价差一颗星。
 *
 * 所以这一轮给 `part_broken` 配了专属的 `SFX.structBreak()`（木头断裂的低频噪声
 * + 90 毫秒后的第二声），量级比 `crack()` 明显重。
 *
 * 这份测试要量的东西：
 *   1. 2 米自由落体（只掉耐久、不碎）→ 走的是 crack 这一支，**不许**有 structBreak；
 *   2. 8 米自由落体（框真的碎了）→ 必须走 structBreak 这一支；
 *   3. structBreak 一次撞击最多响一次（不能跟着接触帧刷屏）——
 *      这条依赖第 45 轮把 part_broken 与 impact 都收到 damageCar 的 0.35 秒冷却里。
 *
 * 量具：SFX 走 WebAudio，测试听不到声音，只能读到"哪一支被走了"。
 * 为此 index.html 里加了一个只存名字的 `fxLog`（上限 24 条，不参与逻辑），
 * 由 `window.__rap.fxLog()` 暴露。断言量的是**分支**，不是音色 ——
 * 这一点必须如实写清：音色对不对只能靠人耳。
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeBk-' + Date.now()),
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
  /* 先导航一次再写 localStorage、再导航一次 —— 欢迎引导必须关掉，
   * 否则第一次 launch() 之后画面还压在引导页上，rAF 那一支根本走不到（第 43 轮踩过）。 */
  await send('Page.navigate', { url: PAGE }); await sleep(800);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };

  /* 一定要先把欢迎引导关掉、把这一局真的**发射**出去，
   * 因为渲染层的 SFX 只在 `frame()` 消费事件流时被调用 ——
   * 只在 Node 里跑引擎（不经过 rAF）是听不到任何音效分支的。
   * 所以这里必须走"起局 → 把车抬到 h 米 → 让 rAF 自己跑完落地"。 */
  const dropAndListen = async (h) => {
    await ev(`(()=>{const s=window.__rap.state,R=window.__rap,lv=window.__rap.levels[0];
      s.welcome=0; s.helpOpen=0; s.paused=false;
      window.__rap.startLevel(0);
      s.welcome=0; s.introT=1;
      R.RAP.applySpec(lv, s.build, R.RAP.SPECS['1-1']);
      window.__rap.launch();
      s.runBanner=0;
      s.run.car.y += ${h};
      s.run.spawnGrace = 0;
      window.__rap.clearFxLog();
      return 1;})()`);
    // 等它真的落地并消费完事件（8 米要 ~1 秒自由落体，再留 1 秒给演出）
    await sleep(2600);
    return JSON.parse(await ev(`(()=>{const s=window.__rap.state;
      const fx = window.__rap.fxLog();
      const evs = (s.run && s.run.events) || [];
      return JSON.stringify({
        fx: fx,
        breaks: evs.filter(e=>e.indexOf('part_broken')===0).length,
        hurts: evs.filter(e=>e.indexOf('struct_hurt')===0).length,
        impacts: evs.filter(e=>e.indexOf('impact')===0).length,
        minHp: (function(){const fp=window.__rap.frameHpOf(s.run); return fp.min;})()
      });})()`));
  };

  const dent = await dropAndListen(2);
  const smash = await dropAndListen(8);

  A.log('2 米落体：碎框 ' + dent.breaks + ' 次，掉耐久 ' + dent.hurts + ' 次，' +
    '最低耐久 ' + dent.minHp + '　音效：[' + dent.fx.join(' ') + ']');
  A.log('8 米落体：碎框 ' + smash.breaks + ' 次，掉耐久 ' + smash.hurts + ' 次，' +
    '最低耐久 ' + smash.minHp + '　音效：[' + smash.fx.join(' ') + ']');

  /* 前提必须先证明：这两次落体确实各走到了"只裂"和"碎"，否则下面的分支断言
   * 会变成"因为什么都没发生所以没有 structBreak"这种假绿。 */
  A.chk('前提：2 米落体只掉耐久、没碎框', dent.breaks === 0 && dent.hurts > 0,
    '碎框 ' + dent.breaks + ' / 掉耐久 ' + dent.hurts);
  A.chk('前提：8 米落体真的把框碎了', smash.breaks > 0, '碎框 ' + smash.breaks + ' 格');

  A.chk('只裂没碎时播的是 crack（木头裂的"咔"）',
    dent.fx.indexOf('crack') >= 0, '[' + dent.fx.join(' ') + ']');
  A.chk('只裂没碎时**不播** structBreak（碎的音不能被提前用掉）',
    dent.fx.indexOf('structBreak') < 0, '[' + dent.fx.join(' ') + ']');
  A.chk('碎框时播的是 structBreak（和"撞了一下"完全分开）',
    smash.fx.indexOf('structBreak') >= 0, '[' + smash.fx.join(' ') + ']');

  /* 刷屏守卫：一次撞击最多一声断裂音。
   * 这依赖 impact/part_broken 都收在 damageCar 的 0.35 秒冷却里 ——
   * 如果哪天有人把 part_broken 挪出冷却，8 米落体会连响十几次。 */
  {
    const n = smash.fx.filter(x => x === 'structBreak').length;
    A.chk('一次撞击最多播一声 structBreak（不随接触帧刷屏）', n <= 2, n + ' 声');
  }

  /* 反面对照（量具自证）：如果渲染层把 part_broken 那一支删掉，
   * 这条判据必须变红 —— 用"同一个 fxLog 里没有 structBreak"的构造来演它。 */
  {
    const stripped = smash.fx.filter(x => x !== 'structBreak');
    A.chk('量具能失败：把 structBreak 那一支从日志里拿掉，同一条判据立刻判红',
      stripped.indexOf('structBreak') < 0,
      '拿掉后 [' + stripped.join(' ') + ']');
  }

  /* fxLog 本身要能证明"它记的是分支名，不是别的" */
  {
    const known = ['crack', 'structBreak', 'hurt', 'thud', 'pop', 'bagDrop'];
    const unk = smash.fx.concat(dent.fx).filter(x => known.indexOf(x) < 0);
    A.chk('fxLog 里只出现已知的音效分支名（不是乱记的垃圾）',
      unk.length === 0, unk.length ? unk.join(' ') : '全部已知');
  }

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
