"""按 biome 字段渲染 5 套视觉地貌（只改美术，不动物理材质）。

- field  原野：亮白天 + 绿丛林 + 明快草皮
- canyon 峡谷：暖橙岩壁 + 稀疏灌木 + 高对比
- cave   洞窟：暗色天顶 + 钟乳石剪影 + 深青岩 + 苔藓
- ice    冰原：冷蓝 + 雪原 + 冰晶
- dusk   黄昏：紫橙天 + 深色剪影 + 暖光边
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# ---------- 1) biome 配色表（替换原 PAL）----------
old_pal = t[t.find("    // ---------- 按本关主材质选配色（洞窟/原野/冰原）----------"):]
old_pal = old_pal[:old_pal.find("\n\n") + 1]
new_pal = '''    // ---------- 按关卡的 biome 选视觉地貌（纯美术，不影响物理）----------
    const BIOMES = {
      field: {
        rock: [96, 112, 120], grass: '#79c94f', grass2: '#4f9e3c', grass3: '#a6e070',
        edge: '#12201a', skyTop: '#8FC4E0', skyMid: '#CFE6D8', skyLow: '#F2F0C0',
        hill: '#6E93A6', jungle: ['#3f7f5c', '#2f6b4a', '#22503a'], fog: '235,245,235', cave: false
      },
      canyon: {
        rock: [186, 122, 78], grass: '#d8a24f', grass2: '#a8763a', grass3: '#f0cc84',
        edge: '#4a2a16', skyTop: '#E8A96B', skyMid: '#F4D8A8', skyLow: '#FBF0D2',
        hill: '#B07A5A', jungle: ['#7d5a3a', '#63452c', '#4a3320'], fog: '250,230,200', cave: false
      },
      cave: {
        rock: [58, 74, 84], grass: '#4e7a52', grass2: '#33543a', grass3: '#6f9e6a',
        edge: '#08110f', skyTop: '#0d1a22', skyMid: '#132530', skyLow: '#1b3340',
        hill: '#122530', jungle: ['#15302a', '#102420', '#0b1a17'], fog: '120,180,170', cave: true
      },
      ice: {
        rock: [150, 178, 198], grass: '#cfeef8', grass2: '#9ed4e8', grass3: '#f0ffff',
        edge: '#4a7286', skyTop: '#9FCBE8', skyMid: '#D8EEF8', skyLow: '#F4FCFF',
        hill: '#8FB6CC', jungle: ['#7FA8BE', '#6B95AC', '#5A8199'], fog: '240,252,255', cave: false
      },
      dusk: {
        rock: [96, 86, 108], grass: '#7a6a4a', grass2: '#544832', grass3: '#a89468',
        edge: '#1a1420', skyTop: '#3B3560', skyMid: '#9A6A72', skyLow: '#E8A870',
        hill: '#5A4A6A', jungle: ['#2E3A42', '#25303a', '#1C2630'], fog: '240,190,160', cave: false
      }
    };
    const PAL = BIOMES[(level() && level().biome) || 'field'] || BIOMES.field;
    const CAVE = PAL.cave;
'''
t = t.replace(old_pal, new_pal + "\n")

# ---------- 2) 天空渐变用 PAL ----------
rep("""    const g = ctx.createLinearGradient(0, 0, 0, DH * 0.62);
    g.addColorStop(0, COL.skyTop);
    g.addColorStop(0.45, COL.skyMid);
    g.addColorStop(1, COL.skyLow);""",
"""    const g = ctx.createLinearGradient(0, 0, 0, DH * (CAVE ? 0.78 : 0.62));
    g.addColorStop(0, PAL.skyTop);
    g.addColorStop(0.45, PAL.skyMid);
    g.addColorStop(1, PAL.skyLow);""", "天空用 PAL")

# ---------- 3) 云：洞窟不画云，改画钟乳石 ----------
rep("""    cloud(DW * 0.16, 120, 1.25, 0.88);
    cloud(DW * 0.52, 78, 1.55, 0.8);
    cloud(DW * 0.86, 132, 1.05, 0.82);
    cloud(DW * 0.36, 190, 0.85, 0.6);""",
"""    if (!CAVE) {
      cloud(DW * 0.16, 120, 1.25, 0.88);
      cloud(DW * 0.52, 78, 1.55, 0.8);
      cloud(DW * 0.86, 132, 1.05, 0.82);
      cloud(DW * 0.36, 190, 0.85, 0.6);
    } else {
      // 洞窟：顶部钟乳石剪影
      ctx.fillStyle = '#0a141a';
      for (let i = 0; i < 14; i++) {
        const bx = (i / 13) * DW + ((i * 37) % 40) - 20;
        const w2 = 26 + ((i * 53) % 30);
        const h2 = 60 + ((i * 71) % 90);
        ctx.beginPath();
        ctx.moveTo(bx - w2 / 2, 0);
        ctx.lineTo(bx + w2 / 2, 0);
        ctx.lineTo(bx + ((i % 3) - 1) * 8, h2);
        ctx.closePath(); ctx.fill();
      }
      // 洞窟暗角
      const caveV = ctx.createRadialGradient(DW / 2, DH * 0.62, DH * 0.2, DW / 2, DH * 0.62, DW * 0.7);
      caveV.addColorStop(0, 'rgba(0,0,0,0)');
      caveV.addColorStop(1, 'rgba(0,0,0,.55)');
      ctx.fillStyle = caveV; ctx.fillRect(0, 0, DW, DH);
    }""", "云/钟乳石")

# ---------- 4) 远山与丛林用 PAL ----------
t = t.replace("    ctx.fillStyle = COL.hillFar;\n    for (let i = 0; i < 9; i++) {",
              "    ctx.fillStyle = PAL.hill;\n    for (let i = 0; i < 9; i++) {")
t = t.replace("canopy(horizonY + 34, 42, 0, '#3f7f5c', 0.9, false);",
              "canopy(horizonY + 34, 42, 0, PAL.jungle[0], 0.9, false);")
t = t.replace("canopy(horizonY + 62, 50, 6, '#2f6b4a', 0.96, false);",
              "canopy(horizonY + 62, 50, 6, PAL.jungle[1], 0.96, false);")
t = t.replace("canopy(horizonY + 96, 58, 10, '#22503a', 1, true);",
              "canopy(horizonY + 96, 58, 10, PAL.jungle[2], 1, true);")
t = t.replace("      ctx.strokeStyle = '#16382a'; ctx.lineWidth = 6 * scale; ctx.lineCap = 'round';",
              "      ctx.strokeStyle = PAL.jungle[2]; ctx.lineWidth = 6 * scale; ctx.lineCap = 'round';")
t = t.replace("      ctx.strokeStyle = '#1c4432'; ctx.lineWidth = 9 * scale;",
              "      ctx.strokeStyle = PAL.jungle[1]; ctx.lineWidth = 9 * scale;")

# 远景地面渐变用 PAL.hill
t = t.replace("""    const farGround = ctx.createLinearGradient(0, horizonY - 70, 0, horizonY + 120);
    farGround.addColorStop(0, 'rgba(196,216,222,0)');
    farGround.addColorStop(0.28, 'rgba(140,170,182,.75)');
    farGround.addColorStop(0.5, '#6E97A4');
    farGround.addColorStop(1, '#3E6B5C');""",
"""    const farGround = ctx.createLinearGradient(0, horizonY - 70, 0, horizonY + 120);
    farGround.addColorStop(0, 'rgba(196,216,222,0)');
    farGround.addColorStop(0.28, PAL.hill);
    farGround.addColorStop(0.5, PAL.hill);
    farGround.addColorStop(1, PAL.jungle[1]);""", "远景地面用 PAL")

p.write_text(t, encoding="utf-8")
print("biome 渲染完成")
