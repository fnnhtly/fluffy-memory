/* 关卡数据的 schema 校验（tools/build_levels_js.js 与测试共用同一份）
 *
 * 为什么抽成模块：校验逻辑必须能被**喂假数据**去证明它会失败。
 * 只跑一遍真数据、全绿，什么都不能说明 —— 它可能只是一段永远返回空数组的代码。
 */

/* 关卡数据的 schema。新增字段必须先登记在这里，否则校验会拒绝它。
 * 和 tools/audit_level_fields.js 的 EXPECTED 是同一份语义：
 *   那边查"每个字段有没有读者"（死字段会掉耐久），
 *   这边查"每个字段有没有登记"（拼错的字段名会在出口被拦下）。 */
const SCHEMA = {
  required: ['levelId', 'name', 'biome', 'grid', 'start', 'goal', 'partsBox',
    'mapRows', 'materials', 'boxes', 'challenge', 'timeLimit'],
  /* `barriers`（第 71 轮）：雷屏障。`[{ col, h }]` = 在第 col 列立一道
   * 从地面往上 h 米高的墙，只有冲刺状态穿得过。
   * 它必须登记在这里 —— 否则关卡文件写了它，出口会拒绝生成 levels.js。 */
  optional: ['hardCols', 'barriers'],
  /* 这些是**第二份真相**：真正的值写在代码里，数据里再出现一份就会说假话。
   *   buildArea              → game.js 的 BUILD_COLS=6 / BUILD_ROWS=8
   *   physics                → game.js 的 Params.gravity / subSteps / frictionAt
   *   grid.cell / grid.px    → game.js 的 CELL=1.0 / index.html 的 PPM=32
   *   start.row / goal.row   → 只用 col，row 从来没被读
   *   materials[].surfaceRow → 每列地表行从 mapRows 数出来
   *   chapter / note         → 没有读者（chapterDone 判的是"六关都到过终点"） */
  forbidden: ['buildArea', 'physics', 'chapter', 'note'],
  nested: {
    grid: ['cols', 'rows'],
    start: ['col'],
    goal: ['col'],
    materials: ['cols', 'type'],
    barriers: ['col', 'h']
  }
};

/* @param levels  [{levelId, ...}]  已解析的关卡对象数组
 * @param tagOf   可选，把下标变成文件名（默认用 levelId）
 * @returns 问题字符串数组；空数组 = 通过 */
function validate(levels, tagOf) {
  const problems = [];
  levels.forEach((lv, i) => {
    const tag = tagOf ? tagOf(i, lv) : `（${lv.levelId || '?'}）`;

    SCHEMA.forbidden.forEach(k => {
      if (lv[k] !== undefined) problems.push(`${tag}: 有禁止的字段 ${k}（第二份真相，真正的值在代码里）`);
    });
    const keys = Object.keys(lv);
    keys.filter(k => !SCHEMA.required.includes(k) && !SCHEMA.optional.includes(k))
      .forEach(k => problems.push(`${tag}: 没登记的字段 ${k}（要先在 SCHEMA 里登记并给它一个读者）`));
    SCHEMA.required.filter(k => lv[k] === undefined)
      .forEach(k => problems.push(`${tag}: 缺必填字段 ${k}`));

    Object.keys(SCHEMA.nested).forEach(parent => {
      const allow = SCHEMA.nested[parent];
      const v = lv[parent];
      if (v === undefined) return;
      const items = Array.isArray(v) ? v : [v];
      items.forEach((item, idx) => {
        Object.keys(item).filter(k => !allow.includes(k))
          .forEach(k => problems.push(
            `${tag}: ${parent}${Array.isArray(v) ? '[' + idx + ']' : ''} 里有多余字段 ${k}（只允许 ${allow.join('/')}）`));
      });
    });
  });
  return problems;
}

module.exports = { SCHEMA, validate };
