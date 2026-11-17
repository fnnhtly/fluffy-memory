/* 探针：`taskkill /PID <launcher> /T /F` 到底能不能带走 Edge 的真正浏览器进程？
 *
 * 现象（第 75 轮）：`%TEMP%` 里 1362 个 `edge*` 目录删不掉，
 * 因为目录被一个**还活着的** msedge 进程占着。
 * 而 killTree 明明报了 taskkill SUCCESS。
 *
 * 这个探针把三件事分开量：
 *   1. taskkill /T /F 之后，命令行里含我们 user-data-dir 的进程还剩几个；
 *   2. 那些残留进程能不能按 ProcessId 杀掉；
 *   3. 杀掉之后目录能不能删掉。
 */
const cp = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const dir = path.join(os.tmpdir(), 'edgeKillProbe-' + Date.now());

/* 列出**命令行里含这个目录**的 msedge 进程（PowerShell + CIM，避免 wmic 弃用）。 */
function pidsFor(dirPath) {
  const script =
    "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | " +
    "Where-Object { $_.CommandLine -and $_.CommandLine.Contains('" + dirPath + "') } | " +
    "ForEach-Object { $_.ProcessId }";
  const r = cp.spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', timeout: 30000 });
  return (r.stdout || '').trim().split(/\s+/).filter(Boolean).map(Number);
}

const t0 = Date.now();
const child = cp.spawn(EDGE, ['--headless=new', '--user-data-dir=' + dir,
  '--no-first-run', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
console.log('spawned launcher pid=' + child.pid + ' profile=' + path.basename(dir));

setTimeout(() => {
  const before = pidsFor(dir);
  console.log('1) 起来之后，带这个 profile 的进程：' + before.length + ' 个 → ' + before.join(','));

  cp.spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  console.log('   已执行 taskkill /PID ' + child.pid + ' /T /F');

  setTimeout(() => {
    const after = pidsFor(dir);
    console.log('2) taskkill 之后还剩：' + after.length + ' 个 → ' + after.join(','));

    /* 删不删得掉 */
    let gone = false;
    for (let i = 0; i < 3; i++) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
      if (!fs.existsSync(dir)) { gone = true; break; }
    }
    console.log('3) 此时目录删得掉吗：' + gone);

    /* 按 pid 把残留的全杀掉，再试一次 */
    after.forEach(p => cp.spawnSync('taskkill', ['/PID', String(p), '/T', '/F'], { stdio: 'ignore' }));
    setTimeout(() => {
      const after2 = pidsFor(dir);
      let gone2 = false;
      for (let i = 0; i < 3; i++) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
        if (!fs.existsSync(dir)) { gone2 = true; break; }
      }
      console.log('4) 按 pid 补杀之后剩：' + after2.length + ' 个；目录删得掉吗：' + gone2);
      console.log('总耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
      if (!gone2) console.log('   残留目录：' + dir);
      process.exit(0);
    }, 600);
  }, 800);
}, 2600);
