import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { listen } from '../src/app.js';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function runCollection({ trainingBug = false, reportName = 'regression' } = {}) {
  const app = await listen({ trainingBug });
  try {
    await mkdir(resolve(root, 'reports'), { recursive: true });
    // Я запускаю ту же коллекцию, которую открываю в Bruno Desktop, без подмены её проверок.
    const cli = resolve(root, 'node_modules/@usebruno/cli/bin/bru.js');
    const args = [cli, 'run', '--env', 'Local', '--env-var', `baseUrl=${app.baseUrl}`, '--noproxy', '--sandbox', 'safe',
      '--reporter-json', resolve(root, `reports/${reportName}.json`),
      '--reporter-html', resolve(root, `reports/${reportName}.html`),
      '--reporter-junit', resolve(root, `reports/${reportName}.xml`)];
    const code = await new Promise((done, reject) => {
      const child = spawn(process.execPath, args, { cwd: resolve(root, 'collection'), stdio: 'inherit' });
      const timer = setTimeout(() => { child.kill(); reject(new Error('Я остановил коллекцию после 60 секунд ожидания')); }, 60_000);
      child.once('error', err => { clearTimeout(timer); reject(err); });
      child.once('exit', code => { clearTimeout(timer); done(code ?? 1); });
    });
    const report = JSON.parse(await readFile(resolve(root, `reports/${reportName}.json`), 'utf8'));
    return { code, report };
  } finally { await app.close(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--training-bug')) throw new Error('Я поддерживаю только --training-bug');
  const result = await runCollection({ trainingBug: args.includes('--training-bug'), reportName: args.length ? 'training-bug' : 'regression' });
  process.exitCode = result.code;
}
