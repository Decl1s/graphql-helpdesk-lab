import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { listen } from '../src/app.js';

// Я вычисляю корень относительно файла скрипта. Он не зависит от текущей папки терминала.
const root = fileURLToPath(new URL('../', import.meta.url));
// Я запускаю одну полную коллекцию на отдельном временном стенде.
export async function runCollection({ trainingBug = false, reportName = 'regression' } = {}) {
  // Я не передаю port: операционная система выбирает свободный порт. Данные этого экземпляра независимы.
  const app = await listen({ trainingBug });
  try {
    // Я создаю reports при необходимости. recursive разрешает повторное использование папки.
    await mkdir(resolve(root, 'reports'), { recursive: true });
    // Я запускаю ту же коллекцию, которую открываю в Bruno Desktop, без подмены её проверок.
    // Я беру Bruno CLI из локальных зависимостей: глобально установленный bru мне не нужен.
    const cli = resolve(root, 'node_modules/@usebruno/cli/bin/bru.js');
    // Я передаю аргументы как массив без shell. Подменяю только baseUrl; запросы и Assert сохраняю.
    const args = [cli, 'run', '--env', 'Local', '--env-var', `baseUrl=${app.baseUrl}`, '--noproxy', '--sandbox', 'safe',
      // Я сохраняю JSON для машинного анализа, HTML для просмотра и JUnit для совместимых систем отчётов.
      '--reporter-json', resolve(root, `reports/${reportName}.json`),
      '--reporter-html', resolve(root, `reports/${reportName}.html`),
      '--reporter-junit', resolve(root, `reports/${reportName}.xml`)];
    // Я жду завершения отдельного процесса Bruno. Его код показывает итог проверок.
    const code = await new Promise((done, reject) => {
      // Я использую тот же Node, которым запущен скрипт. inherit показывает вывод Bruno в терминале.
      const child = spawn(process.execPath, args, { cwd: resolve(root, 'collection'), stdio: 'inherit' });
      // Я ограничиваю зависший запуск минутой. При обычном завершении очищаю таймер.
      const timer = setTimeout(() => { child.kill(); reject(new Error('Я остановил коллекцию после 60 секунд ожидания')); }, 60_000);
      // Я отличаю невозможность запустить процесс от красного теста коллекции.
      child.once('error', err => { clearTimeout(timer); reject(err); });
      // Я получаю exit code процесса. При отсутствии кода считаю выполнение неуспешным.
      child.once('exit', code => { clearTimeout(timer); done(code ?? 1); });
    });
    // Я читаю уже записанный JSON-отчёт. Здесь я не изменяю результаты Assert.
    const report = JSON.parse(await readFile(resolve(root, `reports/${reportName}.json`), 'utf8'));
    return { code, report };
  // Я закрываю временный сервер и при успехе, и при исключении внутри try.
  } finally { await app.close(); }
}

// Я выполняю этот блок при прямом запуске файла; импорт из ci.js не запускает demo второй раз.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--training-bug')) throw new Error('Я поддерживаю только --training-bug');
  const result = await runCollection({ trainingBug: args.includes('--training-bug'), reportName: args.length ? 'training-bug' : 'regression' });
  // Я передаю итог Bruno наружу: автоматизация видит ненулевой код на красной коллекции.
  process.exitCode = result.code;
}
