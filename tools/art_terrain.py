"""画质第一轮：把地形/丛林/天空重做成"有体积感"的石头世界。

参考视频的观感来源：**大块不规则石头（带亮面+暗面+黑缝）**、**多层剪影丛林**、
**柔和的天空 + 云**。之前是平涂砖纹，所以看着像半成品。

改动：
1. 石头：用"确定性伪随机 + 分层"生成不规则石块多边形，每块带亮面/暗面/黑描边
2. 丛林：三层剪影（远/中/近），每层不同明度 + 树冠用多个圆叠出蓬松感
3. 天空：加云带 + 地平线光晕
4. 草皮：两层（亮草 + 暗草边）+ 零星草叶
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# ---------- 替换地形绘制段（从"地形：沿 surfaceY"到冰面结束）----------
s0 = t.find("    // 地形：沿 surfaceY 采样成折线 → 一条多边形填到底")
s1 = t.find("  }\n\n  function drawGrid() {", s0)
assert s0 > 0 and s1 > s0, "terrain block not found"

new_terrain = '''    // ---------- 地形：折线采样 ----------
    const leftW = cam.x - DW / 2 / s - 2, rightW = cam.x + DW / 2 / s + 2;
    const stepW = 5 / s;
    const pts = [];
    for (let x = leftW; x <= rightW; x += stepW) pts.push([x, ter.surfaceY(x)]);

    function traceTerrain(extraBottom) {
      ctx.beginPath();
      ctx.moveTo(toX(pts[0][0]), toY(pts[0][1]));
      for (let i = 1; i < pts.length; i++) ctx.lineTo(toX(pts[i][0]), toY(pts[i][1]));
      ctx.lineTo(toX(pts[pts.length - 1][0]), DH + (extraBottom || 40));
      ctx.lineTo(toX(pts[0][0]), DH + (extraBottom || 40));
      ctx.closePath();
    }

    // 底色（深石头）
    traceTerrain();
    const rockDeep = ctx.createLinearGradient(0, toY(cam.y), 0, DH);
    rockDeep.addColorStop(0, '#3d4a56');
    rockDeep.addColorStop(1, '#2a3641');
    ctx.fillStyle = rockDeep; ctx.fill();

    // ---------- 石块：确定性伪随机，不规则多边形 ----------
    ctx.save();
    traceTerrain();
    ctx.clip();
    function hash(a, b) {
      let h = (a * 374761393 + b * 668265263) & 0x7fffffff;
      h = (h ^ (h >> 13)) * 1274126177 & 0x7fffffff;
      return ((h ^ (h >> 16)) & 0xffff) / 0xffff;
    }
    const stoneW = 46 * cam.zoom, stoneH = 30 * cam.zoom;
    const baseY = toY(cam.y) + 20;
    const colsN = Math.ceil(DW / stoneW) + 2;
    const rowsN = Math.ceil((DH - baseY) / stoneH) + 3;
    for (let row = 0; row < rowsN; row++) {
      for (let col = 0; col < colsN; col++) {
        const ox = (col - 0.5) * stoneW + (row % 2) * stoneW * 0.5;
        const oy = baseY + row * stoneH;
        const jx = (hash(col, row) - 0.5) * stoneW * 0.28;
        const jy = (hash(col + 99, row + 7) - 0.5) * stoneH * 0.28;
        const cx2 = ox + jx, cy2 = oy + jy;
        const rw = stoneW * (0.42 + hash(col + 3, row + 11) * 0.16);
        const rh = stoneH * (0.40 + hash(col + 5, row + 13) * 0.16);
        // 不规则六边形
        const poly = [];
        const N = 6;
        for (let k = 0; k < N; k++) {
          const a = (k / N) * Math.PI * 2 + hash(col + k, row + k) * 0.35;
          const rr = 1 + (hash(col * 7 + k, row * 3 + k) - 0.5) * 0.22;
          poly.push([cx2 + Math.cos(a) * rw * rr, cy2 + Math.sin(a) * rh * rr]);
        }
        // 石块主体（上亮下暗）
        ctx.beginPath();
        poly.forEach((pt, k) => k === 0 ? ctx.moveTo(pt[0], pt[1]) : ctx.lineTo(pt[0], pt[1]));
        ctx.closePath();
        ctx.fillStyle = row < 2 ? '#97a4b2' : '#7a8794';
        ctx.fill();
        // 亮面：往左上偏移一小块
        ctx.beginPath();
        poly.slice(0, 4).forEach((pt, k) => {
          const px2 = pt[0] - rw * 0.06, py2 = pt[1] - rh * 0.1;
          k === 0 ? ctx.moveTo(px2, py2) : ctx.lineTo(px2, py2);
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill();
        // 黑缝
        ctx.strokeStyle = 'rgba(16,24,32,.55)';
        ctx.lineWidth = Math.max(1, 2.2 * cam.zoom);
        ctx.stroke();
        // 底部阴影
        ctx.beginPath();
        ctx.ellipse(cx2, cy2 + rh * 0.75, rw * 0.62, rh * 0.20, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(10,16,22,.22)'; ctx.fill();
      }
    }
    ctx.restore();

    // 地表材质带
    function band(color, width, offset) {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const x = toX(pts[i][0]), y = toY(pts[i][1]) + offset;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.stroke();
    }
    // 草皮：暗边 → 亮草 → 高光 → 草叶
    band('rgba(18,26,22,.95)', 16 * cam.zoom, 13 * cam.zoom);   // 草地整体暗边
    band('#4f9e3c', 15 * cam.zoom, 6 * cam.zoom);               // 暗草
    band('#79c94f', 12 * cam.zoom, 1 * cam.zoom);               // 亮草
    band('#a6e070', 5 * cam.zoom, -2 * cam.zoom);               // 顶部高光
    // 零星草叶
    ctx.save();
    ctx.strokeStyle = '#5faa42'; ctx.lineWidth = 2.2 * cam.zoom; ctx.lineCap = 'round';
    for (let i = 0; i < pts.length; i += 3) {
      const wx = pts[i][0];
      const hh = hash(Math.floor(wx * 3), 17);
      if (hh > 0.55) continue;
      const x = toX(wx), y = toY(pts[i][1]) - 2 * cam.zoom;
      const len = (5 + hh * 10) * cam.zoom;
      const lean = (hash(Math.floor(wx * 5), 31) - 0.5) * 6 * cam.zoom;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + lean, y - len * 0.6, x + lean * 1.6, y - len);
      ctx.stroke();
    }
    ctx.restore();

    // 冰面
    ctx.save();
    for (let i = 0; i < pts.length; i++) {
      if (ter.material[Math.max(0, Math.min(ter.cols - 1, Math.floor(pts[i][0])))] !== 'ice') continue;
      const x0 = toX(pts[i][0]);
      const wpx = stepW * s + 1.5;
      ctx.fillStyle = 'rgba(176,232,246,.92)';
      ctx.fillRect(x0 - wpx / 2, toY(pts[i][1]) - 1 * cam.zoom, wpx, 7 * cam.zoom);
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillRect(x0 - wpx / 2, toY(pts[i][1]) - 1 * cam.zoom, wpx, 2 * cam.zoom);
    }
    ctx.restore();

'''
t = t[:s0] + new_terrain + t[s1:]
p.write_text(t, encoding="utf-8")
print("地形重做完成")
