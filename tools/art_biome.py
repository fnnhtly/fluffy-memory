"""按关卡材质换地貌外观：mud / stone / ice 三套石头配色 + 草皮色 + 雾色。
参考视频里不同关的环境色调差别很大（洞窟是深青黑、沙滩是明亮黄绿）。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# 1) 在 drawWorld 开头读取本关材质，生成配色
anchor = "    // ---------- 地形：折线采样 ----------"
assert anchor in t
palette = '''    // ---------- 按本关主材质选配色（洞窟/原野/冰原）----------
    const matsList = (ter.material || []).slice(0, 12);
    const iceRatio = matsList.filter(m => m === 'ice').length / Math.max(1, matsList.length);
    const stoneRatio = matsList.filter(m => m === 'stone').length / Math.max(1, matsList.length);
    const PAL = iceRatio > 0.2
      ? { rock: [140, 168, 186], grass: '#cfeef8', grass2: '#a8dcee', grass3: '#ecfaff', edge: '#5f8fa3', sky: 'cold' }
      : stoneRatio > 0.35
        ? { rock: [78, 92, 100], grass: '#5f8f4c', grass2: '#3f6b38', grass3: '#8ec46a', edge: '#1e2f26', sky: 'dusk' }
        : { rock: [96, 112, 120], grass: '#79c94f', grass2: '#4f9e3c', grass3: '#a6e070', edge: '#12201a', sky: 'day' };

''' + anchor
t = t.replace(anchor, palette, 1)

# 2) 石头颜色改用 PAL.rock
t = t.replace(
    "        const l1 = Math.round(96 - depth * 40), g1 = Math.round(112 - depth * 40), b1 = Math.round(120 - depth * 38);",
    "        const l1 = Math.round(PAL.rock[0] - depth * 40),\n"
    "              g1 = Math.round(PAL.rock[1] - depth * 38),\n"
    "              b1 = Math.round(PAL.rock[2] - depth * 36);")

# 3) 草皮颜色改用 PAL
t = t.replace("    band('#4f9e3c', 15 * cam.zoom, 6 * cam.zoom);               // 暗草",
              "    band(PAL.grass2, 15 * cam.zoom, 6 * cam.zoom);              // 暗草")
t = t.replace("    band('#79c94f', 12 * cam.zoom, 1 * cam.zoom);               // 亮草",
              "    band(PAL.grass, 12 * cam.zoom, 1 * cam.zoom);               // 亮草")
t = t.replace("    band('#a6e070', 5 * cam.zoom, -2 * cam.zoom);               // 顶部高光",
              "    band(PAL.grass3, 5 * cam.zoom, -2 * cam.zoom);              // 顶部高光")
t = t.replace("    band('rgba(18,26,22,.95)', 16 * cam.zoom, 13 * cam.zoom);   // 草地整体暗边",
              "    band(PAL.edge, 16 * cam.zoom, 13 * cam.zoom);               // 草地整体暗边")

p.write_text(t, encoding="utf-8")
print("地貌配色完成")
