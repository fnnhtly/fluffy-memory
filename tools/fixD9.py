"""把"地面摩擦"加到 T 面板里（0~8 连续可调），并写清它的代价。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

old = """  const SLIDERS = [
    ['gravity', '重力 m/s²', 6, 30, 0.5],"""
new = """  const SLIDERS = [
    ['groundFriction', '地面摩擦（越大越粘）', 0, 8, 0.25],
    ['chassisGrip', '木框静摩擦系数', 0, 1.5, 0.05],
    ['groundGrip', '轮子抓地倍率', 0.5, 4, 0.1],
    ['gravity', '重力 m/s²', 6, 30, 0.5],"""
assert old in t
t = t.replace(old, new)

t = t.replace("<div class=\"note\">改完直接发射即可试手感。当前值会显示在建造界面 HUD 上。</div>",
              "<div class=\"note\">地面摩擦调到 2~3 会明显变粘，但靠惯性滑的关卡（1-1/1-2/1-5）会走不远 —— "
              "想两者都要就调 1.0 左右。改完直接发射试。</div>")
p.write_text(t, encoding="utf-8")
print("参数面板加入摩擦滑杆")
