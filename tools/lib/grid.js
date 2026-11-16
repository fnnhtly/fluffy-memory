/* 建造网格的几何 —— **全项目唯一一份**，测试不许再各抄一遍。
 *
 * ── 为什么必须抽出来（第 65 轮）──
 *
 * 第 64 轮把拼装网格从「屏幕居中的固定面板」改成「世界锚定」之后，
 * 一口气红了 10 个脚本。它们红的姿势一模一样：脚本开头读一次
 * `buildOrigin()` / `BUILD_PX`，之后所有点击都用这一份缓存算。
 *
 * 而 `buildOrigin()` **不是常量，它会动**：
 *
 *   buildAnchorWorld() 里 startY = surfaceY - lowest + 0.01，
 *   而 lowest 取的是「车上最低那个轮子的下沿」（没有轮子时退化成 0.5）。
 *   于是**放下第一个轮子**的那一瞬间，锚点整体抬起
 *   (0.5 + 0.34) = 0.84 米；实测在 1-1 且 zoom≈1.27 时是 95 像素。
 *   网格在屏幕上真的跳了一下 —— 这是世界锚定的必然后果（锚点是"车要出生的
 *   那个地方"，而车的高度取决于它有几个轮子）。
 *
 * 所以任何"先读几何、再放零件、再点格子"的脚本，只要中间放下了轮子，
 * 后面所有坐标就全部作废。这不是测试写得粗心，是**缓存的量本身是活的**。
 *
 * ── 本文件的约定 ──
 *
 *   1. 所有取几何的函数都是 async，**每次现读**页面里的那一份。
 *      没有"读一次存起来"的入口 —— 那个入口就是 10 个假红的来源。
 *   2. 公式只写在这里。`cellOf()` 是唯一的换算，
 *      渲染层用 buildOrigin() + px，这里也用 buildOrigin() + px，同一个来源。
 *   3. `place()` 会先确认零件真的被选中了再点格子。原因见 ensureSelected()：
 *      产品有一条「点已选中的托盘格 = 取消选中」的规则（第 64 轮用户要求），
 *      于是"连点两次同一个托盘格"= 选上又取消，第二次的落子什么都不会发生。
 *      玩家要放两块木框时是"点一次托盘、点两格"，不是"点两次托盘"。
 *
 * 用法（每个脚本自己已经有 ev / click，传进来即可）：
 *
 *     const grid = require('./lib/grid');
 *     const G = grid.make(ev, click);        // click(设计x, 设计y)
 *     await G.place('wood_frame', 4, 1);
 *     const p = await G.cell(4, 2);          // 每格现算
 *     await click(p.x, p.y);
 *
 * `ev` 必须满足：传一段表达式，拿回它的值（字符串/数字/布尔）。
 */

const PPM = 32;          // 1 米 = PPM 像素（和 index.html 里的 PPM 同值）

/* 读当前网格几何：左上角 (x,y) + 一格边长 px。
 * 直接读页面里 buildOrigin() 的返回值 —— 不重算锚点，那是产品的事。 */
async function geo(ev) {
  const raw = await ev(
    '(()=>{const o=window.__rap.buildOrigin();' +
    'return JSON.stringify({x:o.x,y:o.y,px:o.px});})()'
  );
  if (typeof raw !== 'string') throw new Error('buildOrigin 读不到几何：' + raw);
  const g = JSON.parse(raw);
  if (!(g.px > 0)) throw new Error('buildOrigin 给出的格边长不合理：' + g.px);
  return g;
}

/* 唯一的格心换算。g 必须**刚读到**的那一份。 */
function cellOf(g, r, c) {
  return { x: g.x + c * g.px + g.px / 2, y: g.y + r * g.px + g.px / 2 };
}

