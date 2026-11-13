"""方向机制：带 `dir` 的零件（推进/喷气类）在组装期用箭头表示朝向，可切换。
- 打气筒成为第一个方向件（喷出方向 = 它自己的朝向，而不是车头）
- 点已放的方向件 = 旋转（和右键 / R 等效）
- 物理：释放冲量沿"s 零件朝向 × 车体旋转"
"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")

# 1) 打气筒是方向件
s = s.replace("    pump: { label: '打气筒', mass: 0.8, interactive: true, color: '#4f8fb0' },",
              "    pump: { label: '打气筒', mass: 0.8, interactive: true, dir: true, thrust: 6.0, color: '#4f8fb0' },")

# 2) 方向向量（0=右 1=上 2=左 3=下），并暴露给渲染
s = s.replace("  function isInnerPart(part) {",
"""  var DIRV = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  function dirVec(dir) { return DIRV[(dir || 0) % 4]; }
  function isDirectional(part) { return !!(PARTS[part] && PARTS[part].dir); }

  function isInnerPart(part) {""")

# 3) 点已放的同款方向件 → 旋转
s = s.replace("""    if (build.cells[key]) return { ok: false, reason: 'occupied' };""",
"""    if (build.cells[key]) {
      var there = build.cells[key];
      // 点已经放好的同类方向件 = 切换朝向（组装期最直观的"箭头转动"方式）
      if (there.part === part && isDirectional(part)) {
        there.dir = ((there.dir || 0) + 1) % 4;
        return { ok: true, rotated: true, dir: there.dir };
      }
      return { ok: false, reason: 'occupied' };
    }""")

# 4) 释放冲量沿零件朝向
s = s.replace("""  function releaseInteract(state, n) {
    if (state.phase !== 'run') return false;
    var car = state.car;
    var part = car.interactives[n - 1];
    if (!part) return false;
    var c = Math.max(0, Math.min(1, car.pumpCharge / 0.8));
    var dv = Params.pumpImpulse * (0.35 + 0.65 * c);
    car.vx += dv * Math.cos(car.a);
    car.vy += dv * Math.sin(car.a) * 0.4;
    car.w += 1.2 * (0.4 + 0.6 * c);""",
"""  function releaseInteract(state, n) {
    if (state.phase !== 'run') return false;
    var car = state.car;
    var part = car.interactives[n - 1];
    if (!part) return false;
    var def = PARTS[part];
    var c = Math.max(0, Math.min(1, car.pumpCharge / 0.8));
    var dv = Params.pumpImpulse * (0.35 + 0.65 * c);
    // 冲量方向 = 零件朝向（0=右 1=上 2=左 3=下），再叠加车体旋转
    var host = car.parts.filter(function (p) { return p.part === part && !p.inner; })[0];
    var v = dirVec(host ? host.dir : 0);
    var ca = Math.cos(car.a), sa = Math.sin(car.a);
    var wx = v[0] * ca - v[1] * sa;
    var wy = v[0] * sa + v[1] * ca;
    car.vx += dv * wx;
    car.vy += dv * wy;
    car.w += 1.2 * (0.4 + 0.6 * c) * (v[0] >= 0 ? 1 : -1);""")

# 5) 暴露
s = s.replace("  var RAP = {\n    canLaunch: canLaunch,",
              "  var RAP = {\n    canLaunch: canLaunch,\n    dirVec: dirVec,\n    isDirectional: isDirectional,")
g.write_text(s, encoding="utf-8")
print("game.js: 方向机制 + 点已放件旋转 + 冲量随朝向")
