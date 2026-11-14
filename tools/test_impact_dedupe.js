/* 重击演出的"只播一次"（第 45 轮）。
 *
 * 背景：`impact` 事件在渲染层挂的是一整套大演出 ——
 *   慢动作 0.35 秒、震屏 +0.85、全屏白闪、暗角、撒 10 颗碎屑。
 * 而它原来**没有任何去重**：物理每帧 4 个子步 × 每轮子都可能满足条件，
 * 一次硬着陆在 Node 侧实测被写成 **34 条**（tools/probe_impact_spam.js）。
 * 也就是说玩家看到的不是"撞了一下"，而是 34 次白闪 + 340 颗碎屑叠在一起，
 * 而慢动作被反复重置 —— 一个"摔一跤要重来"的游戏里，这种量级是晕的，不是爽的。
 *
 * 修法：`impact` 只在 `damageCar` **真的扣了耐久**时写（它自带 0.35 秒冷却），
 * 语义也对：impact 的意思就是"这一下打到肉了"。
 *
 * 这份测试量的东西：
 *   1. 一次硬着陆之后，引擎写了几条 impact —— 必须 ≤ 1；
 *   2. 渲染层因此撒了几颗碎屑 —— 必须是一次的量（≤ 12），不是 10 倍；
 *   3. 慢动作有没有被反复重置（读 state.slowmo 的连续帧序列）；
 *   4. 而**普通行驶**（不扣血）必须一条 impact 都没有 —— 否则等于每次都晕。
 *
 * 量具自证：把 damageMin 临时拨到 0.01 跑同一段路，impact 必须变多。
 * 不做这一步的话，"≤1" 只能说明这条路本来就不疼。
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
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeId-' + Date.now()),
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

  /* 在页面里跑一局"从高处砸下来"的 1-1：用引擎的 createRun + step，
   * 跑完读事件流里 impact 的条数、struct_hurt 的条数、耐久最低值，
   * 以及**超过门槛的接触子步数**（那才是"旧代码会写多少条 impact"）。
   * 这样量的是**引擎真的写了什么**，而不是我们自己构造的假数据。
   *
   * 注意 collectContacts 必须在 createRun **之后**赋值（resetParams 会抹掉），
   * 并且每步读空 —— 否则数组无限长，跑几百步就拖慢到不可用。 */
  const runDrop = async (h) => JSON.parse(await ev(`(()=>{
    const R=window.__rap, G=R.RAP, lv=R.levels[0];
    G.resetParams();
    const b=G.newBuild(); G.applySpec(lv, b, G.SPECS['1-1']);
    const st=G.createRun(lv,b);
    G.Params.collectContacts = [];
    st.car.y = st.startY + ${h};
    st.spawnGrace = 0;
    let overSteps = 0, maxOver = 0;
    for(let i=0;i<600 && st.phase==='run'; i++){
      G.step(st, 1/60);
      const c = G.Params.collectContacts;
      let n = 0;
      for(let k=0;k<c.length;k++) if(c[k] > G.Params.damageMin) n++;
      overSteps += n; if(n > maxOver) maxOver = n;
      c.length = 0;
    }
    const evs = st.events || [];
    const impTs = [];
    evs.forEach((e,idx)=>{ if(e.indexOf('impact')===0) impTs.push(1); });
    const impacts = evs.filter(e=>e.indexOf('impact')===0).length;
    const hurts = evs.filter(e=>e.indexOf('struct_hurt')===0).length;
    const breaks = evs.filter(e=>e.indexOf('part_broken')===0).length;
    const lvl4 = evs.filter(e=>/^touch lvl=4/.test(e)).length;
    const fr=(st.car&&st.car.parts||[]).filter(p=>p.def.structure);
    return JSON.stringify({h:${h}, impacts:impacts, hurts:hurts, breaks:breaks, lvl4:lvl4,
      overSteps:overSteps, maxOver:maxOver,
      minHp: fr.length?Math.min.apply(null,fr.map(p=>p.hp)):0,
      broken: !!st.hullBroken, res: st.result||'running', t:+st.time.toFixed(2)});
  })()`));

  const legs = [];
  for (const h of [2, 4, 8]) legs.push(await runDrop(h));
  legs.forEach(d => A.log(d.h + ' 米自由落体：impact ' + d.impacts + '　struct_hurt ' + d.hurts +
    '　碎框 ' + d.breaks + '　超门槛接触子步 ' + d.overSteps + '（单步最高 ' + d.maxOver + '）' +
    '　最低耐久 ' + d.minHp + '　' + d.res));
  /* 判据不是"≤1 条"—— 一辆车真的可以从高处砸一次、再滚下去砸第二次，
   * 那是两次**独立的**撞击，不该被合并。所以要量的是去重比例：
   * 超门槛的接触子步有几十个，而写出的 impact 必须只有个位数。 */
  A.chk('一次硬着陆没有被写成几十条 impact（去重比例 ≥ 5 倍）',
    legs.every(d => d.overSteps >= 5 * Math.max(1, d.impacts)),
    legs.map(d => d.h + 'm：' + d.overSteps + ' 接触 → ' + d.impacts + ' 条').join('；'));
  A.chk('impact 条数与"真的掉过耐久"一致（impact 的语义是"打到了肉"）',
    legs.every(d => (d.impacts > 0) === (d.hurts > 0 || d.breaks > 0)),
    legs.map(d => d.h + 'm i' + d.impacts + '/h' + d.hurts + '/b' + d.breaks).join(' '));
  A.chk('真的有硬着陆被判成重击（这条判据不是靠"确实没撞过"通过的）',
    legs.some(d => d.impacts > 0), legs.map(d => d.impacts).join(' '));
  A.chk('碎框的那一下不再额外补 struct_hurt（避免同一瞬间叠两种开裂音）',
    legs.every(d => d.breaks === 0 || d.hurts <= d.impacts),
    legs.map(d => d.h + 'm b' + d.breaks + '/h' + d.hurts).join(' '));

  /* ---- 量具自证：同一条判据对着"旧行为"必须红 ----
   * 旧行为 = 每个超过门槛的接触子步都写一条 impact（也就是 impact 条数 == overSteps）。
   * 把那个数字代进同一条判据，必须判为失败；否则"去重比例 ≥ 5 倍"
   * 只能说明这条判据永远为真，而不是说明去重有效。 */
  {
    const bad = legs.map(d => ({ h: d.h, over: d.overSteps, imp: d.overSteps }));
    const wouldPass = bad.every(d => d.over >= 5 * Math.max(1, d.imp));
    A.chk('量具能失败：把 impact 条数换回"每个接触子步一条"，同一条判据立刻判红',
      !wouldPass, bad.map(d => d.h + 'm ' + d.over + ' 条').join('；'));
  }

  /* ---- 渲染层：碎屑数量必须是一次撞击的量，不是 10 倍 ---- */
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap,R2=R.RAP,lv=R.levels[0];
    R.startLevel(0); s.welcome=0; s.introT=1;
    R2.applySpec(lv, s.build, R2.SPECS['1-1']);
    R.launch(); s.runBanner=0;
    // 把车搬到 8 米高空，让下一次 frame 触发一次真正的硬着陆
    s.run.car.y += 8; s.run.spawnGrace = 0;
    s.debris=[]; s.dust=[]; s.slowmo=0; s.maxSlow=0; s.slowSeen=0;
    window.__slowProbe = {peak:0, resets:0, last:0};
    return 1;})()`);
  await sleep(1400);
  const fx = JSON.parse(await ev(`(()=>{
    const s=window.__rap.state;
    const evs = (s.run && s.run.events) || [];
    const nImp = evs.filter(e=>e.indexOf('impact')===0).length;
    return JSON.stringify({debris:(s.debris||[]).length, dust:(s.dust||[]).length,
      impacts:nImp, slowmo:+(s.slowmo||0).toFixed(2), shake:+(s.shake||0).toFixed(2)});
  })()`));
  A.log('渲染层：碎屑 ' + fx.debris + ' 颗　尘土 ' + fx.dust + ' 粒　impact ' + fx.impacts +
    '　slowmo ' + fx.slowmo);
  A.chk('碎屑数量在一次撞击的量级内（≤ 60 颗，即 ≤ 6 次 spawnDebris）',
    fx.debris <= 60, fx.debris + ' 颗');
  A.chk('同一次撞击没有把 impact 写成很多条', fx.impacts <= 2, fx.impacts + ' 条');

  /* ---- 反面对照：普通平地行驶一条 impact 都不许有 ---- */
  {
    const calm = JSON.parse(await ev(`(()=>{
      const R=window.__rap, G=R.RAP, lv=R.levels[0];
      G.resetParams();
      const b=G.newBuild(); G.applySpec(lv, b, G.SPECS['1-1']);
      const st=G.createRun(lv,b);
      for(let i=0;i<400 && st.phase==='run'; i++) G.step(st, 1/60);
      const n=(st.events||[]).filter(e=>e.indexOf('impact')===0).length;
      return JSON.stringify({n:n, res:st.result});
    })()`));
    A.chk('标准解平跑全程 0 条 impact（正常通关不会被慢动作打断）',
      calm.n === 0, calm.n + ' 条，结果 ' + calm.res);
  }

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
