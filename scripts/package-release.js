import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { zipSync, unzipSync } from 'fflate';

// Я вычисляю корень по расположению скрипта. Данные из соседних проектов я не обхожу.
export const root = fileURLToPath(new URL('../', import.meta.url));
// Я беру только имена из SOURCE_FILES.txt. Наличие файла в папке само по себе не разрешает публикацию.
export async function sourceFiles() {
  const files = (await readFile(resolve(root, 'SOURCE_FILES.txt'), 'utf8')).trim().split('\n');
  // Я не допускаю повтор одного пути в allowlist.
  if (new Set(files).size !== files.length) throw new Error('Я обнаружил дубликат в списке исходников');
  const result = {};
  for (const name of files) {
    // Я отклоняю выход за корень и папки с окружением, отчётами или установленными пакетами.
    if (!/^[a-zA-Z0-9_.\-/]+$/.test(name) || name.split('/').includes('..') || name.startsWith('/') || /(^|\/)(node_modules|reports|dist|\.git)(\/|$)|(^|\/)\.env/.test(name)) throw new Error(`Я отклонил путь: ${name}`);
    const path = resolve(root, name);
    // Я разрешаю обычные файлы; символьную ссылку вместо файла отклоняю.
    if (!(await lstat(path)).isFile()) throw new Error(`Я ожидаю обычный файл: ${name}`);
    const content = await readFile(path);
    const text = content.toString('utf8');
    // Я проверяю UTF-8: в source-only архив не должен попасть произвольный бинарный файл.
    if (!Buffer.from(text).equals(content)) throw new Error(`Я ожидаю UTF-8: ${name}`);
    // Я ищу несколько типичных признаков контакта, личного пути и секрета. Это дополнительный фильтр, не гарантия поиска любого секрета.
    if (/\/home\/|[A-Z]:\\Users\\|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20}/i.test(text)) throw new Error(`Я обнаружил личный путь, контакт или секрет: ${name}`);
    result[name] = content;
  }
  return result;
}
// Я упаковываю только уже прочитанный разрешённый набор.
export async function packageRelease() {
  const files = await sourceFiles();
  const pkg = JSON.parse(files['package.json']);
  const name = `${pkg.name}-${pkg.version}-source.zip`;
  // Я помещаю всё в одну верхнюю папку архива, чтобы распаковка не разбрасывала файлы.
  const prefix = `${pkg.name}-${pkg.version}/`;
  // Я фиксирую время файлов в ZIP. Это служебная метка архива, а не подделка даты Git-коммита.
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([path, bytes]) => [prefix + path, [bytes, { mtime: new Date(2026, 0, 1) }]])), { level: 6 });
  // Я распаковываю полученный ZIP в память и сравниваю каждый файл с исходником.
  const extracted = unzipSync(zip);
  if (Object.keys(extracted).length !== Object.keys(files).length) throw new Error('Я получил неверное число файлов в ZIP');
  for (const [path, bytes] of Object.entries(files)) if (!Buffer.from(extracted[prefix + path]).equals(bytes)) throw new Error(`Я получил неверное содержимое ZIP: ${path}`);
  // Я вычисляю SHA-256 всего архива, чтобы проверить его после скачивания.
  const sha256 = createHash('sha256').update(zip).digest('hex');
  // Я сохраняю результат в dist, который исключён из исходников.
  await mkdir(resolve(root, 'dist'), { recursive: true });
  await writeFile(resolve(root, 'dist', name), zip);
  await writeFile(resolve(root, 'dist', 'SHA256SUMS'), `${sha256}  ${name}\n`);
  return { archive: name, sha256, count: Object.keys(files).length };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(await packageRelease());
