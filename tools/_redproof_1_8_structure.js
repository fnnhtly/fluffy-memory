/* 反向验证 test_1_8_structure.js 的 D 组（第 86 轮）。
 *
 * D 组现在是"最后三关平均通关率不到前五关一半"。要拆的是**关卡难度差异**：
 *   把 1-6 的终点挪回坡脚（col 15）→ 它变容易 → D 可能变红。
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

const P = 'levels/06.json';
const orig = fs.readFileSync(P, 'utf8');

function run() {
  let out = '';
  try {
    out = execFileSync('node', ['tools/test_1_8_structure.js'],
      { encoding: 'utf8', timeout: 900000 });
  } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const m = out.match(/ASSERTS (\d+) \/ (\d+)/);
  return {
    pass: m ? +m[1] : -1, total: m ? +m[2] : -1,
    fails: out.split('\n').filter(l => l.startsWith('✗')),
    log: out.split('\n').filter(l => /平均/.test(l))
  };
}

const base = run();
console.log('基线：' + base.pass + '/' + base.total);
base.log.forEach(l => console.log('  ' + l.trim()));

/* 把 1-6 的终点挪回坡脚（col 15）—— 那会让它变容易。
 * ⚠ 必须同时重建 prototype/levels.js：测试读的是那份生成物，
 * 只改 levels/06.json 不影响它（第一次跑就是这样"仍然全绿"的）。 */
const j = JSON.parse(orig);
j.goal = { col: 15 };
fs.writeFileSync(P, JSON.stringify(j, null, 1) + '\n', 'utf8');
try { execFileSync('node', ['tools/build_levels_js.js'], { encoding: 'utf8', timeout: 120000 }); }
catch (e) {}
const r = run();
fs.writeFileSync(P, orig, 'utf8');
try { execFileSync('node', ['tools/build_levels_js.js'], { encoding: 'utf8', timeout: 120000 }); }
catch (e) {}

const turned = r.pass < base.pass;
console.log('  把 1-6 终点挪回坡脚 → ' + (turned ? '变红 ✓' : '仍然全绿') +
  '  ' + r.pass + '/' + r.total);
r.log.forEach(l => console.log('    ' + l.trim()));
r.fails.slice(0, 3).forEach(l => console.log('    ' + l));
process.exit(turned ? 0 : 1);
