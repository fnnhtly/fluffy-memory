"""biome 渲染（分步、每步验证，避免半途异常导致整个文件白改）。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")
orig = t


def sub(old, new, tag):
    global t
    if old not in t:
        print("  MISS:", tag)
        return False
    t = t.replace(old, new, 1)
    print("  ok:", tag)
    return True


# ---- 1) 替换旧 PAL 定义（从注释到 const PAL 的整段）----
i = t.find("    // ---------- 按本关主材质选配色（洞窟/原野/冰原）----------")
if i < 0:
    i = t.find("const PAL = iceRatio")
    # 往前找到该行的缩进起点
    i = t.rfind("\n", 0, i) + 1
j = t.find("\n\n", i)
if i >= 0 and j > i:
    new_pal = """    // ---------- 按关卡 biome 选视觉地貌（纯美术，不影响物理）----------
    const BIOMES = {
      field: { rock: [96, 112, 120], grass: '#79c94f', grass2: '#4f9e3c', grass3: '#a6e070',
        edge: '#12201a', skyTop: '#8FC4E0', skyMid: '#CFE6D8', skyLow: '#F2F0C0',
        hill: '#6E93A6', jungle: ['#3f7f5c', '#2f6b4a', '#22503a'], cave: false },
      canyon: { rock: [186, 122, 78], grass: '#d8a24f', grass2: '#a8763a', grass3: '#f0cc84',
        edge: '#4a2a16', skyTop: '#E8A96B', skyMid: '#F4D8A8', skyLow: '#FBF0D2',
        hill: '#B07A5A', jungle: ['#7d5a3a', '#63452c', '#4a3320'], cave: false },
      cave: { rock: [58, 74, 84], grass: '#4e7a52', grass2: '#33543a', grass3: '#6f9e6a',
        edge: '#08110f', skyTop: '#0d1a22', skyMid: '#132530', skyLow: '#1b3340',
        hill: '#122530', jungle: ['#15302a', '#102420', '#0b1a17'], cave: true },
      ice: { rock: [150, 178, 198], grass: '#cfeef8', grass2: '#9ed4e8', grass3: '#f0ffff',
        edge: '#4a7286', skyTop: '#9FCBE8', skyMid: '#D8EEF8', skyLow: '#F4FCFF',
        hill: '#8FB6CC', jungle: ['#7FA8BE', '#6B95AC', '#5A8199'], cave: false },
      dusk: { rock: [96, 86, 108], grass: '#7a6a4a', grass2: '#544832', grass3: '#a89468',
        edge: '#1a1420', skyTop: '#3B3560', skyMid: '#9A6A72', skyLow: '#E8A870',
        hill: '#5A4A6A', jungle: ['#2E3A42', '#25303a', '#1C2630'], cave: false }
    };
    const PAL = BIOMES[(level() && level().biome) || 'field'] || BIOMES.field;
    const CAVE = PAL.cave;"""
    t = t[:i] + new_pal + t[j:]
    print("  ok: PAL 换成 BIOMES")
else:
    print("  MISS: PAL 段落")

# ---- 2) 天空 ----
sub("const g = ctx.createLinearGradient(0, 0, 0, DH * 0.62);", "const g = ctx.createLinearGradient(0, 0, 0, DH * (CAVE ? 0.8 : 0.62));", "天空范围")
sub("g.addColorStop(0, COL.skyTop);", "g.addColorStop(0, PAL.skyTop);", "天空上")
sub("g.addColorStop(0.45, COL.skyMid);", "g.addColorStop(0.45, PAL.skyMid);", "天空中")
sub("g.addColorStop(1, COL.skyLow);", "g.addColorStop(1, PAL.skyLow);", "天空下")

# ---- 3) 云 / 钟乳石 ----
clouds = "    cloud(DW * 0.16, 120, 1.25, 0.88);"
if clouds in t:
    block = """    if (!CAVE) {
      cloud(DW * 0.16, 120, 1.25, 0.88);
      cloud(DW * 0.52, 78, 1.55, 0.8);
      cloud(DW * 0.86, 132, 1.05, 0.82);
      cloud(DW * 0.36, 190, 0.85, 0.6);
    } else {
      // 洞窟：顶部钟乳石 + 强暗角
      ctx.fillStyle = '#0a141a';
      for (let ci = 0; ci < 14; ci++) {
        const bx = (ci / 13) * DW + ((ci * 37) % 40) - 20;
        const w2 = 26 + ((ci * 53) % 30);
        const h2 = 60 + ((ci * 71) % 90);
        ctx.beginPath();
        ctx.moveTo(bx - w2 / 2, 0); ctx.lineTo(bx + w2 / 2, 0);
        ctx.lineTo(bx + ((ci % 3) - 1) * 8, h2);
        ctx.closePath(); ctx.fill();
      }
      const caveV = ctx.createRadialGradient(DW / 2, DH * 0.62, DH * 0.2, DW / 2, DH * 0.62, DW * 0.7);
      caveV.addColorStop(0, 'rgba(0,0,0,0)');
      caveV.addColorStop(1, 'rgba(0,0,0,.55)');
      ctx.fillStyle = caveV; ctx.fillRect(0, 0, DW, DH);
    }"""
    old4 = """    cloud(DW * 0.16, 120, 1.25, 0.88);
    cloud(DW * 0.52, 78, 1.55, 0.8);
    cloud(DW * 0.86, 132, 1.05, 0.82);
    cloud(DW * 0.36, 190, 0.85, 0.6);"""
    sub(old4, block, "云/钟乳石")

# ---- 4) 远山/丛林 ----
sub("ctx.fillStyle = COL.hillFar;", "ctx.fillStyle = PAL.hill;", "远山色")
sub("canopy(horizonY + 34, 42, 0, '#3f7f5c', 0.9, false);", "canopy(horizonY + 34, 42, 0, PAL.jungle[0], 0.9, false);", "远丛林")
sub("canopy(horizonY + 62, 50, 6, '#2f6b4a', 0.96, false);", "canopy(horizonY + 62, 50, 6, PAL.jungle[1], 0.96, false);", "中丛林")
sub("canopy(horizonY + 96, 58, 10, '#22503a', 1, true);", "canopy(horizonY + 96, 58, 10, PAL.jungle[2], 1, true);", "近丛林")
sub("ctx.strokeStyle = '#16382a'; ctx.lineWidth = 6 * scale; ctx.lineCap = 'round';",
    "ctx.strokeStyle = PAL.jungle[2]; ctx.lineWidth = 6 * scale; ctx.lineCap = 'round';", "棕榈杆")
sub("ctx.strokeStyle = '#1c4432'; ctx.lineWidth = 9 * scale;",
    "ctx.strokeStyle = PAL.jungle[1]; ctx.lineWidth = 9 * scale;", "棕榈叶")

# ---- 5) 远景地面 ----
sub("farGround.addColorStop(0.28, 'rgba(140,170,182,.75)');", "farGround.addColorStop(0.28, PAL.hill);", "远景地1")
sub("farGround.addColorStop(0.5, '#6E97A4');", "farGround.addColorStop(0.5, PAL.hill);", "远景地2")
sub("farGround.addColorStop(1, '#3E6B5C');", "farGround.addColorStop(1, PAL.jungle[1]);", "远景地3")

if t != orig:
    p.write_text(t, encoding="utf-8")
    print("已写入")
else:
    print("!! 没有变化")
