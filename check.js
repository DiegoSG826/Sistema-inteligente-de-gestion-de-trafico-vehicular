import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
let failures = 0, checked = 0;
for (const dir of ['.', 'public', 'scripts', 'tests']) {
  for (const file of readdirSync(dir)) {
    if (!/\.(?:js|mjs)$/.test(file)) continue;
    const filename = path.join(dir, file);
    const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
    checked++;
    if (result.status !== 0) { console.error(result.stderr); failures++; }
  }
}
const html = readFileSync('public/index.html', 'utf8');
for (const [, asset] of html.matchAll(/(?:src|href)="(\/[^"#]+)"/g)) {
  if (!existsSync(path.join('public', asset.slice(1)))) { console.error(`Missing asset ${asset}`); failures++; }
}
console.log(`${checked} archivos JavaScript revisados; ${failures} errores.`);
process.exitCode = failures ? 1 : 0;
