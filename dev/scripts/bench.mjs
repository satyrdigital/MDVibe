// Startup / render / memory benchmark for a built MDVibe.exe (Windows).
//   node dev/scripts/bench.mjs [path\to\MDVibe.exe]
// Generates test documents (100 KB … 10 MB) in temp/bench, launches the app
// for each with MDVIBE_BENCH_FILE / MDVIBE_BENCH_EXIT, and measures memory of
// one instance (app process + its WebView2 processes) for a typical README.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const exe = process.argv[2] ?? path.join(root, 'dev', 'app', 'src-tauri', 'target', 'release', 'MDVibe.exe');
const dir = path.join(root, 'temp', 'bench');
fs.mkdirSync(dir, { recursive: true });

const sample = fs.readFileSync(path.join(root, 'dev', 'samples', 'feature-tour.md'), 'utf8');
function makeDoc(bytes) {
  const parts = [];
  let size = 0;
  let i = 0;
  while (size < bytes) {
    const chunk = `\n## Section ${i}\n\n${sample.replace(/^# .*$/m, '')}\n`;
    parts.push(chunk);
    size += Buffer.byteLength(chunk);
    i++;
  }
  return `# Benchmark document\n${parts.join('')}`;
}

const docs = [
  ['readme', 2_000],
  ['100kb', 100_000],
  ['1mb', 1_000_000],
  ['5mb', 5_000_000],
  ['10mb', 10_000_000],
];
for (const [name, bytes] of docs) {
  const file = path.join(dir, `${name}.md`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, name === 'readme' ? sample : makeDoc(bytes));
}

const results = path.join(dir, 'results.jsonl');
function run(doc, extraEnv = {}) {
  fs.rmSync(results, { force: true });
  execFileSync(exe, ['--', path.join(dir, `${doc}.md`)], {
    env: { ...process.env, MDVIBE_BENCH_FILE: results, MDVIBE_BENCH_EXIT: '1', ...extraEnv },
    timeout: 120_000,
  });
  const line = fs.readFileSync(results, 'utf8').trim().split('\n').pop();
  return JSON.parse(line);
}

const rows = [];
const cold = run('readme');
rows.push({ case: 'README, first start (cold-ish)', ...cold });
for (let i = 0; i < 3; i++) rows.push({ case: `README, warm #${i + 1}`, ...run('readme') });
for (const [name] of docs.slice(1)) rows.push({ case: `${name} document`, ...run(name) });

// Memory of one instance, measured after the document is displayed.
function memoryOf(pid) {
  const ps = `
    $all = Get-CimInstance Win32_Process
    $ids = @(${pid}); $added = $true
    while ($added) { $added = $false
      foreach ($p in $all) { if ($ids -contains $p.ParentProcessId -and -not ($ids -contains $p.ProcessId)) { $ids += $p.ProcessId; $added = $true } } }
    $procs = $all | Where-Object { $ids -contains $_.ProcessId }
    $app = ($procs | Where-Object { $_.ProcessId -eq ${pid} }).WorkingSetSize
    $total = ($procs | Measure-Object WorkingSetSize -Sum).Sum
    $priv = 0; foreach ($p in $procs) { $priv += (Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue).PrivateMemorySize64 }
    "{0};{1};{2};{3}" -f $app, $total, $priv, $procs.Count`;
  const out = execFileSync('powershell', ['-NoProfile', '-Command', ps]).toString().trim();
  const [app, total, priv, count] = out.split(';').map(Number);
  return { appMB: +(app / 1048576).toFixed(1), treeMB: +(total / 1048576).toFixed(1), privateMB: +(priv / 1048576).toFixed(1), processes: count };
}

const child = spawn(exe, ['--', path.join(dir, 'readme.md')], { detached: false, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 4000));
const mem = memoryOf(child.pid);
child.kill();

console.log('\nTiming (ms): startup = process start → first paint; render = read + parse + DOM');
console.table(rows.map((r) => ({ case: r.case, startupMs: r.startupMs, renderMs: Math.round(r.renderMs), bytes: r.bytes })));
console.log('Memory of one instance with a README:', mem);
fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({ rows, mem, exe, date: new Date().toISOString() }, null, 2));