function make(ev, click) {
  const G = { PPM, cellOf };

  /* 现读几何（已绑定 ev）。这是本文件存在的理由，别加缓存。 */
  G.geo = () => geo(ev);

  /* 格心 —— 每次现读几何。 */
  G.cell = async (r, c) => cellOf(await geo(ev), r, c);

  /* 网格外的一个点（用于"拖出网格 = 卸下"）。
   * side: 'left' | 'bottom'。网格左侧一律取 ox-140（ox 恒为 BUILD_CLEAR_X=168，
   * 所以 x 稳定在 28，一定落在 c<0 的区域）；纵向跟着锚点走，所以现读。 */
  G.out = async (side) => {
    const g = await G.geo();
    if (side === 'bottom') return { x: cellOf(g, 3, 3).x, y: g.y + 8 * g.px + 60 };
    return { x: g.x - 140, y: g.y + g.px * 2 };
  };

  G.trayRect = async (i) => {
    const r = await ev('JSON.stringify(window.__rap.trayRect(' + i + '))');
    if (typeof r !== 'string' || r === 'null') throw new Error('trayRect(' + i + ') 没有返回矩形');
    return JSON.parse(r);
  };

  G.trayNames = async () => {
    const t = await ev('JSON.stringify(window.__rap.TRAY)');
    return JSON.parse(t);
  };

  /* 托盘索引**按名字查**，不写死数字：零件表加一件，写死的下标就会指向别的零件
   * （第 63 轮气球从 6 号变成 8 号，test_lift_ui 里写死的 tray[6] 变成了螺旋桨）。 */
  G.trayIndex = async (part) => {
    const names = await G.trayNames();
    const i = names.indexOf(part);
    if (i < 0) throw new Error('托盘里没有零件 ' + part + '（有：' + names.join(',') + '）');
    return i;
  };

  G.tray = async (part) => {
    const r = await G.trayRect(await G.trayIndex(part));
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  };

  /* 按钮中心。没有这个按钮时**抛出**而不是返回 null ——
   * 返回 null 的后果是调用方算出一个 NaN 坐标然后静默点空，
   * 看起来像"产品没反应"，实际是测试在问一个不存在的按钮。 */
  G.btn = async (name) => {
    const r = await ev('JSON.stringify(window.__rap.btnRect(' + JSON.stringify(name) + '))');
    if (typeof r !== 'string' || r === 'null') {
      const ph = await ev('window.__rap.state.phase');
      throw new Error('btnRect(' + name + ') 返回 null —— 当前 phase=' + ph + ' 没有这个按钮');
    }
    const q = JSON.parse(r);
    return { x: q.x + q.w / 2, y: q.y + q.h / 2 };
  };

  G.rect = async (name) => {
    const r = await ev('JSON.stringify(window.__rap.btnRect(' + JSON.stringify(name) + '))');
    if (typeof r !== 'string' || r === 'null') {
      const ph = await ev('window.__rap.state.phase');
      throw new Error('btnRect(' + name + ') 返回 null —— 当前 phase=' + ph + ' 没有这个按钮');
    }
    return JSON.parse(r);
  };

  /* 选中某个零件，且**保证点完之后它是选中的**。
   *
   * 产品的规则（index.html selectPart，第 64 轮用户要求）：
   *   · 点一个**已经选中且是玩家自己点的**托盘格 → 取消选中（selected=null）；
   *   · 开局预置的默认零件（selectedByUser=false）第一次点 = 确认选中。
   *
   * 所以"点托盘"不是幂等的。这里先读一遍实际状态：
   *   · 已经选中的（且是玩家点出来的）→ 什么都不做，直接返回 false；
   *   · 否则点一次，并**回读确认**。
   * 回读这一步是必要的：取消选中之后点格子 `dragPart` 是 null，
   * 落子分支根本不会进 —— 症状是"点了但什么都没有"，和坐标点偏一模一样。 */
  G.ensureSelected = async (part) => {
    const raw = await ev('(()=>{const S=window.__rap.state;' +
      'return JSON.stringify({sel:S.selected,by:!!S.selectedByUser});})()');
    const s = JSON.parse(raw);
    if (s.sel === part && s.by) return false;
    const t = await G.tray(part);
    await click(t.x, t.y);
    const after = await ev('window.__rap.state.selected');
    if (after !== part) {
      throw new Error('点托盘之后 selected 是 ' + after + '，不是 ' + part +
        '（托盘几何或预算拦截？）');
    }
    return true;
  };

  /* 放一个零件：确保选中 → **现读**格心 → 点下去。
   * 放完之后不校验结果 —— 那是调用方断言的事，helper 不替测试报喜。 */
  G.place = async (part, r, c) => {
    await G.ensureSelected(part);
    const p = await G.cell(r, c);
    await click(p.x, p.y);
    return p;
  };

  /* 点一下格心（不改变选中状态）。用于"再点一次叠上去 / 旋转 / 橡皮擦"。 */
  G.clickCell = async (r, c) => {
    const p = await G.cell(r, c);
    await click(p.x, p.y);
    return p;
  };

  /* 点一个格子中心，但**先把鼠标移过去**再按下 —— 有些分支（R 旋转）
   * 读的是 state.mouse，而不是 mousedown 的坐标。这是产品的真实行为：
   * 键盘操作作用在"光标悬停的格子"上。 */
  G.hoverCell = async (r, c) => {
    const p = await G.cell(r, c);
    await ev('window.__rap.state.mouse.x=' + p.x + ';window.__rap.state.mouse.y=' + p.y);
    return p;
  };

  return G;
}

module.exports = { PPM, geo, cellOf, make };
