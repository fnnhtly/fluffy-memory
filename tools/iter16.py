"""补"发射守卫"：没放小猪不许发射（和 v1.0 的 launch_blocked 一致），并把用例补齐小猪。"""
import pathlib

# 1) game.js 加 canLaunch
g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")
s = s.replace("""  function buildVehicle(level, build) {""",
"""  // 发射守卫：至少要有 1 个结构件 + 1 个轮子 + 1 只小猪（在木框里）
  function canLaunch(build) {
    var car = buildVehicle(null, build);
    if (!car) return { ok: false, reason: 'empty' };
    if (!car.parts.some(function (p) { return p.def.structure; })) return { ok: false, reason: 'frame' };
    if (!car.wheels.length) return { ok: false, reason: 'wheel' };
    if (!car.hasPig) return { ok: false, reason: 'pig' };
    return { ok: true, reason: '' };
  }

  function buildVehicle(level, build) {""")
s = s.replace("""  var RAP = {
    PARTS: PARTS,""",
"""  var RAP = {
    canLaunch: canLaunch,
    PARTS: PARTS,""")
# buildVehicle 里用到 level 的地方只有 partsBox（不读），传 null 安全
g.write_text(s, encoding="utf-8")
print("game.js: canLaunch 守卫")

# 2) index.html 用守卫
p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")
t = t.replace("""  function launch() {
    const car = RAP.buildVehicle(level(), state.build);
    if (!car) { toast('先放零件再发射'); return; }""",
"""  function launch() {
    const chk = RAP.canLaunch(state.build);
    if (!chk.ok) {
      const msg = { empty: '先放零件再发射', frame: '至少要有一块木框', wheel: '至少要有一个轮子',
                    pig: '车是空的：把小猪拖进木框里' }[chk.reason] || chk.reason;
      toast(msg);
      SFX.deny();
      return;
    }
    const car = RAP.buildVehicle(level(), state.build);""")
p.write_text(t, encoding="utf-8")
print("index.html: 发射守卫")

# 3) 用例：build_l1 里补小猪；再加一条守卫用例
c = pathlib.Path("tools/make_cases.py")
s = c.read_text(encoding="utf-8")
s = s.replace("""def build_l1(t=0.3, with_wheels=True):
    ev = [enter(t, 1)]
    t += 0.3
    t = place(t, ev, "wood_frame", L1_FRAMES)
    if with_wheels:
        t = place(t, ev, "wood_wheel", L1_WHEELS)
    return ev, t""",
"""def build_l1(t=0.3, with_wheels=True, with_pig=True):
    ev = [enter(t, 1)]
    t += 0.3
    t = place(t, ev, "wood_frame", L1_FRAMES)
    if with_wheels:
        t = place(t, ev, "wood_wheel", L1_WHEELS)
    if with_pig:
        t = place(t, ev, "pig", [(4, 2)])      # 小猪塞进中空木框
    return ev, t""")
s = s.replace("""# T01 boot""",
"""# T16 发射守卫：没放小猪不许发射
ev = [enter(0.3, 1)]
t = 0.6
t = place(t, ev, "wood_frame", L1_FRAMES)
t = place(t, ev, "wood_wheel", L1_WHEELS)
ev.append(click(t, "LaunchButton"))
files["t16-pig-guard.json"] = case("t16-pig-guard", ev, [
    log(2.2, "launch_blocked reason=pig"),
])

# T01 boot""")
c.write_text(s, encoding="utf-8")
print("make_cases.py: 补小猪 + 守卫用例")

# 4) 自检加一条
k = pathlib.Path("prototype/check_html_logic.js")
q = k.read_text(encoding="utf-8")
q = q.replace("""// ---------------- 交互键上限 ----------------""",
"""// ---------------- 发射守卫 ----------------
{
  RAP.resetParams();
  const lv = byId['1-1'];
  const b = RAP.newBuild();
  RAP.tryPlace(lv, b, 'wood_frame', 4, 2);
  RAP.tryPlace(lv, b, 'wood_wheel', 5, 2);
  const noPig = RAP.canLaunch(b);
  ok('没放小猪不许发射（reason=pig）', !noPig.ok && noPig.reason === 'pig', JSON.stringify(noPig));
  RAP.tryPlace(lv, b, 'pig', 4, 2);
  const withPig = RAP.canLaunch(b);
  ok('木框里塞了小猪就能发射', withPig.ok, JSON.stringify(withPig));
}

// ---------------- 交互键上限 ----------------""")
k.write_text(q, encoding="utf-8")
print("自检：守卫两条")
