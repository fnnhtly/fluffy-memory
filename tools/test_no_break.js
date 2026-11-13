/* 「不散架 KRAK SNAP」这颗星：必须能真判失败，也必须能真判成功。
 *
 * 背景（docs/reference-badpiggies.md §2/§6）：参考里第三颗星最经典的就是
 * 「载具不散架、猪也没从载具里掉出来」。我们的木框耐久 3 段早就做了，
 * 却一直没人有理由去追求 —— 因为没有一颗星奖励"造得结实"。
 *
 * 这条测试要证明的是三件不同的事，缺一条这颗星就不可信：
 *   A. 正常通关且没碎 → 判成功（否则这颗星永远是灰的，等于没做）
 *   B. 真的撞碎了 → 判失败（否则这颗星白送）
 *   C. 「框好好的、猪却掉出来」→ 也判失败（参考原文对 KRAK SNAP 的要求是"两条都满足"）
 *
 * 第 C 条是最容易漏的：如果只判 hullBroken，玩家把猪放在最外层格子上、
 * 车翻滚时猪被甩出去，仍然会拿到这颗星 —— 那就完全背离了参考的设计意图。
 * 所以这里**直接构造**两种坏状态，不依赖"某一关恰好能撞碎"。
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
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeKb-' + Date.now()),
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
  await send('Runtime.evaluate', { expression: "localStorage.clear(); localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1100);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };

  // ---- 前置：1-1 现在挂的是 noBreak ----
  const ch1 = JSON.parse(await ev(`(()=>{const l=window.__rap.levels[0];
    return JSON.stringify({type:(l.challenge||{}).type});})()`));
  A.chk('1-1 的第三颗星是「不散架」', ch1.type === 'noBreak', ch1.type);

  // ---- A. 正常通关（不碎）→ 这颗星必须亮 ----
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[0];
    window.__rap.startLevel(0); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-1']);
    window.__rap.launch(); s.runBanner=0; return 1;})()`);
  let done = false;
  for (let i = 0; i < 250; i++) {
    await sleep(200);
    if ((await ev('window.__rap.state.phase')) === 'resolved') { done = true; break; }
  }
  A.chk('1-1 跑到结算', done);
  const info = JSON.parse(await ev(`(()=>{const r=window.__rap.state.run;
    return JSON.stringify({res:r.result,stars:r.stars,goals:r.starGoals,
      hullBroken:r.hullBroken,pigEjected:r.pigEjected});})()`));
  A.log('1-1：' + info.res + ' ' + JSON.stringify(info.goals) +
    '（碎=' + info.hullBroken + ' 猪弹出=' + info.pigEjected + '）');
  A.chk('正常通关时结构没碎', info.hullBroken === false);
  A.chk('正常通关时猪没被弹出去', info.pigEjected === false);
  A.chk('正常通关 → 「不散架」星点亮', info.goals && info.goals.challenge === true);
  A.chk('1-1 现在能拿满三星（accumulate 里 3 个标记全亮）', info.stars === 3, info.stars + ' 星');

  // ---- B/C. 构造两种坏状态，直接调 challengePass ----
  //    不依赖"某一关恰好撞得碎"——高度场地形里其实很难撞碎，这一点要如实说。
  const bad = JSON.parse(await ev(`(()=>{
    const R=window.__rap, lv=R.levels[0], G=R.RAP;
    const mk=(flags)=>{
      const b=G.newBuild(); G.applySpec(lv, b, G.SPECS['1-1']);
      const st=G.createRun(lv,b);
      Object.assign(st, flags);
      return st;
    };
    return JSON.stringify({
      good: R.RAP.challengePass(mk({})),
      broken: R.RAP.challengePass(mk({hullBroken:true})),
      ejected: R.RAP.challengePass(mk({pigEjected:true})),
      both: R.RAP.challengePass(mk({hullBroken:true,pigEjected:true}))
    });})()`));
  A.log('四种状态：完好=' + bad.good + ' 框碎=' + bad.broken +
    ' 猪弹出=' + bad.ejected + ' 两者=' + bad.both);
  A.chk('完好 → 判成功', bad.good === true);
  A.chk('木框碎了 → 判失败（这颗星不是白送的）', bad.broken === false);
  A.chk('猪被弹出载具 → 也判失败（只判木框会漏掉这种情况）', bad.ejected === false);
  A.chk('两者都发生 → 判失败', bad.both === false);

  // ---- 真的碎一次：把车抬到 20 米再自由落体 ----
  //    顺便量一下"要摔多狠才碎"，这决定了这颗星是难还是不可能。
  const drop = JSON.parse(await ev(`(()=>{
    const R=window.__rap, lv=R.levels[0], G=R.RAP;
    const out=[];
    [2,4,8,16,30].forEach(h=>{
      const b=G.newBuild(); G.applySpec(lv, b, G.SPECS['1-1']);
      const st=G.createRun(lv,b);
      st.car.y = st.startY + h;
      st.spawnGrace = 0;
      for(let i=0;i<600 && st.phase==='run'; i++) G.step(st, 1/60);
      const frames = st.car ? st.car.parts.filter(p=>p.def.structure) : [];
      out.push({h:h, broken:st.hullBroken, minHp:frames.length?Math.min.apply(null,frames.map(p=>p.hp)):0,
                res:st.result});
    });
    return JSON.stringify(out);})()`));
  drop.forEach(d => A.log(d.h + ' 米自由落体 → ' + (d.broken ? '碎了' : '没碎') +
    '，框最低耐久 ' + d.minHp + '，结果 ' + (d.res || '仍在跑')));
  A.chk('真的摔得够狠时木框会碎（hullBroken 这条管线是活的）',
    drop.some(d => d.broken), drop.map(d => d.h + 'm:' + d.broken).join(' '));

  // ---- D. 行驶期状态条要能显示这颗星的状态 ----
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[0];
    window.__rap.startLevel(0); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-1']);
    window.__rap.launch(); s.runBanner=0; return 1;})()`);
  await sleep(400);
  const csOk = JSON.parse(await ev(`(()=>{
    const R=window.__rap;
    return JSON.stringify({a:R.challengeStatus(R.state.run),
      b:R.challengeStatus(Object.assign({}, R.state.run, {hullBroken:true}))});})()`));
  A.chk('状态条认得出「不散架」这个类型（不是 default 的"本关没有"）',
    csOk.a.type === 'noBreak', csOk.a.type + ' / ' + csOk.a.label);
  A.chk('结构完好时状态条显示满足', csOk.a.pass === true, csOk.a.value);
  A.chk('木框碎了时状态条显示不满足', csOk.b.pass === false, csOk.b.value);

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
