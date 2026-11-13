"""回到上一版"能通关"的摩擦基线，然后加一个**刹车**（按住 ↓/S 或点刹车钮），
让"摩擦感"变成玩家随时能按出来的东西，而不是把五关的物理都推到不可解。
"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")


def rep(a, b, why):
    global s
    assert a in s, "NOT FOUND: " + why
    s = s.replace(a, b)
    print("  ok:", why)


# ---------- 1) 摩擦回到可通关基线 ----------
rep("    rollResist: 0.16,", "    rollResist: 0.06,", "rollResist 0.06")
rep("var rollMu = slowWheel ? 0.30 : Params.rollResist;", "var rollMu = slowWheel ? 0.14 : Params.rollResist;", "低速滚阻 0.14")
rep("    wheelGrip: 1.4,", "    wheelGrip: 1.2,", "抓地 1.2")
rep("          var slowSpd = Math.hypot(car.vx, car.vy) < 5.0;", "          var slowSpd = Math.hypot(car.vx, car.vy) < 4.0;", "车壳低速阈 4")
rep("(noWheel ? 0.9 : (slowSpd ? 0.95 : 0.35))", "(noWheel ? 0.9 : (slowSpd ? 0.5 : 0.12))", "车壳摩擦")
rep("-vt2 * (noWheel ? 5 : (slowSpd ? 5.0 : 2.0))", "-vt2 * (noWheel ? 5 : (slowSpd ? 4.0 : 1.4))", "车壳增益")

# ---------- 2) 新增刹车 ----------
rep("    creepBrake: 2.5,", "    creepBrake: 2.5,\n    brakeGrip: 1.6,         // 刹车时轮子抓地倍率\n    brakeDecel: 9.0,        // 刹车减速度 m/s²", "刹车参数")

# 刹车状态位
rep("      pumpCharge: 0, pumpHeld: false",
    "      pumpCharge: 0, pumpHeld: false, braking: false", "刹车状态")

# 刹车时：轮子抓地拉满 + 强减速度
rep("          var mu = baseMu * w.def.grip * (ter.matAt(wp.x) === 'ice' ? w.def.iceGrip : 1) * Params.wheelGrip;",
    "          var mu = baseMu * w.def.grip * (ter.matAt(wp.x) === 'ice' ? w.def.iceGrip : 1) * Params.wheelGrip;\n"
    "          if (car.braking) mu *= Params.brakeGrip;", "刹车抓地")

rep("""      car.vx *= (1 - 0.025 * h);
      car.w *= (1 - 2.6 * h);""",
"""      car.vx *= (1 - 0.025 * h);
      car.w *= (1 - 2.6 * h);
      // 刹车：直接给一个反向减速度（轮胎咬死），低速时彻底停住
      if (car.braking) {
        var sb = Math.hypot(car.vx, car.vy);
        if (sb > 0.05) {
          var dvb = Math.min(sb, Params.brakeDecel * h);
          car.vx -= dvb * car.vx / sb;
          car.vy -= dvb * car.vy / sb * 0.4;
          car.w *= 0.85;
        }
      }""", "刹车减速度")

# 刹车 API
rep("  // n = 第几个\"颜色组\"（同色同类零件一起响应）",
"""  function setBrake(state, on) {
    if (state.phase !== 'run' || !state.car) return false;
    state.car.braking = !!on;
    if (on) log(state, 'brake on');
    return true;
  }

  // n = 第几个\"颜色组\"（同色同类零件一起响应）""", "setBrake")

rep("    createRun: createRun, step: step, stepLoose: stepLoose, damageCar: damageCar, pressInteract: pressInteract,",
    "    createRun: createRun, step: step, stepLoose: stepLoose, damageCar: damageCar, setBrake: setBrake, pressInteract: pressInteract,",
    "导出 setBrake")

g.write_text(s, encoding="utf-8")
print("game.js 完成")
